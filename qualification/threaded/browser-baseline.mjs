import { baseline } from './baseline-worker.mjs';
addEventListener('message', async ({ data }) => {
  try { postMessage({ type: 'result', result: { ...await baseline(data), context: {
    secure: isSecureContext, isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer } } }); }
  catch (error) { postMessage({ type: 'error', error: String(error) }); }
}, { once: true });
