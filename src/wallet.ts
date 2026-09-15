import { addressInput, broadcastInput } from './clients/request-inputs.js';
import { confirmationsPolicy, observationOptions, recoveryPolicy } from './options.js';
import { provingOptions } from './wallet/proving-assets.js';
import type {
  WalletClient,
  WalletOptions,
  ZcashClient,
  LightClient,
  PublicClient,
  Network,
  Op,
  SyncStatus,
} from './types.js';
import { openWalletRuntime, runtimeOptions, walletStorage } from './runtime/wallet.js';
import { networkBinding } from './network.js';
import { lightClientBinding } from './light.js';
import { publicClientBinding } from './public.js';
import { operation } from './clients/light-chain-reads.js';
import { snapshot, dataField } from './clients/owned-plumbing.js';
import { failure, invalidArgument, isZcashError } from './errors.js';
import { walletAccounts } from './wallet/accounts.js';
import { WalletSync } from './wallet/sync.js';
import { WalletProposals } from './wallet/proposals.js';
import { WalletPayments } from './wallet/payments.js';
import { walletPropose, policyCopy } from './wallet/propose-intent.js';
import { walletSign } from './wallet/sign.js';
import { walletExecute } from './wallet/execute.js';

const closed = () => failure('CLOSED', 'runtime', 'none', 'Wallet is closed.');
const noPolicy = () => failure('INVALID_ARGUMENT', 'proposal', 'configure', 'A transaction policy is required.');
function callInput<T extends Op>(args: T): T {
  try {
    const keys = Object.getOwnPropertyNames(args);
    if (keys.length > 32) throw invalidArgument();
    return snapshot(args, keys);
  } catch (error) {
    throw isZcashError(error) ? error : invalidArgument();
  }
}
function matching(client: { readonly network: Network }, network: Network) {
  const candidate = dataField(client, 'network') as Network;
  if (networkBinding(candidate).definition.binding !== networkBinding(network).definition.binding) {
    throw failure(
      'NETWORK_MISMATCH',
      'validation',
      'configure',
      'Client network differs from wallet network.',
    );
  }
}
const lightMethods = [
  'getTip',
  'getServerInfo',
  'getTransaction',
  'getAddressUtxos',
  'getAddressBalance',
  'getTreeState',
  'getSubtreeRoots',
  'streamCompactBlocks',
  'streamAddressTransactions',
  'streamMempool',
  'broadcastTransaction',
];
const publicMethods = [
  'getTip',
  'getBlock',
  'getBlockHeader',
  'getTransaction',
  'getTransactionStatus',
  'getUtxos',
  'getTreeState',
  'getSubtreeRoots',
  'broadcastTransaction',
  'waitForTransaction',
  'watchTransaction',
];
function capture<T extends LightClient | PublicClient>(client: T, network: Network, light: boolean): T {
  matching(client, network);
  // Genuine factories already freeze methods and retain their private route identity.
  if (lightClientBinding(client as LightClient) || publicClientBinding(client as PublicClient)) return client;
  const copy: Record<string, unknown> = { network: dataField(client, 'network') };
  for (const name of light ? lightMethods : publicMethods) {
    const method = dataField(client, name);
    if (typeof method !== 'function') throw invalidArgument();
    const stream = name.startsWith('stream') || name === 'getSubtreeRoots' || name === 'watchTransaction';
    copy[name] = (args: Op = {}) => {
      const input = name === 'broadcastTransaction'
        ? broadcastInput(args)
        : ['getAddressUtxos', 'getAddressBalance', 'getUtxos'].includes(name)
            ? addressInput(args)
            : callInput(args);
      if (!stream) {
        return (async () => {
          const pending = operation(input.signal);
          try {
            pending.check();
            return await pending.wait(Reflect.apply(method, client, [{ ...input, signal: pending.signal }]));
          } finally {
            pending.close();
          }
        })();
      }
      let pending: ReturnType<typeof operation> | undefined,
        iterator: AsyncIterator<unknown> | undefined,
        done = false;
      const finish = () => {
        done = true;
        pending?.close();
        try {
          void Promise.resolve(iterator?.return?.()).catch(() => { });
        } catch { /* Caller-owned iterator cleanup cannot retain wallet lifetime. */ }
      };
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          if (done) return { done: true, value: undefined };
          try {
            if (!pending) {
              pending = operation(input.signal);
              pending.check();
              iterator = Reflect.apply(method, client, [{ ...input, signal: pending.signal }])[Symbol.asyncIterator]();
            }
            const result = await pending.wait(iterator!.next());
            if (result.done) finish();
            return result;
          } catch (error) {
            finish();
            throw error;
          }
        },
        async return() {
          finish();
          return { done: true, value: undefined };
        },
      };
    };
  }
  return Object.freeze(copy) as unknown as T;
}
/** Own the configured components and their lifetime; native code owns wallet state. */
export async function createWalletClient(args: WalletOptions): Promise<WalletClient> {
  const input = snapshot(
    args,
    [
      'network',
      'storage',
      'runtime',
      'confirmations',
      'light',
      'broadcaster',
      'transactionPolicy',
      'proving',
      'observation',
      'recovery',
      'signal',
    ],
  );
  const pending = operation(input.signal);
  let wallet: Awaited<ReturnType<typeof openWalletRuntime>> | undefined;
  let accounts: ReturnType<typeof walletAccounts> | undefined,
    sync: WalletSync | undefined,
    payments: WalletPayments | undefined;
  try {
    pending.check();
    const bound = networkBinding(input.network);
    const runtime = runtimeOptions(input.runtime);
    const storage = walletStorage(input.storage);
    const confirmations = confirmationsPolicy(input.confirmations);
    const policy = input.transactionPolicy === undefined ? undefined : policyCopy(input.transactionPolicy);
    if (policy
      && Object.keys(confirmations).some(
        key => confirmations[key as keyof typeof confirmations]
          !== policy.confirmations[key as keyof typeof confirmations],
      )) throw invalidArgument();
    const observation = observationOptions(input.observation);
    const recovery = recoveryPolicy(input.recovery, Boolean(input.light), Boolean(input.broadcaster));
    const light = input.light === undefined ? undefined : capture(input.light, input.network, true);
    const broadcaster = input.broadcaster === undefined
      ? undefined
      : input.broadcaster === input.light
        ? light
        : capture(
            input.broadcaster,
            input.network,
            dataField(input.broadcaster, 'getTransactionStatus') === undefined,
          );
    const proving = input.proving === undefined ? undefined : provingOptions(input.proving);
    const options = {
      network: input.network,
      runtime,
      storage,
      confirmations,
      observation,
      recovery,
      ...(light ? { light } : {}),
      ...(broadcaster ? { broadcaster } : {}),
    };
    wallet = await openWalletRuntime({
      runtime,
      storage,
      network: {
        identity: bound.definition.identity,
        genesisHash: bound.definition.genesisHash,
        parametersFormat: bound.definition.parametersFormat,
        parameters: bound.definition.parameters.bytes,
      },
      signal: pending.signal,
    });
    pending.check();
    accounts = walletAccounts(wallet, input.network);
    sync = new WalletSync(wallet.session, light, observation, runtime.scanBatchSize);
    const proposals = new WalletProposals(wallet.session, input.network, proving);
    payments = new WalletPayments(wallet, proposals, options);
    const report = await payments.recover({ signal: pending.signal });
    pending.check();
    const runtimeOwner = wallet,
      accountOwner = accounts,
      syncOwner = sync,
      paymentOwner = payments;
    const stopped = new AbortController(),
      active = new Set<Promise<unknown>>();
    let closing: Promise<void> | undefined;
    const check = () => {
      if (stopped.signal.aborted) throw closed();
      runtimeOwner.session.check();
    };
    function call<A extends Op, R>(method: (args: A) => Promise<R>, defaults = false): (args: A) => Promise<R> {
      return (args) => {
        check();
        const original = defaults && args === undefined ? {} : args;
        const owned = callInput(original as A);
        const caller = operation(owned.signal);
        let work: ReturnType<typeof operation>;
        try {
          caller.check();
          if (active.size >= runtime.maxQueuedJobs) {
            throw failure(
              'RESOURCE_LIMIT',
              'runtime',
              'configure',
              'Wallet work queue is full.',
            );
          }
          work = operation(AbortSignal.any([caller.signal, stopped.signal]));
        } catch (error) {
          caller.close();
          throw error;
        }
        let result: Promise<R>;
        try {
          result = Promise.resolve(method({ ...owned, signal: work.signal }));
        } catch (error) {
          work.close();
          caller.close();
          throw error;
        }
        active.add(result);
        void result.finally(() => {
          active.delete(result);
          work.close();
          caller.close();
        }).catch(() => { });
        return result;
      };
    }
    const propose: WalletClient['propose'] = policy
      ? walletPropose(proposals, syncOwner, policy)
      : async () => {
        throw noPolicy();
      };
    const execute = walletExecute(runtimeOwner, accountOwner, proposals, paymentOwner, propose);
    const api: WalletClient = {
      network: input.network,
      recovery: report,
      accounts: Object.freeze({
        ...accountOwner.api,
        create: call(accountOwner.api.create),
        import: call(accountOwner.api.import) as typeof accountOwner.api.import,
        list: call(accountOwner.api.list, true),
        get: call(accountOwner.api.get),
        remove: call(accountOwner.api.remove),
        attachSigner: call(accountOwner.api.attachSigner),
        detachSigner: call(accountOwner.api.detachSigner),
      }),
      addresses: Object.freeze({
        current: call(runtimeOwner.session.addresses.current),
        next: call(runtimeOwner.session.addresses.next),
        list: call(runtimeOwner.session.addresses.list),
        at: call(runtimeOwner.session.addresses.at),
      }),
      pczt: Object.freeze({
        export: call(proposals.export.bind(proposals)),
        import: call(proposals.import.bind(proposals)),
      }),
      operations: Object.freeze({
        abandon: call(paymentOwner.operations.abandon),
        get: call(paymentOwner.operations.get),
        list: call(paymentOwner.operations.list, true),
        resume: call(paymentOwner.operations.resume),
      }),
      propose: call(propose),
      send: call(execute.send),
      shield: call(execute.shield),
      build: call(args => proposals.build(args)),
      prove: call(args => proposals.prove(args)),
      sign: call(walletSign(proposals, runtimeOwner.session, accountOwner)),
      finalize: call(args => paymentOwner.finalize(args)),
      broadcast: call(args => paymentOwner.broadcast(args)),
      getBalance: call(
        args => runtimeOwner.session.getBalance({ ...snapshot(args, ['accountId', 'signal']), confirmations }),
      ),
      getHistory: call(runtimeOwner.session.getHistory),
      getTransaction: call(runtimeOwner.session.getTransaction),
      listNotes: call(runtimeOwner.session.listNotes),
      listUtxos: call(runtimeOwner.session.listUtxos),
      sync: call(args => syncOwner.sync(args), true),
      getSyncStatus: call(args => syncOwner.getSyncStatus(args), true),
      watchSync(args = {}): AsyncIterableIterator<SyncStatus> {
        check();
        const owned = snapshot(args, ['signal']);
        let iterator: ReturnType<WalletSync['watchSync']> | undefined,
          caller: ReturnType<typeof operation> | undefined,
          pending: ReturnType<typeof operation> | undefined,
          done = false,
          reading = false;
        const finish = () => {
          done = true;
          pending?.close();
          caller?.close();
        };
        const read = call(async () => iterator!.next());
        return {
          [Symbol.asyncIterator]() {
            return this;
          },
          async next() {
            check();
            if (done) return { done: true as const, value: undefined };
            if (reading) {
              throw failure(
                'RESOURCE_LIMIT',
                'sync',
                'configure',
                'Concurrent sync observation reads are unsupported.',
              );
            }
            reading = true;
            try {
              if (!iterator) {
                caller = operation(owned.signal);
                caller.check();
                pending = operation(AbortSignal.any([caller.signal, stopped.signal]));
                iterator = syncOwner.watchSync({ signal: pending.signal });
              }
              const result = await read({});
              if (result.done) finish();
              return result;
            } catch (error) {
              finish();
              throw error;
            } finally {
              reading = false;
            }
          },
          async return() {
            finish();
            return iterator ? iterator.return!() : { done: true as const, value: undefined };
          },
        };
      },
      close() {
        if (closing) return closing;
        closing = Promise.resolve().then(async () => {
          const results = await Promise.allSettled(draining);
          await Promise.allSettled([...active]);
          let closeError: unknown;
          try {
            await accountOwner.close();
          } catch (error) {
            closeError = error;
          }
          const failed = results.find(value => value.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          if (closeError) throw closeError;
        });
        stopped.abort();
        const draining = [syncOwner.stop(), paymentOwner.close()];
        return closing;
      },
    };
    return Object.freeze(api);
  } catch (error) {
    await Promise.allSettled([sync?.stop(), payments?.close()]);
    if (accounts) await accounts.close().catch(() => { });
    else await wallet?.close().catch(() => { });
    throw error;
  } finally {
    pending.close();
  }
}

export function createZcashClient(args: ZcashClient): ZcashClient {
  const input = snapshot(args, ['public', 'light', 'wallet']);
  const network = dataField(input.wallet, 'network') as Network;
  networkBinding(network);
  matching(input.public, network);
  matching(input.light, network);
  return Object.freeze(input);
}
