import { createPublicClient, http } from "@jp4g/zcash.js";
import type { Network } from "@jp4g/zcash.js";

declare const network: Network;
declare const rpcUrl: string; // application-selected fixture endpoint

const publicClient = createPublicClient({
  network,
  transport: http(rpcUrl, {
    sourceId: 'review-rpc', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
  observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 32 },
});
const tip = await publicClient.getTip();
const header = await publicClient.getBlockHeader({ hash: tip.hash });
