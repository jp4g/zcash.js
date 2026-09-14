import {defineNetwork,createCustomSigner,viewing} from '../../dist/src/index.js';
import {walletAccounts} from '../../dist/src/wallet/accounts.js';
import {emptyCompletionChecks} from './scan-checks.mjs';
const check=(ok,label)=>{if(!ok)throw Error(label);};
const reject=async(promise,code)=>{try{await promise;throw Error('unexpected account success');}catch(error){check(error.code===code,`${code}: ${error.code}`);}};

// Identical actual SQLite workflow runs under filesystem and OPFS owners.
export async function accountsChecks(open,fixture,definition) {
  const network=await defineNetwork(definition),phrase=new TextEncoder().encode(fixture.signer.mnemonic);
  const a=await open('a'),first=walletAccounts(a,network);
  let b,second,reopened,created,imported,descriptor;
  try {
    await reject(first.api.create({mnemonic:phrase}), 'SYNC_REQUIRED');
    await emptyCompletionChecks(a.session,fixture.scan,definition);
    created=await first.api.create({mnemonic:phrase,name:'created'});
    check(created.account.accountIndex===0&&!created.account.signerAttached,'native allocated account and unattached real signer');
    imported=await first.api.import({mnemonic:phrase,accountIndex:1,birthday:'fullScan',name:'recovered'});
    check(imported.account.accountIndex===1,'explicit mnemonic recovery index');
    check((await first.api.list()).length===2,'public account list');
    descriptor=await created.signer.getAccount({network,selector:{kind:'derived',accountIndex:0}});
    const viewingKey=await viewing.export({account:descriptor,format:'ufvk',acknowledge:'discloses-viewing-authority'});
    b=await open('b');second=walletAccounts(b,network);
    const watched=await second.api.import({viewingKey,birthday:'fullScan'});
    check(watched.accountIndex===null&&!watched.signerAttached,'UFVK import supplies no signer');
    await reject(second.api.attachSigner({accountId:watched.id,signer:imported.signer}),'ACCOUNT_KEY_MISMATCH');
    const bound=await second.api.attachSigner({accountId:watched.id,signer:created.signer});
    check(bound.state==='ready'&&(await second.api.get({accountId:watched.id})).signerAttached,'actual native correspondence across databases');
    await second.api.detachSigner({accountId:watched.id});await bound.dispose();
    check(!(await second.api.get({accountId:watched.id})).signerAttached,'detach preserves caller authority');
    const generic=createCustomSigner(created.signer);
    const external=await first.api.attachSigner({accountId:created.account.id,signer:generic});
    check(external.state==='ready'&&(await first.api.list()).find(row=>row.id===created.account.id).signerAttached,'generic descriptor checked by native UFVK comparison');
    await external.dispose();
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(viewingKey))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const lookup={getCapabilities:args=>created.signer.getCapabilities(args),authorize:args=>created.signer.authorize(args),
      getAccount({network:requested,selector,signal}){check(requested===network&&selector.kind==='fingerprint'&&selector.fingerprint===fingerprint,'canonical imported-account fingerprint lookup');return created.signer.getAccount({network:requested,selector:{kind:'derived',accountIndex:created.account.accountIndex},signal});}};
    const matched=await second.api.attachSigner({accountId:watched.id,signer:lookup});
    check(matched.state==='ready'&&(await second.api.get({accountId:watched.id})).signerAttached,'fingerprint adapter retains native correspondence');await matched.dispose();
    await reject(first.api.remove({accountId:created.account.id,acknowledge:'wrong'}),'INVALID_ARGUMENT');
    await first.api.remove({accountId:created.account.id,acknowledge:'deletes-local-history'});
    await first.api.remove({accountId:imported.account.id,acknowledge:'deletes-local-history'});
    check(await first.api.get({accountId:created.account.id})===null,'removed account is absent');
    await first.close();
    check((await created.signer.getCapabilities()).revision==='zakura-memory-signer/1','caller signer survives account removal and wallet close');
    reopened=walletAccounts(await open('a'),network);
    check((await reopened.api.list()).length===0,'native removals persist through reopen');
    await second.api.remove({accountId:watched.id,acknowledge:'deletes-local-history'});
    check(new TextDecoder().decode(phrase)===fixture.signer.mnemonic,'caller mnemonic bytes remain unchanged');
  } finally {
    await descriptor?.viewing.dispose();await created?.signer.dispose();await imported?.signer.dispose();
    await reopened?.close();await second?.close();await first.close();await b?.close();await a.close();
  }
}
