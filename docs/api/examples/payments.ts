import type { AccountId, Signer, WalletClient } from "@jp4g/zcash.js";

declare const wallet: WalletClient;
declare const accountId: AccountId;
declare const signer: Signer;
declare const recipient: string; // synthetic fixture destination

export async function sendPayment() {
  const pending = await wallet.send({ accountId, to: recipient, amount: 125_000n, signer });
  return pending.wait({ confirmations: 3, timeoutMs: 120_000 });
}
export async function shieldFunds() {
  const pending = await wallet.shield({ accountId, toPool: 'sapling', signer });
  return pending.snapshot(); // inspect initial attempts, not a mining claim
}
