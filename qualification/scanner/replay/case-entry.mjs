// Environment-neutral entry reusable after a threaded worker's own real bootstrap.
import { validateCaseResult } from './case-contract.mjs';
export function executeCase({ bindings, name, expected, onStage }) {
  if (typeof bindings.scanner_case !== 'function') throw Error('scanner_case binding missing');
  const stages = [];
  const result = JSON.parse(bindings.scanner_case(name, stage => {
    stages.push(stage);
    onStage(stage);
  }));
  validateCaseResult(name, result, expected, stages);
  return { result, stages };
}
