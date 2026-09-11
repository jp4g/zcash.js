// Shared result contract; neither this check nor worker termination requests prove lifecycle.
export const CASES = ['transparent', 'effects-trees', 'imported-batches', 'failures', 'rollback', 'rewind'];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function validateCaseResult(name, result, expected, stages) {
  if (!CASES.includes(name) || result?.schema !== 2 || result.case !== name || result.passed !== true) throw Error('case result identity');
  const start = stages.indexOf('case-start'), complete = stages.indexOf('case-complete'), match = stages.indexOf('reference-match');
  if (start < 0 || complete <= start || match <= complete || stages.filter(s => s === 'reference-match').length !== 1) throw Error('case result stages');
  if (JSON.stringify(canonical(result.result)) !== JSON.stringify(canonical(expected))) throw Error('case reference mismatch');
  return result;
}
