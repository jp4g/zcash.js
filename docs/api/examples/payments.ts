import type * as Contract from '../public-api.js';

declare const wallet: Contract.WalletClient;
declare const accountId: Contract.AccountId;
declare const signer: Contract.Signer;
declare const recipient: string; // synthetic fixture destination

export async function sendPayment() {
  const pending = await wallet.send({ accountId, to: recipient, amount: 125_000n, signer });
  return pending.wait({ confirmations: 3, timeoutMs: 120_000 });
}
export async function shieldFunds() {
  const pending = await wallet.shield({ accountId, toPool: 'sapling', signer });
  return pending.snapshot(); // inspect initial attempts, not a mining claim
}
