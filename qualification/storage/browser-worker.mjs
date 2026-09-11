import { acquire } from './opfs.mjs';
import { load } from './load.mjs';
import { dispatch } from './dispatch.mjs';
let host, runtime, failure;
onmessage = async ({ data }) => {
  try {
    if (data.op === 'prepare') {
      if (host || runtime || failure) throw Error('prepare once');
      host = await acquire(data.root, { create: data.create, crash: v => postMessage(v) });
      runtime = await load(await (await fetch('./storage_bg.wasm')).arrayBuffer(), host);
      postMessage({ rc: 0, secure: isSecureContext, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer });
    } else if (failure) { postMessage(failure); }
    else { postMessage(dispatch(runtime.e, runtime.state, host, data)); }
  } catch (e) {
    if (!runtime) host?.release();
    failure = { error: e.message, code: e.code ?? e.name }; postMessage(failure);
  }
};
