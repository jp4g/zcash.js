import { parentPort, threadId } from 'node:worker_threads';
import { install } from './worker.mjs';
install({ send: value => parentPort.postMessage({ ...value, hostThreadId: threadId }),
  listen: callback => parentPort.on('message', callback), context: () => ({ node: process.version, threadId }) });
