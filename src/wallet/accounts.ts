import type { AccountsApi, AccountRecord, CreatedAccount, MnemonicImport, Network, Op, Signer, SignerBinding, ViewingImport } from '../../docs/api/public-api.js';
import type { openWalletRuntime } from '../runtime/wallet.js';
import { snapshot } from '../clients/owned-plumbing.js';
import { operation } from '../clients/light-chain-reads.js';
import { networkBinding } from '../network.js';
import { createCustomSigner } from '../signer.js';
import { viewing } from '../viewing.js';
import { failure, invalidArgument } from '../errors.js';
import { createMnemonicAccount } from './mnemonic.js';
import { memorySigner, memorySignerAuthority } from './memory-signer.js';

type Wallet = Awaited<ReturnType<typeof openWalletRuntime>>;
/** Public account methods composed on an already owned wallet; no new wallet factory. */
export function walletAccounts(wallet: Wallet, network: Network) {
  networkBinding(network);
  let closing: Promise<void>|undefined;
  const check=()=>{if(closing)throw failure('CLOSED','account','none','Wallet accounts are closed.');wallet.session.check();};
  const bindings = new Map<string, {binding:SignerBinding;signer:Signer}>();
  const attaching = new Map<string, ReturnType<typeof operation>>();
  const accountId = (value: unknown): string => {
    if(typeof value!=='string'||!value.length||value.length>128)throw invalidArgument();
    return value;
  };
  const project = (record: AccountRecord): AccountRecord => ({...record,signerAttached:record.signerAttached||Boolean(bindings.has(record.id)&&!memorySignerAuthority(bindings.get(record.id)!.signer))});
  async function mnemonic(kind:'create'|'import',args: Parameters<AccountsApi['create']>[0] | MnemonicImport):Promise<CreatedAccount> {
    const input=snapshot(args,kind==='create'?['mnemonic','passphrase','name','enabledPools','signal']:['mnemonic','passphrase','name','enabledPools','accountIndex','birthday','signal']);
    const pending=operation(input.signal);let created: Awaited<ReturnType<typeof createMnemonicAccount>> | undefined;
    try {
      pending.check();check();
      created=await createMnemonicAccount(wallet,kind,input);
      const signer=await memorySigner(network,created.authority);
      try {pending.check();check();return {account:created.account,signer};}
      catch(error){await signer.dispose().catch(()=>{});throw error;}
    } catch(error) {
      if(created&&error&&typeof error==='object')wallet.session.committed(error,{account:created.account});
      throw error;
    } finally {pending.close();}
  }
  async function importAccount(args:MnemonicImport):Promise<CreatedAccount>;
  async function importAccount(args:ViewingImport):Promise<AccountRecord>;
  async function importAccount(args:MnemonicImport|ViewingImport):Promise<CreatedAccount|AccountRecord> {
    check();
    const input=snapshot(args,['mnemonic','passphrase','name','enabledPools','accountIndex','birthday','signal','viewingKey','viewOnly']);
    if(Object.hasOwn(input,'mnemonic'))return mnemonic('import',input as MnemonicImport);
    return wallet.session.accounts.import(input as ViewingImport);
  }
  const api = Object.freeze({
    create: args=>mnemonic('create',args),
    import:importAccount,
    async list(args:Op={}) {check();return (await wallet.session.accounts.list(snapshot(args,['signal']))).map(project);},
    async get(args) {check();const record=await wallet.session.accounts.get(snapshot(args,['accountId','signal']));return record?project(record):null;},
    async remove(args) {
      check();
      const input=snapshot(args,['accountId','acknowledge','signal']),id=accountId(input.accountId);
      if(attaching.has(id))throw failure('STORAGE_BUSY','account','none','Signer attachment is pending.');
      await wallet.session.accounts.remove(input);
      await bindings.get(id)?.binding.dispose();
    },
    async attachSigner(args) {
      check();
      const input=snapshot(args,['accountId','signer','signal']),id=accountId(input.accountId);
      if(attaching.has(id))throw failure('STORAGE_BUSY','account','none','Signer attachment is pending.');
      const pending=operation(input.signal);let unbind: (()=>Promise<void>)|undefined;let published=false;
      try {
        pending.check();check();wallet.owner.check();attaching.set(id,pending);
        await bindings.get(id)?.binding.dispose();
        const authority=memorySignerAuthority(input.signer);
        let state:'ready'|'recovery-required';
        if(authority){
          unbind=()=>authority.unbind(wallet,id);
          state=await authority.bind(wallet,id,{signal:pending.signal});
        } else {
          const account=await wallet.session.accounts.get({accountId:input.accountId,signal:pending.signal});
          if(!account)throw failure('ACCOUNT_NOT_FOUND','account','correct-input','Account does not exist.');
          // #97: an imported arbitrary keyId cannot be inferred from a wallet account ID.
          if(account.accountIndex===null)throw failure('SIGNER_CAPABILITY_MISMATCH','account','reattach-signer','Signer selector is unavailable for this imported account.');
          const signer=createCustomSigner(input.signer);
          const descriptor=await signer.getAccount({network,selector:{kind:'derived',accountIndex:account.accountIndex},signal:pending.signal});
          try {
            const key=await viewing.export({account:descriptor,format:'ufvk',acknowledge:'discloses-viewing-authority',signal:pending.signal});
            state=await wallet.session.accounts.checkKey({accountId:id,viewingKey:key,signal:pending.signal});
          } finally {await descriptor.viewing.dispose();}
        }
        pending.check();check();
        let disposed:Promise<void>|undefined;
        const binding:SignerBinding=Object.freeze({accountId:input.accountId,state,dispose(){
          return disposed??=Promise.resolve().then(async()=>{if(bindings.get(id)?.binding!==binding)return;try {await unbind?.();} catch(error){if(!error||typeof error!=='object'||!['CLOSED','STALE_HANDLE','WORKER_CRASHED'].includes((error as {code:string}).code))throw error;}bindings.delete(id);});
        }});
        bindings.set(id,{binding,signer:input.signer});published=true;return binding;
      } catch(error) {if(closing)check();throw error;}
      finally {attaching.delete(id);pending.close();if(!published)await unbind?.().catch(()=>{});}
    },
    async detachSigner(args) {
      check();
      const input=snapshot(args,['accountId','signal']),id=accountId(input.accountId),pending=operation(input.signal);
      try {pending.check();check();wallet.owner.check();if(attaching.has(id))throw failure('STORAGE_BUSY','account','none','Signer attachment is pending.');await bindings.get(id)?.binding.dispose();pending.check();}
      finally {pending.close();}
    },
  } satisfies AccountsApi);
  return Object.freeze({api,
    attachedSigner(id:string){check();return bindings.get(id)?.signer;},
    close(){if(closing)return closing;closing=Promise.resolve().then(async()=>{
      try {for(const {binding} of bindings.values())await binding.dispose();}
      finally {bindings.clear();await wallet.close();}
    });for(const pending of attaching.values())pending.cancel();return closing;},
  });
}
