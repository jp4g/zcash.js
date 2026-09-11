export function dispatch(e, state, host, command) {
  const { op } = command;
  if (op === 'fault') { state.fault = command.fault; return { rc: 0 }; }
  if (op === 'crash') { state.crash = command.crash; return { rc: 0 }; }
  if (op === 'trace') return { trace: state.trace, last: state.last, directorySyncs: host.directorySyncs };
  if (op === 'inspect') return host.inspect();
  let rc;
  switch (op) {
    case 'open': rc = e.st_open(); break;
    case 'seed': rc = e.st_seed(); break;
    case 'verify': rc = e.st_verify(); break;
    case 'verifyCommitted': rc = e.st_verify_committed(); break;
    case 'close': rc = e.st_close(); if (rc === 0) host.release(); break;
    case 'update': rc = e.st_update(command.commit ? 1 : 0); break;
    case 'rollback': rc = e.st_rollback(); break;
    case 'migrate': rc = e.st_migrate(command.fail ? 1 : 0); break;
    case 'version': return { version: e.st_version() };
    case 'policy': rc = e.st_policy_check(); break;
    case 'allocator': {
      if (e.rt_grow(24 * 1024 * 1024) !== 1 || e.rt_pool_check() !== 1 || e.rt_heap_check() !== 1 || e.rt_hosts() !== 1 || e.rt_pairing() !== 1) throw Error('allocator/host/crypto control');
      return { rc: 0, poolStart: e.rt_pool_start(), poolSize: e.rt_pool_size(), heapBase: e.__heap_base.value };
    }
    default: throw Error('unknown command');
  }
  return { rc, last: state.last };
}
