import type * as Contract from '../public-api.js';

declare const wallet: Contract.WalletClient;
declare const accountId: Contract.AccountId;
declare function showUnavailable(scan: Contract.ScanState): void;
declare function showBalance(balance: Contract.WalletBalance): void;

const balance = await wallet.getBalance({ accountId });
if (balance.amounts === null) showUnavailable(balance.scan);
else showBalance(balance);
const history = await wallet.getHistory({ accountId, limit: 50 });
if (history.nextCursor !== null) {
  await wallet.getHistory({ accountId, limit: 50, cursor: history.nextCursor });
}
const first = history.items[0];
if (first) await wallet.getTransaction({ txid: first.txid });
await wallet.listNotes({ accountId }); // all known states
await wallet.listUtxos({ accountId, spendState: 'unspent' }); // not an eligibility verdict
