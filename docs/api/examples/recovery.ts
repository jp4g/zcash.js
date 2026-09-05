import type { PaymentState, WalletClient } from "zcash.js";

declare const reopened: WalletClient; // same durable database, no signer required
// Application selects intended operation from saved context or paginated journal.
declare const savedOperationId: string;
declare function render(state: PaymentState): void;
declare function requestMissingMaterial(state: PaymentState): void;

const pending = await reopened.operations.resume({ operationId: savedOperationId });
const state = await pending.snapshot();
render(state);
if (state.missing.length > 0) {
  requestMissingMaterial(state); // resume itself never prompts or rebuilds
} else {
  render(await pending.broadcast()); // reconcile, then exact stored bytes only
  await pending.wait({ confirmations: 3, timeoutMs: 120_000 });
}
