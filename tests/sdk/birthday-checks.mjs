import {fixture} from './viewing-fixture.mjs';
import {genesis,treeBytes} from './birthday-fixture.mjs';
import {scalar,bytesField,concat,revision,blockBytes} from '../clients/light-chain-reads-fixtures.mjs';
export async function birthdayChecks(api){
  const check=(ok,label)=>{if(!ok)throw Error(label);};
  const reject=async(promise,code)=>{try{await promise;throw Error('unexpected success');}catch(e){check(api.isZcashError(e)&&e.code===code,`${code}: ${e.code}`);}};
  const definition={identity:'birthday-synthetic',genesisHash:genesis,parametersFormat:'zcash-js-network/1',parameters:new TextEncoder().encode(fixture.parameters)};
  const network=await api.defineNetwork(definition),bytes=new Uint8Array(treeBytes),calls=[];
  const text=(field,value)=>bytesField(field,new TextEncoder().encode(value));
  const light=api.createLightClient({network,transport:{kind:'custom-lightwallet',sourceId:'birthday-fixture',protocolRevision:revision,
    async unary({method}){calls.push(method);if(method==='GetLightdInfo')return concat(text(1,'fixture'),text(2,'synthetic'),text(4,'regtest'),scalar(5,20),text(6,'00000000'),scalar(7,0),text(18,'v0.5.0'));check(method==='GetTreeState','only birthday tree requested');return bytes;},
    async *stream({method}){check(method==='GetBlockRange','genesis handshake');yield blockBytes(1,new Uint8Array(32).fill(2),Uint8Array.from(genesis.match(/../g).reverse(),byte=>parseInt(byte,16)));}}});
  const birthday=await api.resolveBirthday({light,firstScanHeight:1,recoverUntilExclusive:1});
  check(birthday.network===network&&birthday.source==='light-client'&&birthday.firstScanHeight===1&&birthday.recoverUntilExclusive===1,'validated birthday shape');
  check(birthday.priorTreeState.every((byte,i)=>byte===treeBytes[i]),'owned native encoded tree');
  const decoded=await light.getTreeState({height:0});
  const custom=result=>({network,getTreeState:async()=>result});
  const omitted=await api.resolveBirthday({light:custom(decoded),firstScanHeight:1});
  check(!Object.hasOwn(omitted,'recoverUntilExclusive'),'omitted recovery boundary');
  decoded.encoded.fill(0);check(omitted.priorTreeState.some(b=>b!==0),'copy source bytes');
  await reject(api.resolveBirthday({light:custom({...decoded,encoded:new Uint8Array([0])}),firstScanHeight:1}),'PROTOCOL_MISMATCH');
  const fresh=await light.getTreeState({height:0});
  await reject(api.resolveBirthday({light:custom({...fresh,point:{...fresh.point,height:1}}),firstScanHeight:1}),'PROTOCOL_MISMATCH');
  const other=await api.defineNetwork({...definition,identity:'other'});
  await reject(api.resolveBirthday({light:custom({...fresh,network:other}),firstScanHeight:1}),'NETWORK_MISMATCH');
  await reject(api.resolveBirthday({light,firstScanHeight:0}),'INVALID_ARGUMENT');
  await reject(api.resolveBirthday({light,firstScanHeight:1,recoverUntilExclusive:0}),'INVALID_ARGUMENT');
  const before=calls.length;
  for(const property of ['aborted','reason']) {
    const shadow=new AbortController();let reads=0;
    Object.defineProperty(shadow.signal,property,{get(){reads++;return true;}});
    await reject(api.resolveBirthday({light,firstScanHeight:1,signal:shadow.signal}),'INVALID_ARGUMENT');
    check(reads===0&&calls.length===before,'shadow signal rejected without getters or dispatch');
  }
  await reject(api.resolveBirthday({light,firstScanHeight:1,signal:AbortSignal.abort()}),'ABORTED');check(calls.length===before,'preabort avoids dispatch');
  const controller=new AbortController();let release;
  const pending=api.resolveBirthday({light:{network,getTreeState:()=>new Promise(resolve=>{release=resolve;})},firstScanHeight:1,signal:controller.signal});
  controller.abort();await reject(pending,'ABORTED');release(fresh);
  return {nativeValidated:true,nonpalindromicGenesis:true,cancelled:2};
}
