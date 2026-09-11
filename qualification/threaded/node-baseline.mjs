import { parentPort, threadId } from 'node:worker_threads';
import { baseline } from './baseline-worker.mjs';
parentPort.once('message', async data => {
  try { parentPort.postMessage({ type: 'result', result: { ...await baseline(data), hostThreadId: threadId } }); }
  catch (error) { parentPort.postMessage({ type: 'error', error: String(error) }); }
});
