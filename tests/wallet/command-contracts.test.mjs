import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import ts from 'typescript';

test('wallet commands tie host input and result types to their dispatch methods', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wallet-command-types-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const source = join(directory, 'consumer.mts');
  await writeFile(source, `
    import type {WalletCommand, WalletInput, WalletResult} from ${JSON.stringify(resolve('dist/src/wallet/commands.js'))};
    import type {attachWalletWorker} from ${JSON.stringify(resolve('dist/src/wallet/host.js'))};
    declare function call<C extends WalletCommand>(command: C, args: WalletInput<C>): Promise<WalletResult<C>>;
    declare const wallet: ReturnType<typeof attachWalletWorker>;
    call('payment_get', {operationId: 'id'});
    call('scan_state', undefined);
    call('pczt_prove', {operationId: 'id', artifactId: 'artifact', spend: new Uint8Array(), output: new Uint8Array()});
    // @ts-expect-error A payment lookup needs an operation ID.
    call('payment_get', {height: 1});
    // @ts-expect-error Command results cannot be asserted independently at the call site.
    const wrong: Promise<string> = call('payment_get', {operationId: 'id'});
    // @ts-expect-error Host wrappers preserve the command's inferred result.
    const wrongHost: Promise<string> = wallet.payments.get({operationId: 'id'});
    // @ts-expect-error Proving requires both assets.
    call('pczt_prove', {operationId: 'id', artifactId: 'artifact', spend: new Uint8Array()});
    // @ts-expect-error Signer tokens are numeric native handles.
    call('signer_release', {token: 'token'});
  `);
  const program = ts.createProgram([source], {strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext});
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')), []);
});
