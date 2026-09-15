import type { ConfirmationsPolicy, ObservationOptions, RecoveryPolicy } from './types.js';
import { snapshot } from './clients/owned-plumbing.js';
import { invalidArgument } from './errors.js';

function positive(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw invalidArgument();
}

export function observationOptions(value: ObservationOptions): ObservationOptions {
  const input = snapshot(value, ['pollIntervalMs', 'maxBufferedUpdates']);
  positive(input.pollIntervalMs);
  positive(input.maxBufferedUpdates);
  return Object.freeze(input);
}

export function confirmationsPolicy(value: ConfirmationsPolicy): ConfirmationsPolicy {
  const input = snapshot(value, ['trusted', 'untrusted', 'allowZeroConfirmationShielding']);
  for (const count of [input.trusted, input.untrusted]) {
    if (!Number.isInteger(count) || count < 0 || count > 0xffff_ffff) throw invalidArgument();
  }
  if (typeof input.allowZeroConfirmationShielding !== 'boolean') throw invalidArgument();
  return Object.freeze(input);
}

export function recoveryPolicy(
  value: RecoveryPolicy | undefined, hasLight: boolean, hasBroadcaster: boolean,
): RecoveryPolicy {
  const input = value === undefined
    ? hasLight ? { mode: 'online', timeoutMs: 15000 } as const : { mode: 'offline' } as const
    : snapshot(value, ['mode', 'timeoutMs', 'rebroadcast']);
  if (input.mode === 'offline') {
    if (Object.keys(input).some(key => key !== 'mode')) throw invalidArgument();
    return Object.freeze({ mode: 'offline' });
  }
  if (input.mode !== 'online' || !hasLight) throw invalidArgument();
  positive(input.timeoutMs);
  const retry = input.rebroadcast === undefined
    ? undefined
    : snapshot(input.rebroadcast, ['mode', 'maxAttempts', 'minIntervalMs']);
  if (retry) {
    if (retry.mode !== 'previously-dispatched' || !hasBroadcaster) throw invalidArgument();
    positive(retry.maxAttempts);
    positive(retry.minIntervalMs);
  }
  return Object.freeze({
    mode: 'online', timeoutMs: input.timeoutMs, ...(retry ? { rebroadcast: Object.freeze(retry) } : {}),
  });
}
