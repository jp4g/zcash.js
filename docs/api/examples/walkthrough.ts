import type * as Contract from '../public-api.js';

declare const sdk: typeof Contract;

// Every value/callback is application-owned synthetic fixture context.
interface ReviewContext {
  network: Contract.Network;
  rpcUrl: string;
  lightUrl: string;
  runtime: Contract.RuntimeOptions;
  storage: Exclude<Contract.WalletStorage, { kind: 'memory' }>;
  proving: Contract.LocalProvingOptions;
  transactionPolicy: Contract.TransactionPolicy;
  onboarding: { kind: 'create'; mnemonic: Contract.SecretInput }
    | { kind: 'recover'; mnemonic: Contract.SecretInput;
        accountIndex: Contract.AccountIndex; birthday: Contract.Birthday | 'fullScan' }
    | { kind: 'ufvk'; viewingKey: string; birthday: Contract.Birthday | 'fullScan';
        signer: Contract.Signer };
  recipient: string;
  idempotencyKey: string;
  renderReceive(address: string): void;
  inspect(balance: Contract.WalletBalance, history: Contract.HistoryPage): void;
  review(proposal: Contract.Proposal): Promise<boolean>;
  saveOperationId(id: string): Promise<void>;
  recoverSavedOperationId(): Promise<string | null>;
  showPayment(state: Contract.PaymentState): void;
  showMissing(state: Contract.PaymentState): void;
  showError(code: Contract.ErrorCode): void;
}

export async function walkthrough(app: ReviewContext): Promise<void> {
  // #region setup
  const transportOptions: Contract.TransportOptions = {
    sourceId: 'review-light', timeoutMs: 15_000,
    readRetry: { attempts: 1, delayMs: 0 }, maxResponseBytes: 4_000_000,
  };
  const observation = { pollIntervalMs: 5_000, maxBufferedUpdates: 32 };
  const publicClient = sdk.createPublicClient({
    network: app.network,
    transport: sdk.http(app.rpcUrl, { ...transportOptions, sourceId: 'review-rpc' }),
    observation,
  });
  const light = sdk.createLightClient({
    network: app.network, transport: sdk.grpc(app.lightUrl, transportOptions),
  });
  const options: Contract.WalletOptions = {
    network: app.network, runtime: app.runtime, storage: app.storage,
    light, broadcaster: publicClient, proving: app.proving,
    transactionPolicy: app.transactionPolicy,
    confirmations: app.transactionPolicy.confirmations, observation,
  };
  const wallet = await sdk.createWalletClient(options);
  // #endregion setup
  let localSigner: Contract.MemorySigner | undefined;
  let binding: Contract.SignerBinding | undefined;
  let operationId: string | null = null;
  try {
    // #region onboarding
    if (app.onboarding.kind === 'create') {
      const synced = await wallet.sync(); // establish current local chain/tree state first
      if (!synced.targetReached) return;
    }
    let account: Contract.AccountRecord;
    let signer: Contract.Signer;
    if (app.onboarding.kind === 'ufvk') {
      account = await wallet.accounts.import({
        viewingKey: app.onboarding.viewingKey,
        birthday: app.onboarding.birthday, viewOnly: false,
      });
      signer = app.onboarding.signer; // application retains ownership
    } else {
      const created = app.onboarding.kind === 'create'
        ? await wallet.accounts.create({ mnemonic: app.onboarding.mnemonic })
        : await wallet.accounts.import({
            mnemonic: app.onboarding.mnemonic,
            accountIndex: app.onboarding.accountIndex,
            birthday: app.onboarding.birthday,
          });
      account = created.account;
      localSigner = created.signer; // caller-owned and initially unattached
      signer = localSigner;
    }
    binding = await wallet.accounts.attachSigner({ accountId: account.id, signer });
    if (binding.state !== 'ready') return; // present recovery-required UX
    // #endregion onboarding

    // #region receive
    const initialSync = await wallet.sync();
    if (!initialSync.targetReached) return;
    const issued = await wallet.addresses.next({
      accountId: account.id,
      request: { format: 'unified', transparent: 'omit', sapling: 'require', ironwood: 'require' },
    });
    app.renderReceive(issued.address);
    // A separate fixture sender would fund this address. This book sends no funds.
    await wallet.sync();
    const balance = await wallet.getBalance({ accountId: account.id });
    const history = await wallet.getHistory({ accountId: account.id, limit: 50 });
    app.inspect(balance, history);
    if (balance.amounts === null || balance.scan.scanComplete !== true) return;
    // Rust proposal selection still decides sufficient funds and eligibility.
    // #endregion receive

    // #region send
    const proposal = await wallet.propose({
      accountId: account.id, to: app.recipient, amount: 125_000n,
      idempotencyKey: app.idempotencyKey,
    });
    operationId = proposal.operationId;
    await app.saveOperationId(operationId); // private application state, never telemetry
    if (!await app.review(proposal)) return;
    const pending = await wallet.send({ proposal }); // verified attached signer
    app.showPayment(await pending.snapshot());
    await pending.wait({ confirmations: 3, timeoutMs: 120_000 });
    // #endregion send
  } catch (error: unknown) {
    if (!sdk.isZcashError(error)) throw error;
    operationId = error.operationId ?? operationId;
    if (operationId !== null) await app.saveOperationId(operationId);
    if (error.paymentState) app.showPayment(error.paymentState);
    app.showError(error.code); // no raw error or private payload logging
  } finally {
    try { await binding?.dispose(); }
    finally {
      try { await wallet.close(); }
      finally { await localSigner?.dispose(); }
    }
  }

  // #region restart
  // Models a later process/tab session; do not repeat onboarding on reopen.
  const savedId = await app.recoverSavedOperationId();
  if (savedId === null) return; // alternatively inspect all operations pages
  const reopened = await sdk.createWalletClient(options);
  try {
    const pending = await reopened.operations.resume({ operationId: savedId });
    const state = await pending.snapshot(); // resume itself has no network/signing side effect
    app.showPayment(state);
    if (state.missing.length > 0) {
      app.showMissing(state); // no implicit signer prompt or invented restore method
      return;
    }
    app.showPayment(await pending.broadcast()); // reconcile; retry exact bytes if appropriate
    await pending.wait({ confirmations: 3, timeoutMs: 120_000 });
  } catch (error: unknown) {
    if (!sdk.isZcashError(error)) throw error;
    if (error.paymentState) app.showPayment(error.paymentState);
    app.showError(error.code);
  } finally {
    await reopened.close();
  }
  // #endregion restart
}
