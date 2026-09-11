// Real browser Worker fixtures for harness controls ONLY; never runtime proof.
self.onmessage = ({ data }) => {
  if (data.scenario === 'bootstrap-error') throw new Error('intentional bootstrap control failure');
  if (data.scenario === 'malformed-result') { self.postMessage({ unexpected: true }); return; }
  self.postMessage({ type: 'control-started' });
  // Remain alive until the parent explicitly terminates the worker.
  setInterval(() => self.postMessage({ type: 'heartbeat' }), 25);
};
