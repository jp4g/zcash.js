import type * as Contract from '../public-api.js';

declare const wallet: Contract.WalletClient;
declare const accountId: Contract.AccountId;
declare const signer: Contract.Signer;
declare const recipient: string;
declare function review(proposal: Contract.Proposal): Promise<boolean>;

const proposal = await wallet.propose({ accountId, to: recipient, amount: 125_000n });
if (await review(proposal)) {
  const pending = await wallet.send({ proposal, signer });
  await pending.wait({ confirmations: 3 });
}
