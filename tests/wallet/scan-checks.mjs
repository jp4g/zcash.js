// Same native scanner workflow runs against the real Node and OPFS loader owners.
import {defineNetwork,createLightClient,resolveBirthday} from '../../dist/src/index.js';
import {WalletSync} from '../../dist/src/wallet/sync.js';
import {initialize as wireCodec} from '../../dist/src/runtime/lightwire-capsule.mjs';
import {consensusContext,initialize as initializePrimitive} from '../../dist/src/runtime/primitive-capsule.mjs';
import {scalar,bytesField,concat,revision} from '../clients/light-chain-reads-fixtures.mjs';
const hex=value=>Uint8Array.from(value.match(/../g)??[],byte=>parseInt(byte,16));
const encoded=value=>Array.from(value,b=>b.toString(16).padStart(2,'0')).join('');
const reverse=value=>value.match(/../g).reverse().join('');
const check=(ok,label)=>{if(!ok)throw Error(label);};
export async function emptyCompletionChecks(session,fixture,definition,reopened=false) {
  const target={height:0,hash:definition.genesisHash};
  if(reopened){
    const state=await session.scan.state();
    check(state.tipHeight===null&&state.maxScannedHeight===null&&state.fullyScannedHeight===null&&state.scanComplete===null,'empty sync state survives native reopen');
    return state.revision;
  }
  const network=await defineNetwork(definition),codec=wireCodec();
  const state=codec.decodeResponse('GetTreeState',hex(fixture.batches[0].priorTreeState));
  const tree=codec.encodeTreeState(JSON.stringify({...state,hash:definition.genesisHash}));
  const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
  initializePrimitive();
  const light=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'empty-native-fixture',protocolRevision:revision,
    async unary({method}){
      if(method==='GetLightdInfo')return concat(text(1,'fixture'),text(2,'synthetic'),text(4,'regtest'),scalar(5,20),text(6,consensusContext(definition.parametersFormat,definition.parameters,0).branchId.toString(16).padStart(8,'0')),scalar(7,0),text(18,'v0.5.0'));
      check(method==='GetTreeState','empty wallet only fetches pinned tree state');return tree;
    },async *stream(){throw Error('empty wallet must not scan blocks');},
  }});
  const sync=new WalletSync(session,light,{pollIntervalMs:1000,maxBufferedUpdates:16});
  try {
    const status=await sync.sync({target:{...target,hash:network.genesisHash}});
    check(status.targetReached&&status.scan.tipHeight===null&&status.scan.fullyScannedHeight===null&&status.scan.maxScannedHeight===null&&status.scan.scanComplete===null,'native empty completion reaches target without invented scanned heights');
    return status.scan.revision;
  }finally{await sync.stop();}
}
const same=(a,b)=>JSON.stringify(a,(_,v)=>typeof v==='bigint'?String(v):v)===JSON.stringify(b,(_,v)=>typeof v==='bigint'?String(v):v);
export async function scanChecks(session,fixture,definition) {
  const codec=wireCodec();initializePrimitive();
  const network=await defineNetwork(definition),target=fixture.target;
  const raw=fixture.batches.flatMap(batch=>batch.blocks).map(hex);
  const blocks=new Map(raw.map(bytes=>[Number(codec.decodeItem('GetBlockRange',bytes).height),bytes]));
  const hashes=new Map(raw.map(bytes=>{const block=codec.decodeItem('GetBlockRange',bytes);return[Number(block.height),reverse(block.hash)];}));
  hashes.set(0,network.genesisHash);
  const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
  const request=(method,value)=>encoded(codec.encodeRequest(method,JSON.stringify(value)));
  const trees=new Map([...hashes].map(([height,hash])=>[request('GetTreeState',height===0?{hash}:{height:String(height)}),concat(text(1,'regtest'),scalar(2,height),text(3,hash),...(height<100?[text(5,'000000'),text(6,'000000'),text(7,'000000')]:[]))]));
  for(const batch of fixture.batches){const state=hex(batch.priorTreeState),height=Number(codec.decodeResponse('GetTreeState',state).height);trees.set(request('GetTreeState',height===0?{hash:network.genesisHash}:{height:String(height)}),state);}
  const ranges=new Map();
  for(let start=1;start<=target.height;start++)for(let end=start;end<=Math.min(target.height,start+15);end++)ranges.set(request('GetBlockRange',{start:{height:String(start)},end:{height:String(end)}}),[start,end]);
  let streams=0,enhancements=0,closed=0,stalled,firstRange;
  const delivered=new Set();
  const paused=new Promise(resolve=>{stalled=resolve;});
  const light=createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'native-fixture',protocolRevision:revision,
    async unary({method,request}){
      if(method==='GetLightdInfo')return concat(text(1,'fixture'),text(2,'synthetic'),text(4,'regtest'),scalar(5,20),text(6,consensusContext(definition.parametersFormat,definition.parameters,target.height).branchId.toString(16).padStart(8,'0')),scalar(7,target.height),text(18,'v0.5.0'));
      if(method==='GetLatestBlock')return concat(scalar(1,target.height),bytesField(2,hex(target.hash)));
      if(method==='GetTreeState'){const state=trees.get(encoded(request));check(state,'known fixture tree request');return state;}
      if(method==='GetTransaction'){enhancements++;throw Error('synthetic compact fixture has no full transaction');}
      throw Error('unexpected fixture unary');
    },
    async *stream({method,request,signal}){
      check(method==='GetBlockRange','compact range only');streams++;
      const range=ranges.get(encoded(request));check(range,'known fixture range');if(streams===1)firstRange=range;
      try {
        if(streams===2){stalled();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return;}
        for(let h=range[0];h<=range[1];h++){delivered.add(h);yield blocks.get(h);}
      }finally{closed++;}
    },
  }});
  const birthday=await resolveBirthday({light,firstScanHeight:1,recoverUntilExclusive:target.height+1});
  const foreign=await defineNetwork({...definition,genesisHash:'ff'.repeat(32)});
  const beforeImport=await session.scan.state();
  try {await session.accounts.import({...fixture.import,birthday:{...birthday,network:foreign}});throw Error('foreign birthday accepted');}
  catch(error){check(error.code==='NETWORK_MISMATCH','foreign birthday native admission');}
  check((await session.accounts.list()).length===0&&(await session.scan.state()).revision===beforeImport.revision,'foreign birthday does not mutate wallet');
  const imported=session.accounts.import({...fixture.import,birthday});
  birthday.priorTreeState.fill(255);
  const account=await imported;
  check(account.birthdayHeight===1,'resolved birthday imported');
  const sync=new WalletSync(session,light,{pollIntervalMs:1000,maxBufferedUpdates:16});
  const query={accountId:account.id,confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:true}};
  const before=await session.scan.state(),controller=new AbortController();controller.abort();
  check((await sync.sync({signal:controller.signal})).activity==='stopped','sync pre-abort status');
  check((await session.scan.state()).revision===before.revision,'cancelled sync retains revision');
  const firstController=new AbortController();
  const first=sync.watchSync({signal:firstController.signal}),second=sync.watchSync();
  check(!(await first.next()).done&&!(await second.next()).done,'two watch subscribers receive initial state');
  await paused;firstController.abort();
  try{await first.next();throw Error('cancelled subscriber stayed active');}
  catch(error){check(error.code==='ABORTED','one watch subscriber cancellation is local');}
  check(closed===1&&streams===2&&!(await second.next()).done,'remaining subscriber retains the shared pending public stream');
  await second.return();
  check(closed===streams&&(await sync.getSyncStatus()).activity==='stopped','last subscriber return drains shared stream and native work');
  const stoppedState=await session.scan.state();
  const stoppedBlock=await session.scan.block({height:firstRange[1]});
  check(stoppedBlock.point?.hash===reverse(hashes.get(firstRange[1]))&&!stoppedState.scanComplete&&stoppedState.revision!==before.revision,'committed native-priority batch survives cancellation');
  try{await sync.sync();throw Error('missing full transaction accepted');}
  catch(error){check(error.code==='TRANSPORT_ERROR','unavailable enhancement is an honest sync failure');}
  const status=await sync.getSyncStatus();check(status.activity==='failed'&&!status.targetReached&&status.enhancement.actionable>0,'missing enhancement remains pending');
  check(delivered.size===100&&closed===streams&&enhancements===1,'all 100 fixture blocks scanned and completed/cancelled public streams released');
  checkBalance(await session.getBalance(query),fixture);
  const state=await session.scan.state(),point=await session.scan.block({height:99});
  const rewind=await session.scan.rewind({revision:state.revision,requestedPoint:point.point});
  check(rewind.point.height===99,'native rewind reports actual retained checkpoint after priority scanning');
  const plan=await session.scan.plan({target});
  await session.scan.ingest({revision:plan.revision,target,priorTreeState:trees.get(request('GetTreeState',{height:'99'})),blocks:[blocks.get(100)]});
  const balance=await session.getBalance(query);checkBalance(balance,fixture);
  const queries=await scanQueryChecks(session,fixture,account.id);
  await sync.stop();
  return {account,balance,query,queries,publicSync:true,watchShared:true,enhancementPending:true,rewoundTo:99};
}
export async function enhancementChecks(session,fixture,reopened=false) {
  const pending=await session.enhancement.requests();
  const request=pending.requests.find(r=>r.kind==='enhancement'&&r.txid===fixture.txid);
  if(reopened)check(!request,'enhancement completion survives reopen');
  else {
    check(request,'native pending enhancement discovered without saved request ID');
    check(await session.getTransaction({txid:fixture.txid})===null,'queued enhancement alone is not a local transaction record');
    await session.enhancement.apply({revision:pending.revision,request,result:{transactions:[{bytes:hex(fixture.raw),minedHeight:fixture.minedHeight}]}});
    check(!(await session.enhancement.requests()).requests.some(r=>r.kind==='enhancement'&&r.txid===fixture.txid),'enhancement request completed natively');
  }
  const detail=await session.getTransaction({txid:fixture.txid});
  check(detail!==null&&detail.raw instanceof Uint8Array&&encoded(detail.raw)===fixture.raw,'exact enhanced transaction bytes survive query/reopen');
  check(detail.outputs.length===1&&detail.outputs[0].value===1000n&&detail.outputs[0].pool==='transparent','native enhanced output value');
  check(same(detail.outputs[0].receivingAccountIds,[fixture.accountId]),'enhanced output retains receiving account');
  const utxos=await session.listUtxos({accountId:fixture.accountId,uneconomic:true});
  check(utxos.items.length===1&&utxos.items[0].txid===fixture.txid&&utxos.items[0].value===1000n,'native enhanced UTXO inventory retains exact outpoint/value across reopen');
  const utxo=utxos.items[0];
  check(typeof utxo.address==='string'&&utxo.coinbase===null&&utxo.eligibility==='unknown'&&utxo.spendingTxid===null,'UTXO projection preserves unknown classification');
  check(utxos.unsupportedLegacyRowsOmitted===false&&(await session.listUtxos({accountId:fixture.accountId,uneconomic:false})).items.length===0,'native UTXO economic filter excludes known uneconomic output');
  const history=await session.getHistory({accountId:fixture.accountId});
  check(history.items.some(row=>row.txid===fixture.txid&&row.accountId===fixture.accountId),'enhanced history is account relative');
  const balance=await session.getBalance({accountId:fixture.accountId,confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:true}});
  check(balance.amounts===fixture.expectedAmounts,'enhancement fixture does not claim populated funds');
  return balance.scan.revision;
}
export async function scanQueryChecks(session,fixture,accountId,saved) {
  const before=await session.scan.state();
  const history=await session.getHistory({accountId,limit:1});
  check(history.historyComplete==='unknown'&&history.items.length===1&&history.nextCursor===null,'single native compact transaction history');
  const row=history.items[0];
  check(row.accountId===accountId&&typeof row.balanceDelta==='bigint'&&row.totalSpent===0n&&row.fee===null,'native account-relative receipt amounts and nullable fee');
  check(row.totalReceived===BigInt(fixture.expectedAmounts.observedTotal)&&row.balanceDelta===row.totalReceived,'history amounts match native scanned fixture');
  check(row.unsupportedLegacy==='legacyOrchard'&&same(row.pools,['sapling','ironwood']),'legacy funds retain separate history classification');
  const detail=await session.getTransaction({txid:row.txid});
  check(detail!==null&&detail.raw===null,'known compact transaction remains distinct from absent and enhanced');
  check(same(detail.accounts,[row]),'wallet-wide detail retains account history');
  check(detail.outputs.length===3&&detail.outputs.every(output=>output.txid===row.txid&&typeof output.value==='bigint'&&output.memo.kind==='unknown'&&same(output.receivingAccountIds,[accountId])),'native shielded outputs retain identity, unknown memo and receiving account');
  check(same(detail.outputs.map(output=>output.pool),['sapling','legacyOrchard','ironwood']),'detail never relabels legacy pool');
  check(await session.getTransaction({txid:'00'.repeat(32)})===null,'absent local transaction');
  const notes=await session.listNotes({accountId});
  check(notes.items.length===2&&notes.unsupportedLegacyRowsOmitted&&same(notes.items.map(n=>n.pool),['sapling','ironwood']),'supported inventory omits and flags legacy notes');
  check(notes.items.every(n=>n.txid===row.txid&&n.accountId===accountId&&typeof n.value==='bigint'&&n.spendState==='unspent'&&n.spendingTxid===null&&n.lockKnown&&n.lock===null&&n.eligibility==='unknown'),'native complete scan supports unspent notes without claiming selection eligibility');
  check((await session.listNotes({accountId,pool:'sapling',locked:false,spendState:'unspent'})).items.length===1,'native note filters apply before paging');
  check((await session.listNotes({accountId,locked:true})).items.length===0&&(await session.listUtxos({accountId})).items.length===0,'inventory does not invent locks or transparent records');
  const after=await session.scan.state();
  check(before.revision===after.revision&&history.scan.revision===before.revision&&detail.scan.revision===before.revision,'queries retain one native revision without writes');
  const snapshot={history:history.items,outputs:detail.outputs,txid:detail.txid,notes:notes.items};
  if(saved)check(same(snapshot,saved),'native history/detail survive owner destruction and reopen');
  return snapshot;
}
export async function historyPageChecks(session,fixture,previousCursor) {
  const args={accountId:fixture.accountId,limit:1};
  const stale=async cursor=>{
    try{await session.getHistory({...args,cursor});throw Error('stale cursor accepted');}
    catch(error){check(error.code==='CURSOR_STALE','native mutation/reopen invalidates pagination');}
  };
  const notesArgs={accountId:fixture.accountId,limit:1};
  const staleNotes=async cursor=>{
    try{await session.listNotes({...notesArgs,cursor});throw Error('stale inventory cursor accepted');}
    catch(error){check(error.code==='CURSOR_STALE','inventory revision binds mutation/reopen');}
  };
  if(previousCursor){await stale(previousCursor.history);await staleNotes(previousCursor.notes);}
  const notes=await session.listNotes(notesArgs);check(typeof notes.nextCursor==='string','native inventory produces bounded continuation');
  try{await session.listNotes({...notesArgs,cursor:notes.nextCursor,locked:false});throw Error('inventory cursor accepted changed filter');}
  catch(error){check(error.code==='INVALID_ARGUMENT','inventory cursor binds exact filters');}
  const inventory=[];let notePage=notes;
  do {inventory.push(...notePage.items);if(!notePage.nextCursor)break;notePage=await session.listNotes({...notesArgs,cursor:notePage.nextCursor});}while(inventory.length<10);
  check(notePage.nextCursor===null&&inventory.length>=2&&new Set(inventory.map(n=>n.txid+':'+n.pool+':'+n.outputIndex)).size===inventory.length,'bounded inventory pages omit no duplicate outpoints');
  check(inventory.some(n=>n.spendState==='unknown')&&inventory.every(n=>n.eligibility==='unknown'),'incomplete fixture coverage retains unknown spentness');
  const first=await session.getHistory(args);
  check(typeof first.nextCursor==='string','native first page issues a real continuation cursor');
  const second=await session.getHistory({...args,cursor:first.nextCursor});
  check(second.nextCursor===null&&same([first.items[0].txid,second.items[0].txid],fixture.txids),'bounded pages preserve native ordering without loss or duplication');
  check(first.items[0].accountId===fixture.accountId&&second.items[0].accountId===fixture.accountId,'pages stay account relative');
  await session.scan.plan({target:fixture.target});
  await stale(first.nextCursor);await staleNotes(notes.nextCursor);
  return {history:(await session.getHistory(args)).nextCursor,notes:(await session.listNotes(notesArgs)).nextCursor};
}
export function checkBalance(balance, fixture) {
  const same = (a, b) => JSON.stringify(a, (_, value) => typeof value === 'bigint' ? String(value) : value) === JSON.stringify(b);
  const { revision, ...scan } = balance.scan;
  if (!same(scan, fixture.expectedScan) || !same(balance.amounts, fixture.expectedAmounts)) throw Error('native populated balance/scan mismatch');
}

// Reopened wallets remain locally useful without inventing a scan endpoint.
export async function offlineSyncChecks(session) {
  const sync = new WalletSync(session, undefined, {pollIntervalMs:1000,maxBufferedUpdates:2});
  const reject = async (promise, code) => {
    try { await promise; throw Error('unexpected offline success'); }
    catch (error) { check(error.code===code, `offline ${code}: ${error.code}`); }
  };
  try {
    const before = await sync.getSyncStatus();
    check(before.activity==='idle' && before.scan.fullyScannedHeight===100, 'offline persisted scan status');
    await reject(sync.sync({signal:{}}), 'INVALID_ARGUMENT');
    const stopped = await sync.sync({signal:AbortSignal.abort()});
    check(stopped.activity==='stopped', 'offline cancellation keeps finite stopped semantics');
    await reject(sync.sync(), 'OBSERVATION_UNAVAILABLE');
    const watch = sync.watchSync();
    await reject(watch.next(), 'OBSERVATION_UNAVAILABLE');
    await watch.return();
    const after = await sync.getSyncStatus();
    check(after.scan.revision===before.scan.revision, 'offline attempts do not mutate wallet');
  } finally { await sync.stop(); }
}

export async function memoryWalletChecks(session, fixture, populate) {
  check((await session.accounts.list()).length===0,'new memory wallet starts empty');
  if (!populate) return;
  const account=await session.accounts.import({...fixture.import,birthday:'fullScan'});
  check((await session.accounts.get({accountId:account.id})).id===account.id,'memory native account query');
  const balance=await session.getBalance({accountId:account.id,confirmations:{trusted:1,untrusted:1,allowZeroConfirmationShielding:true}});
  check(balance.accountId===account.id&&balance.amounts===null,'memory native unsynced balance');
  const address=await session.addresses.next({accountId:account.id,request:{format:'transparent'}});
  check((await session.addresses.list({accountId:account.id})).some(row=>row.address===address.address),'memory native address allocation');
}

export async function sharedWalletChecks(open, fixture) {
  const first=await open('a');
  let release, reopened, second;
  try {
    const abort=new AbortController(),cancelled=open('cancel',abort.signal);abort.abort();
    try {await cancelled;throw Error('unexpected shared open');}catch(error){check(error.code==='ABORTED','shared open cancellation');}
    try {await open('a');throw Error('unexpected shared lease');}catch(error){check(error.code==='STORAGE_BUSY',`duplicate DB lease remains exclusive: ${error.code}`);}
    second=await open('b');
    check(first.owner.identity===second.owner.identity,'already-open wallets share native owner');
    check((await second.session.accounts.list()).length===0,'second DB starts empty');
    const account=await first.session.accounts.import({...fixture.import,birthday:'fullScan'});
    check((await second.session.accounts.list()).length===0,'wallet databases remain isolated');
    const address=await first.session.addresses.next({accountId:account.id,request:{format:'transparent'}});
    release=first.owner.retain();
    await first.close();
    check((await second.session.accounts.list()).length===0,'closing first wallet preserves second');
    await second.close();
    reopened=await open('a');
    check(reopened.owner.identity===first.owner.identity,'caller lease preserves owner across wallet closes');
    check((await reopened.session.accounts.get({accountId:account.id})).id===account.id,'reopened DB retains account');
    await release();release=undefined;
    check((await reopened.session.addresses.list({accountId:account.id})).some(row=>row.address===address.address),'wallet survives authority lease release');
  } finally {await release?.();await first.close();await second?.close();await reopened?.close();}
}

export async function mnemonicWalletChecks(open) {
  const {createMnemonicAccount}=await import('../../dist/src/wallet/mnemonic.js');
  // Existing native wallet-signer.mjs/BIP39 synthetic vector, never production authority.
  const phrase=new TextEncoder().encode('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
  const first=await open('a');let second,reopened,authority;
  try {
    second=await open('b');
    const created=await createMnemonicAccount(first,'import',{mnemonic:phrase,accountIndex:0,birthday:'fullScan'});
    authority=created.authority;
    const descriptor=await authority.describe();
    check(descriptor.accountIndex===0&&typeof descriptor.viewingKey==='string','actual mnemonic native description');
    const imported=await second.session.accounts.import({viewingKey:descriptor.viewingKey,birthday:'fullScan'});
    check(await authority.bind(second,imported.id)==='ready','native signer/account correspondence across DBs');
    await first.close();
    check((await authority.describe()).viewingKey===descriptor.viewingKey,'native USK owner survives first wallet close');
    reopened=await open('a');
    check((await reopened.session.accounts.get({accountId:created.account.id})).id===created.account.id,'mnemonic account persists after reopen');
    await authority.unbind(second,imported.id);await authority.dispose();authority=undefined;
    const controller=new AbortController(),send=MessagePort.prototype.postMessage;let canceled;
    // Abort after actual dispatch, before the worker's native completion response.
    MessagePort.prototype.postMessage=function(value,...rest){const answer=Reflect.apply(send,this,[value,...rest]);if(value?.command==='account_import_mnemonic_signer')controller.abort();return answer;};
    try {
      await createMnemonicAccount(reopened,'import',{mnemonic:phrase,accountIndex:1,birthday:'fullScan',signal:controller.signal});
      throw Error('missing canceled mnemonic result');
    } catch(error){canceled=error;check(error.code==='ABORTED','dispatched mnemonic cancellation');}
    finally {MessagePort.prototype.postMessage=send;}
    const receipt=reopened.session.completion(canceled);
    check(receipt?.completion==='committed'&&typeof receipt.value?.account?.id==='string','canceled committed account retained');
    const token=receipt.value.signerToken;
    try {await reopened.owner.signers.describe({token});throw Error('undelivered token remains live');}
    catch(error){check(error.code==='STALE_HANDLE','undelivered native token released');}
    check((await reopened.session.accounts.list()).length===2,'canceled account mutation persists without leaked signer');
    check(new TextDecoder().decode(phrase).endsWith('about'),'caller mnemonic bytes remain owned');
  } finally {await authority?.dispose();await first.close();await second?.close();await reopened?.close();}
}
