import type { LightClient, PublicTransaction, TxId } from '../../docs/api/public-api.js';
import { failure } from '../errors.js';
import {snapshot,ownBytes} from '../clients/owned-plumbing.js';
import {operation} from '../clients/light-chain-reads.js';
import {blockHash,txId} from '../primitives.js';
import type { attachWalletWorker } from './host.js';
import type { EnhancementRequest, EnhancementResult } from './session.js';

type Session = ReturnType<typeof attachWalletWorker>;
const unsupported = () => failure('METHOD_NOT_SUPPORTED', 'sync', 'configure', 'Enhancement request needs unsupported source evidence.');
const protocol = () => failure('PROTOCOL_MISMATCH', 'sync', 'sync', 'Enhancement response does not match the requested range.');
const limit = () => failure('RESOURCE_LIMIT', 'sync', 'configure', 'Enhancement transaction exceeds batch limit.');

/** One backend request. Only successful stream exhaustion completes address coverage. */
export async function applyEnhancement(session: Session, light: LightClient, revision: string,
  request: EnhancementRequest, signal?: AbortSignal): Promise<void> {
  const op = signal === undefined ? {} : { signal };
  const apply = async (result: EnhancementResult) => {
    revision = (await session.enhancement.apply({ revision, request, result, ...op })).revision;
  };
  if (request.kind !== 'address') {
    const transaction = await light.getTransaction({ txid: request.txid as TxId, ...op });
    if (transaction === null) { await apply({ status: 'notRecognized' }); return; }
    if (transaction.txid !== request.txid) throw protocol();
    const mined = transaction.observation.state === 'mined' ? transaction.observation.inclusion?.height : null;
    if (transaction.observation.state === 'mined' && mined === undefined) throw protocol();
    if (request.kind === 'enhancement') {
      if (transaction.raw.length > 2 * 1024 * 1024) throw limit();
      await apply({ transactions: [{ bytes: transaction.raw, minedHeight: mined ?? null }] });
    } else if (mined !== null && mined !== undefined) await apply({ status: 'mined', height: mined });
    else if (['mempool', 'offMainChain'].includes(transaction.observation.state)) await apply({ status: 'notInMainChain' });
    else throw protocol();
    return;
  }
  if(request.txStatus==='all'&&request.outputStatus==='unspent'&&request.endExclusive===null){await unspent(session,light,revision,request,signal);return;}
  if (request.txStatus !== 'mined' || request.outputStatus !== 'all' || request.endExclusive === null) throw unsupported();
  const asOfHeight = request.endExclusive - 1;
  let batch: { bytes: Uint8Array; minedHeight: number }[] = [], bytes = 0;
  const flush = async (complete: boolean) => {
    await apply({ transactions: batch, asOfHeight, complete });
    batch = []; bytes = 0;
    if (!complete) {
      const pending = await session.enhancement.requests(op);
      revision = pending.revision;
      return pending.requests.some(value => JSON.stringify(value) === JSON.stringify(request));
    }
    return false;
  };
  for await (const transaction of light.streamAddressTransactions({ address: request.address,
    fromHeight: request.start, toHeight: asOfHeight, ...op })) {
    const height = minedHeight(transaction);
    if (height < request.start || height >= request.endExclusive) throw protocol();
    if (transaction.raw.length > 2 * 1024 * 1024) throw limit();
    if (batch.length === 16 || bytes + transaction.raw.length > 2 * 1024 * 1024) {
      if (!await flush(false)) return; // Rust may have resolved the request by discovering its spend.
    }
    batch.push({ bytes: transaction.raw, minedHeight: height }); bytes += transaction.raw.length;
  }
  await flush(true);
}

function minedHeight(transaction: PublicTransaction): number {
  const height = transaction.observation.inclusion?.height;
  if (transaction.observation.state !== 'mined' || height === undefined || !Number.isInteger(height) || height < 0) throw protocol();
  return height;
}


/** A positive UTXO inventory does not prove absence or complete address history. */
async function unspent(session:Session,light:LightClient,revision:string,request:Extract<EnhancementRequest,{kind:'address'}>,signal?:AbortSignal){
  const pending=operation(signal),op={signal:pending.signal};
  const evidence=<T extends object>(value:T,keys:readonly string[]):T=>{try{return snapshot(value,keys);}catch{throw protocol();}};
  const point=(value:unknown)=>{try{const v=evidence(value as {height:number;hash:string;sourceId:string},['height','hash','sourceId','observedAt']);
    if(!Number.isInteger(v.height)||v.height<0||v.height>0xffffffff||typeof v.sourceId!=='string'||!v.sourceId.length||v.sourceId.length>256)throw protocol();
    return {height:v.height,hash:blockHash(v.hash),sourceId:v.sourceId};}catch{throw protocol();}};
  try{
    pending.check();const before=point(await pending.wait(light.getTip(op)));
    const local=await session.scan.state(op),block=await session.scan.block({height:before.height,...op});
    const nativeHash=before.hash.match(/../g)!.reverse().join('');
    if(local.revision!==revision||block.revision!==revision||local.tipHeight!==before.height||block.point?.height!==before.height||block.point.hash!==nativeHash)throw failure('RECOVERY_REQUIRED','sync','sync','Source tip is not the retained native chain point.');
    const response=evidence(await pending.wait(light.getAddressUtxos({addresses:[request.address],...op})),['items','tip','sourceId','observedAt']);
    if(response.sourceId!==before.sourceId||!Array.isArray(response.items))throw protocol();
    const count=Object.getOwnPropertyDescriptor(response.items,'length')?.value;if(!Number.isInteger(count)||count<0||count>1000)throw limit();
    if(response.tip!==null){const tip=evidence(response.tip,['height','hash']);if(tip.height!==before.height||tip.hash!==before.hash)throw protocol();}
    const seen=new Set<string>(),groups=new Map<string,{height:number|null;outputs:{outputIndex:number;script:Uint8Array;value:bigint}[]}>();let scripts=0;
    for(let i=0;i<count;i++){
      const field=Object.getOwnPropertyDescriptor(response.items,String(i));if(!field||!('value'in field))throw protocol();
      const item=evidence(field.value as typeof response.items[number],['txid','outputIndex','address','value','script','minedHeight']);
      let id;try{id=txId(item.txid);}catch{throw protocol();}
      if(item.address!==request.address||!Number.isInteger(item.outputIndex)||item.outputIndex<0||item.outputIndex>0xffffffff||typeof item.value!=='bigint'||item.value<0n)throw protocol();
      if(item.minedHeight!==null&&(!Number.isInteger(item.minedHeight)||item.minedHeight<0||item.minedHeight>before.height))throw protocol();
      const key=id+':'+item.outputIndex;if(seen.has(key))throw protocol();seen.add(key);
      const script=ownBytes(item.script,protocol,limit,Math.min(10000,2*1024*1024-scripts));scripts+=script.length;
      if(item.minedHeight!==null&&item.minedHeight<request.start)continue;
      const group:NonNullable<ReturnType<typeof groups.get>>=groups.get(id)??{height:item.minedHeight,outputs:[]};if(group.height!==item.minedHeight)throw protocol();
      group.outputs.push({outputIndex:item.outputIndex,script,value:item.value});groups.set(id,group);
    }
    let batch:{bytes:Uint8Array;minedHeight:number|null;unspentOutputs:{outputIndex:number;script:Uint8Array;value:bigint}[]}[]=[],bytes=0;
    const coherent=async()=>{const after=point(await pending.wait(light.getTip(op)));if(after.height!==before.height||after.hash!==before.hash||after.sourceId!==before.sourceId)throw protocol();};
    const flush=async(complete:boolean)=>{await coherent();pending.check();revision=(await session.enhancement.apply({revision,request,result:{transactions:batch,asOfHeight:before.height,asOfHash:nativeHash,complete},...op})).revision;batch=[];bytes=0;};
    for(const [id,group] of groups){
      const supplied=await pending.wait(light.getTransaction({txid:id as TxId,...op}));if(supplied===null)throw protocol();
      const transaction=evidence(supplied,['txid','raw','observation','sourceId','observedAt']);
      const observed=evidence(transaction.observation,['txid','state','inclusion','tip','priorInclusion','sourceId','observedAt']);
      if(transaction.txid!==id||transaction.sourceId!==before.sourceId||observed.txid!==id||observed.sourceId!==before.sourceId)throw protocol();
      const height=observed.state==='mined'?evidence(observed.inclusion!,['height','blockHash','confirmations']).height:null;
      if(!['mined','mempool'].includes(observed.state)||(observed.state==='mined'&&(height===null||!Number.isInteger(height)))||(observed.state==='mempool'&&observed.inclusion!==null)||height!==group.height)throw protocol();
      const raw=ownBytes(transaction.raw,protocol,limit,2*1024*1024),size=raw.length+group.outputs.reduce((n,output)=>n+output.script.length,0);if(size>2*1024*1024)throw limit();
      if(batch.length===16||bytes+size>2*1024*1024)await flush(false);
      batch.push({bytes:raw,minedHeight:group.height,unspentOutputs:group.outputs});bytes+=size;
    }
    await flush(true);
  }finally{pending.close();}
}
