import { durability } from './storage.js';
export function dispatch(e, state, host, command) {
  if (command.op === 'crash') { state.trace.length = 0; state.crash = command.crash; return { rc: 0 }; }
  if (command.op === 'fault') { state.trace.length = 0; state.fault = command.fault; return { rc: 0 }; }
  if (command.op === 'trace') return { trace: state.trace, traceDropped: state.traceDropped, last: state.last };
  if (command.op === 'inspect') return host.inspect();
  // Return expected operation errors without poisoning the worker; later reads
  // establish whether rollback restored a usable wallet.
  try {
    const result = JSON.parse(durability(JSON.stringify(command)));
    if (command.op === 'walletClose') host.release();
    return result;
  } catch (error) { return { error: String(error), last: state.last }; }
}
