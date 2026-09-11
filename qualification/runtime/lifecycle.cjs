const assert = require('node:assert/strict');
const { runWorker } = require('./worker-harness.cjs');
function assertSchemaAbsent(count) {
  assert.equal(count, 0, 'successful schema query must prove fixture absence');
}
async function lifecycle(createWorker, options) {
  const original = await runWorker(createWorker('destruction'), options);
  assert.equal(original.ok, true);
  // runWorker settles only after termination; no two living instances.
  const fresh = await runWorker(createWorker('destruction-fresh'), options);
  assert.equal(fresh.ok, true);
  return { ok: true, scenario: 'destruction', original, fresh };
}
module.exports = { lifecycle, assertSchemaAbsent };
