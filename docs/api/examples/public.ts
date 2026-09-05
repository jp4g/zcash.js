import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
declare const network: Contract.Network;
declare const rpcUrl: string; // application-selected fixture endpoint

const publicClient = sdk.createPublicClient({
  network,
  transport: sdk.http(rpcUrl, {
    sourceId: 'review-rpc', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  }),
  observation: { pollIntervalMs: 5_000, maxBufferedUpdates: 32 },
});
const tip = await publicClient.getTip();
const header = await publicClient.getBlockHeader({ hash: tip.hash });
