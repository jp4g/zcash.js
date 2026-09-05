import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
declare const options: Contract.WalletOptions;

const wallet = await sdk.createWalletClient(options);
await wallet.close();
