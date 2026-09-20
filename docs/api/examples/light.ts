import { createLightClient, grpc } from "@jp4g/zcash.js";
import type { CompactBlock, HeightRange, Network } from "@jp4g/zcash.js";

declare const network: Network;
declare const lightUrl: string; // application-selected fixture endpoint
declare const range: HeightRange;
declare const signal: AbortSignal;
declare function inspect(block: CompactBlock): void;

const light = createLightClient({
  network,
  transport: grpc(lightUrl, {
    sourceId: 'review-light', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
});
for await (const block of light.streamCompactBlocks({ ...range, signal })) {
  inspect(block); // receiving data alone does not scan a wallet
}
