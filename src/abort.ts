import { invalidArgument } from './errors.js';

const NativeController = AbortController;
const nativeSignal = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal')!.get!;
export const signalAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const nativeAbort = AbortController.prototype.abort;
const nativeAny = AbortSignal.any.bind(AbortSignal);
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const nodeHost = (globalThis as { process?: { versions?: { node?: string }; getBuiltinModule(name: string): unknown } }).process;
const getBuiltin = nodeHost?.getBuiltinModule?.bind(nodeHost);
const nodeRuntime = typeof nodeHost?.versions?.node === 'string';

// Web IDL rejects signal proxies intrinsically; Node needs its proxy-proof check.
export const unsupportedSignalProxy: (value: unknown) => boolean = (() => {
  try { signalAborted.call(new Proxy(new NativeController().signal, {})); }
  catch { return () => false; }
  return (getBuiltin?.('node:util') as typeof import('node:util') | undefined)?.types.isProxy ?? (() => true);
})();

export function admitSignal(signal: unknown): asserts signal is AbortSignal | undefined {
  if (signal === undefined) return;
  try {
    if (typeof signal !== 'object' || signal === null || unsupportedSignalProxy(signal) || Object.getPrototypeOf(signal) !== AbortSignal.prototype
      || Object.hasOwn(signal, 'aborted') || Object.hasOwn(signal, 'reason')) throw invalidArgument();
    signalAborted.call(signal);
  } catch { throw invalidArgument(); }
}

/** Forward native cancellation without consulting caller getters or event methods. */
// HTTP callbacks can mutate prototypes; protect only signals consumed by HTTP.
// Other adapters require a native signal without own aborted/reason properties.
export async function bridgeSignal(original?: AbortSignal, protect = false) {
  if (original === undefined) return { signal: undefined, close() {} };
  try {
    if (unsupportedSignalProxy(original)) throw invalidArgument();
    signalAborted.call(original);
    const controller = new NativeController();
    const signal: AbortSignal = nativeSignal.call(controller);
    if (protect) Object.defineProperties(signal, {
      aborted: { get: () => signalAborted.call(signal) },
      addEventListener: { value: nativeAdd.bind(signal) },
      removeEventListener: { value: nativeRemove.bind(signal) },
    });
    let closed = false;
    const onAbort = () => {
      if (!closed && signalAborted.call(original)) nativeAbort.call(controller);
    };
    let dispose: () => void;
    if (nodeRuntime) {
      const { addAbortListener } = getBuiltin!('node:events') as typeof import('node:events');
      // addAbortListener resists stopImmediatePropagation, but reads public methods.
      const view: AbortSignal = nativeSignal.call(new NativeController());
      Object.defineProperties(view, {
        aborted: { get: () => signalAborted.call(original) },
        addEventListener: { value: (type: string, listener: EventListener, options: AddEventListenerOptions) =>
          // Synthetic events must not consume the native cancellation listener.
          nativeAdd.call(original, type, listener, { ...options, once: false }) },
        removeEventListener: { value: nativeRemove.bind(original) },
      });
      const subscription = addAbortListener(view, onAbort);
      const release = subscription[Symbol.dispose];
      dispose = () => Reflect.apply(release, subscription, []);
    } else {
      // Browser dependent signals propagate independently of caller event delivery.
      const dependent = nativeAny([original]);
      nativeAdd.call(dependent, 'abort', onAbort);
      dispose = () => nativeRemove.call(dependent, 'abort', onAbort);
    }
    onAbort();
    return { signal, close() { if (!closed) { closed = true; dispose(); } } };
  } catch { throw invalidArgument(); }
}

/** Wait on an SDK-owned signal; detach after each chunk instead of retaining races. */
export function waitFor<T>(value: PromiseLike<T> | T, signal: AbortSignal, error: () => unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => nativeRemove.call(signal, 'abort', onAbort);
    const onAbort = () => { cleanup(); reject(error()); };
    // Always observe late rejection, even when cancellation has already won.
    Promise.resolve(value).then(result => { cleanup(); resolve(result); }, reason => { cleanup(); reject(reason); });
    if (signalAborted.call(signal)) onAbort();
    else nativeAdd.call(signal, 'abort', onAbort, { once: true });
  });
}
