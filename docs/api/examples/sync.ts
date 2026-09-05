import type * as Contract from '../public-api.js';

declare const wallet: Contract.WalletClient;
declare const signal: AbortSignal;
declare function render(status: Contract.SyncStatus): void;

render(await wallet.getSyncStatus()); // local read
const completed = await wallet.sync({ signal }); // finite target captured by SDK
render(completed); // cancellation can return activity: 'stopped'

export async function observe() {
  for await (const status of wallet.watchSync({ signal })) render(status);
}
