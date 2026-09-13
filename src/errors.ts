import type { ErrorInfo, SyncStatus, ZcashError, PaymentState } from '../docs/api/public-api.js';

// A local identity check never reads properties/getters from a foreign exception.
const errors = new WeakSet<object>();

export function isZcashError(value: unknown): value is ZcashError {
  return typeof value === 'object' && value !== null && errors.has(value);
}

/** Internal only: all messages are fixed SDK text, never foreign exception text. */
export function failure(
  code: ErrorInfo['code'],
  stage: ErrorInfo['stage'],
  recovery: ErrorInfo['recovery'],
  message: string,
  retryable = false,
  syncStatus?: SyncStatus,
  paymentState?: PaymentState,
): ZcashError {
  const error: ZcashError = Object.assign(new Error(message), {
    name: 'ZcashError', code, stage, recovery, retryable,
    ...(syncStatus === undefined ? {} : { syncStatus }),
    ...(paymentState===undefined?{}:{operationId:paymentState.operationId,paymentState}),
  });
  errors.add(error);
  return Object.freeze(error);
}

export function invalidArgument(): ZcashError {
  return failure('INVALID_ARGUMENT', 'validation', 'correct-input', 'Invalid argument.');
}
