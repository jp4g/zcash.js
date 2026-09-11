// Qualification supervisor. Runs outside every WASM worker so blocking Rust cannot
// prevent a deadline or whole-domain teardown. Never accepts/replays an operation
// during startup or fallback. All compute workers are direct children of this host.
export class Domain {
  constructor({ spawn, count = 2, timeout = 10000, fallback, init = {}, event = () => {} }) {
    if (!Number.isInteger(count) || count < 1 || count > 8) throw Error('worker count must be 1..8');
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw Error('timeout');
    Object.assign(this, { spawn, count, timeout, fallback, init, event });
    this.state = 'new'; this.workers = []; this.pending = new Map(); this.sequence = 0;
  }
  start() {
    if (this.startPromise) return this.startPromise;
    if (this.state !== 'new') return Promise.reject(Error('domain closed'));
    this.state = 'starting';
    this.startPromise = new Promise((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    this.timer = setTimeout(() => void this.fail(Error('bootstrap timeout')), this.timeout);
    try { this.owner = this.add('owner'); this.owner.postMessage({ ...this.init, type: 'init', role: 'owner', count: this.count }); }
    catch (error) { void this.fail(error); }
    return this.startPromise;
  }
  add(role, index) {
    const worker = this.spawn(role, index); this.workers.push(worker);
    worker.onerror = error => void this.fail(Error(String(error.message ?? error)));
    worker.onmessage = ({ data }) => {
      try { this.message(worker, role, data); } catch (error) { void this.fail(error); }
    };
    return worker;
  }
  message(worker, role, data) {
    if (['closing', 'closed', 'failed', 'fallback'].includes(this.state)) return;
    this.event({ role, ...data });
    if (data.type === 'error') throw Error(data.error);
    if (role === 'owner' && data.type === 'pool') {
      if (this.state !== 'starting' || this.pool) throw Error('unexpected pool request');
      this.pool = []; this.loaded = new Set();
      for (let index = 0; index < this.count; index++) {
        const child = this.add('compute', index); this.pool.push(child);
        child.postMessage({ ...this.init, ...data, type: 'init', role: 'compute', index });
      }
    } else if (role === 'compute' && data.type === 'loaded') {
      if (!this.pool?.includes(worker) || this.loaded.has(worker)) throw Error('duplicate/unknown worker');
      this.loaded.add(worker);
      if (this.loaded.size === this.count) this.owner.postMessage({ type: 'build' });
    } else if (role === 'owner' && data.type === 'ready') {
      if (this.state !== 'starting' || this.loaded?.size !== this.count) throw Error('premature readiness');
      clearTimeout(this.timer); this.state = 'ready'; this.resolveStart(data);
    } else if (role === 'owner' && data.type === 'result') {
      if (this.state !== 'ready') throw Error('result before ready');
      const request = this.pending.get(data.id); if (!request) throw Error('unknown operation result');
      clearTimeout(request.timer); this.pending.delete(data.id); request.resolve(data.result);
    } else throw Error(`unexpected message ${role}/${data.type}`);
  }
  call(operation, args = []) {
    if (this.state !== 'ready') throw Error('domain not ready');
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => void this.fail(Error('operation timeout; effects unknown')), this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.owner.postMessage({ type: 'call', id, operation, args }); }
      catch (error) { void this.fail(error); }
    });
  }
  async fail(error) {
    if (['failed', 'closed', 'closing', 'fallback'].includes(this.state)) return;
    const startup = this.state === 'starting'; this.state = 'failed'; clearTimeout(this.timer);
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    try {
      await this.terminate();
      if (startup && this.fallback && !this.closedByCaller) {
        this.state = 'fallback'; this.resolveStart(await this.fallback(error.message));
      } else if (startup) this.rejectStart(error);
    } catch (cleanupError) { this.rejectStart?.(cleanupError); this.cleanupError = cleanupError; }
  }
  terminate() {
    if (!this.termination) this.termination = Promise.all(this.workers.map(async worker => { await worker.terminate(); }));
    return this.termination;
  }
  async close() {
    this.closedByCaller = true;
    if (this.state === 'starting') this.rejectStart(Error('closed during bootstrap'));
    this.state = 'closing'; clearTimeout(this.timer);
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(Error('closed; effects unknown')); }
    this.pending.clear(); await this.terminate(); this.state = 'closed';
  }
}
