import { createWalletClient } from "zcash.js";
import type { WalletOptions } from "zcash.js";

declare const options: WalletOptions;

const wallet = await createWalletClient(options);
await wallet.close();
