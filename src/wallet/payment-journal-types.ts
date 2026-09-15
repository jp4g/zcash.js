import type { PaymentState, TransactionObservation, TxId } from '../types.js';

export type NativePaymentState = Omit<PaymentState, 'durability' | 'steps'>
  & {
    readonly steps: readonly (Omit<PaymentState['steps'][number], 'attempts'> & {
      readonly attempts: readonly (Omit<
        PaymentState['steps'][number]['attempts'][number],
        'startedAt' | 'completedAt'
      >
      & { readonly startedAt: number; readonly completedAt: number | null })[];
    })[];
  };
export interface NativePayment {
  readonly state: NativePaymentState;
  readonly observationSequence: string;
  readonly observationSequences: readonly string[];
}
export interface PaymentReconcile {
  readonly operationId: string;
  readonly wallTimeMs: number;
  readonly policy?: { readonly maxAttempts: number; readonly minIntervalMs: number };
}
export interface PaymentInventoryInput {
  readonly afterSequence: string;
  readonly highWater?: string;
  readonly limit: number;
  readonly accountId?: string;
}
export interface PaymentInventory {
  readonly revision: string;
  readonly highWater: string;
  readonly observationPosition: string;
  readonly items: readonly { sequence: string; operationId: string }[];
}
export interface PaymentObserve {
  readonly operationId: string;
  readonly stepIndex: number;
  readonly observation: TransactionObservation;
  readonly wallTimeMs: number;
}
export interface PaymentAttemptInput {
  readonly operationId: string;
  readonly stepIndex: number;
  readonly sourceId: string;
  readonly routeBinding: string | null;
  readonly mode: 'explicit' | 'automatic';
  readonly origin?: 'broadcast' | 'send' | 'shield';
  readonly wallTimeMs: number;
  readonly monotonicElapsedMs: number;
  readonly observationSequence: string;
  readonly policy?: { readonly maxAttempts: number; readonly minIntervalMs: number };
}
export interface PaymentAttempt { readonly attemptId: string; readonly bytes: Uint8Array; readonly txid: TxId }
export interface PaymentAttemptFinish {
  readonly operationId: string;
  readonly attemptId: string;
  readonly outcome: 'acknowledged' | 'rejected' | 'unknown';
  readonly txid?: TxId;
  readonly wallTimeMs: number;
  readonly diagnosticCode?: string;
}
export interface NativeFinalized {
  readonly operationId: string;
  readonly stepIndex: 0;
  readonly artifactId: string;
  readonly txid: TxId;
  readonly bytes: Uint8Array;
  readonly exactBytesSha256: string;
  readonly revision: string;
}
export interface NativeFusedInput {
  readonly operationId: string;
  readonly proposalId: string;
  readonly reviewCommitment: string;
  readonly token: number;
  readonly spend: Uint8Array;
  readonly output: Uint8Array;
}
export interface NativeFused {
  readonly operationId: string;
  readonly revision: string;
  readonly transactions: readonly (Omit<NativeFinalized, 'stepIndex' | 'artifactId'>
    & { readonly stepIndex: number; readonly artifactId: string | null })[];
}
