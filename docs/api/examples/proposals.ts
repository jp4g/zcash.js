import type { AccountId, Proposal, Signer, WalletClient } from "zcash.js";

declare const wallet: WalletClient;
declare const accountId: AccountId;
declare const signer: Signer;
declare const recipient: string;
declare function review(proposal: Proposal): Promise<boolean>;

const proposal = await wallet.propose({ accountId, to: recipient, amount: 125_000n });
if (await review(proposal)) {
  const pending = await wallet.send({ proposal, signer });
  await pending.wait({ confirmations: 3 });
}
