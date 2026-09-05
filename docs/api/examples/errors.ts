import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;
declare const pending: Contract.PendingPayment;
declare const signal: AbortSignal;
declare function showRecovery(code: Contract.ErrorCode, recovery: Contract.ErrorInfo['recovery']): void;
declare function retainPrivateState(state: Contract.PaymentState): void;

try {
  await pending.wait({ timeoutMs: 120_000, signal });
} catch (error: unknown) {
  if (!sdk.isZcashError(error)) throw error;
  showRecovery(error.code, error.recovery);
  if (error.paymentState) retainPrivateState(error.paymentState);
  // No blind retry, automatic logging or release of locks.
}
