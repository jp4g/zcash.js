import type {BroadcastReport,ChainPoint,LightClient,Network,PublicClient,TransactionObservation,TxId} from '../../docs/api/public-api.js';
import {networkBinding} from '../network.js';
import {lightClientBinding} from '../light.js';
import {publicClientBinding} from '../public.js';
import {snapshot,ownBytes} from '../clients/owned-plumbing.js';
import {operation} from '../clients/light-chain-reads.js';
import {failure,invalidArgument} from '../errors.js';
import {blockHash,txId} from '../primitives.js';
import {initialize} from '../runtime/lightwire-capsule.mjs';
const protocol=()=>failure('PROTOCOL_MISMATCH','observation','configure','Payment source returned inconsistent evidence.');
const mismatch=()=>failure('NETWORK_MISMATCH','observation','configure','Payment source network does not match the wallet.');
function field(object:object,key:string):unknown {
  for(let value:object|null=object,depth=0;value&&depth<16;value=Object.getPrototypeOf(value),depth++){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(descriptor){if(!('value'in descriptor))throw invalidArgument();return descriptor.value;}
  }
}
function point(value:ChainPoint):ChainPoint {
  const p=snapshot(value,['height','hash']);
  if(!Number.isInteger(p.height)||p.height<0||p.height>0xffffffff)throw protocol();
  try{return {height:p.height,hash:blockHash(p.hash)};}catch{throw protocol();}
}
function sourceId(value:unknown):string {if(typeof value!=='string'||!value.length||value.length>256)throw protocol();return value;}
const same=(a:ChainPoint,b:ChainPoint)=>a.height===b.height&&a.hash===b.hash;

/** Captured client methods; private route identity is never inferred from display sourceId. */
export class PaymentSource {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
  private readonly methods:Record<string,Function>={};
  private readonly bound:ReturnType<typeof networkBinding>;
  private readonly endpoint:string|null;
  private readonly protocolName:string;
  private readonly registered:boolean;
  constructor(private readonly client:PublicClient|LightClient,private readonly network:Network){
    if(!client||typeof client!=='object')throw invalidArgument();
    this.bound=networkBinding(network);
    const registered=publicClientBinding(client as PublicClient),light=lightClientBinding(client as LightClient);
    this.registered=Boolean(registered??light);
    const other=networkBinding((registered??light)?.network??field(client,'network') as Network);
    if(other.definition.binding!==this.bound.definition.binding)throw mismatch();
    this.endpoint=(registered??light)?.endpoint??null;this.protocolName=registered?'zcash-json-rpc/1':'lightwalletd-v0.5.0';
    for(const name of ['getTip','getTreeState','getTransaction','broadcastTransaction','getTransactionStatus']){
      const method=field(client,name);if(method===undefined&&name==='getTransactionStatus')continue;
      if(typeof method!=='function')throw invalidArgument();this.methods[name]=method;
    }
  }
  private call<T>(method:string,args:object):Promise<T>{return Promise.resolve().then(()=>Reflect.apply(this.methods[method]!,this.client,[args]));}
  async route():Promise<string|null>{
    if(this.endpoint===null)return null;
    const bytes=new TextEncoder().encode(JSON.stringify([this.protocolName,this.endpoint,this.bound.definition.binding]));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  }
  private async tree(height:number,signal:AbortSignal):Promise<ChainPoint & {sourceId:string}>{
    if(!Number.isInteger(height)||height<0||height>0xffffffff)throw protocol();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
    const value=snapshot(await this.call<any>('getTreeState',{height,signal}),['network','point','sapling','ironwood','encoded','sourceId','observedAt']);
    if(networkBinding(value.network).definition.binding!==this.bound.definition.binding)throw mismatch();
    const p=point(value.point);if(p.height!==height)throw protocol();
    const bytes=ownBytes(value.encoded,protocol,protocol,65536);
    let decoded:{height:string;hash:string};try{decoded=initialize().decodeResponse('GetTreeState',bytes) as typeof decoded;}catch{throw protocol();}
    if(decoded.height!==String(p.height)||decoded.hash!==p.hash)throw protocol();return {...p,sourceId:sourceId(value.sourceId)};
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
  async verify(signal:AbortSignal):Promise<string>{const pending=operation(signal);try{pending.check();if(this.registered){const tip=snapshot(await pending.wait(this.call<any>('getTip',{signal:pending.signal})),['height','hash','sourceId','observedAt']);point({height:tip.height,hash:tip.hash});return sourceId(tip.sourceId);}const tree=await pending.wait(this.tree(0,pending.signal));if(tree.hash!==this.network.genesisHash)throw mismatch();return tree.sourceId;}finally{pending.close();}}
  async observe(id:TxId,signal:AbortSignal):Promise<TransactionObservation>{
    const pending=operation(signal);
    try{
      pending.check();const verifiedSource=await pending.wait(this.verify(pending.signal));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
      const before=snapshot(await pending.wait(this.call<any>('getTip',{signal:pending.signal})),['height','hash','sourceId','observedAt']);
      const tip=point({height:before.height,hash:before.hash}),source=sourceId(before.sourceId);
      if(source!==verifiedSource)throw protocol();
      let evidence:TransactionObservation;
      if(this.methods.getTransactionStatus)evidence=await pending.wait(this.call<TransactionObservation>('getTransactionStatus',{txid:id,signal:pending.signal}));
      else{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
        const result=await pending.wait(this.call<any>('getTransaction',{txid:id,signal:pending.signal}));
        if(result===null)evidence={txid:id,state:'notSeen',inclusion:null,tip:null,priorInclusion:null,sourceId:source,observedAt:new Date().toISOString()};
        else{
          const transaction=snapshot(result,['txid','raw','observation','sourceId','observedAt']);
          if(transaction.txid!==id||transaction.sourceId!==source)throw protocol();
          evidence=transaction.observation;
          const raw=ownBytes(transaction.raw,protocol,protocol,2*1024*1024),observation=snapshot(evidence,['txid','state','inclusion','tip','priorInclusion','sourceId','observedAt']);
          const height=observation.state==='mined'?snapshot(observation.inclusion!,['height','blockHash','confirmations']).height:null;
          const heights=height===null?[0,...this.bound.definition.parameters.heights.filter(h=>h!==null)]:[height];
          if(height!==null&&(!Number.isInteger(height)||height<0||height>0xffffffff))throw protocol();
          const branches=new Set(heights.map(h=>this.bound.codec.consensusContext(this.bound.definition.parametersFormat,this.bound.definition.parameters.bytes,h).branchId));
          let matches=false;for(const branch of branches){try{if(this.bound.codec.decodeTransaction(raw,branch).display===id){matches=true;break;}}catch{/* Existing native decoder tries registered branch contexts. */}}
          if(!matches)throw protocol();
        }
      }
      const value=snapshot(evidence,['txid','state','inclusion','tip','priorInclusion','sourceId','observedAt']);
      if(value.txid!==id||sourceId(value.sourceId)!==source||!['notSeen','mempool','mined','offMainChain','unknown'].includes(value.state))throw protocol();
      let inclusion:TransactionObservation['inclusion']=null,priorInclusion:TransactionObservation['priorInclusion']=null;
      if(value.priorInclusion!==null){
        const prior=snapshot(value.priorInclusion,['height','blockHash','confirmations']);
        if(!Number.isInteger(prior.height)||prior.height<0||prior.height>0xffffffff)throw protocol();
        if(prior.confirmations!==null&&(!Number.isSafeInteger(prior.confirmations)||prior.confirmations<0))throw protocol();
        try{priorInclusion={height:prior.height,blockHash:prior.blockHash===null?null:blockHash(prior.blockHash),confirmations:null};}catch{throw protocol();}
      }
      if(value.state==='mined'){
        const claimed=snapshot(value.inclusion!,['height','blockHash','confirmations']),p=await pending.wait(this.tree(claimed.height,pending.signal));
        if(p.sourceId!==source||p.height>tip.height||(p.height===tip.height&&p.hash!==tip.hash)||(claimed.blockHash!==null&&claimed.blockHash!==p.hash))throw protocol();
        inclusion={height:p.height,blockHash:p.hash,confirmations:tip.height-p.height+1};
      }else if(value.inclusion!==null)throw protocol();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing dynamic boundary; explicit DTO typing is tracked in #137.
      const after=snapshot(await pending.wait(this.call<any>('getTip',{signal:pending.signal})),['height','hash','sourceId','observedAt']);
      if(after.sourceId!==source||!same(tip,point({height:after.height,hash:after.hash})))throw protocol();
      pending.check();return {txid:txId(id),state:value.state,inclusion,tip,priorInclusion,sourceId:source,observedAt:new Date().toISOString()};
    }finally{pending.close();}
  }
  async broadcast(bytes:Uint8Array,id:TxId,expectedSource:string,signal:AbortSignal):Promise<BroadcastReport>{
    const reply=snapshot(await this.call<BroadcastReport>('broadcastTransaction',{bytes,signal}),['txid','outcome','diagnosticCode','sourceId','observedAt']);
    if(reply.txid!==id||!['acknowledged','rejected','unknown'].includes(reply.outcome))throw protocol();
    if(sourceId(reply.sourceId)!==expectedSource)throw protocol();
    if(reply.diagnosticCode!==null&&(typeof reply.diagnosticCode!=='string'||!/^[-a-zA-Z0-9_:]{1,128}$/.test(reply.diagnosticCode)))throw protocol();
    const diagnostic=reply.diagnosticCode===null?null:/^(grpc|rpc)-send:(-?[0-9]{1,10})$/.exec(reply.diagnosticCode);
    const diagnosticCode=diagnostic?`${diagnostic[1]!.toUpperCase()}_SEND_${diagnostic[2]!.replace('-','NEG_')}`:null;
    return {...reply,diagnosticCode,observedAt:new Date().toISOString()};
  }
}
