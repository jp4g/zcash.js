import type {AccountRecord,SignerSelector} from '../../docs/api/public-api.js';
import type {attachWalletWorker} from './host.js';
import {failure} from '../errors.js';

/** Lookup hint only; callers still verify the returned key against the native account. */
export async function signerSelector(session:ReturnType<typeof attachWalletWorker>,account:AccountRecord,signal?:AbortSignal):Promise<SignerSelector>{
  if(account.accountIndex!==null)return {kind:'derived',accountIndex:account.accountIndex};
  const key=await session.accounts.viewingKey({accountId:account.id,...(signal===undefined?{}:{signal})});
  if(key===null)throw failure('SIGNER_CAPABILITY_MISMATCH','account','reattach-signer','Account has no full viewing key for signer lookup.');
  if(typeof key!=='string'||!key.length||key.length>4096)throw failure('PROTOCOL_MISMATCH','account','reopen','Invalid native viewing key.');
  const bytes=new TextEncoder().encode(key);
  return {kind:'fingerprint',fingerprint:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')};
}
