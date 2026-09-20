import { createWalletClient } from "@jp4g/zcash.js";
import type { WalletOptions } from "@jp4g/zcash.js";

declare const options: WalletOptions;

const wallet = await createWalletClient(options);
await wallet.close();
