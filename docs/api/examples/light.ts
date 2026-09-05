import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
declare const network: Contract.Network;
declare const lightUrl: string; // application-selected fixture endpoint
declare const range: Contract.HeightRange;
declare const signal: AbortSignal;
declare function inspect(block: Contract.CompactBlock): void;

const light = sdk.createLightClient({
  network,
  transport: sdk.grpc(lightUrl, {
    sourceId: 'review-light', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
});
for await (const block of light.streamCompactBlocks({ ...range, signal })) {
  inspect(block); // receiving data alone does not scan a wallet
}
