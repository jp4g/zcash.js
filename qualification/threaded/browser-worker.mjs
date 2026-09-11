import { install } from './worker.mjs';
install({ send: value => postMessage(value), listen: callback => addEventListener('message', ({ data }) => callback(data)),
  context: () => ({ secure: isSecureContext, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer }) });
