import type { WalletCommand } from './commands.js';
import { mnemonicCommand } from './commands.js';
import { invalidArgument } from '../errors.js';
import { snapshot as fields, copyRecord } from '../clients/owned-plumbing.js';
import { networkBinding } from '../network.js';
import { saplingAssets } from './proving-assets.js';

/** Structural bounds only; the common copier owns allocation and aggregate accounting. */
export interface CopyBounds {
  readonly bytes?: number;
  readonly items?: number;
  readonly fields?: Readonly<Record<string, CopyBounds>>;
  readonly element?: CopyBounds;
}
const provingBounds: CopyBounds = {
  fields: {
    spend: { bytes: saplingAssets[0].byteLength }, output: { bytes: saplingAssets[1].byteLength },
  },
};
const inventoryBounds: CopyBounds = {
  fields: {
    result: {
      fields: {
        transactions: { items: 1000, element: { fields: { unspentOutputs: { items: 1000 } } } },
      },
    },
  },
};
const mnemonicBounds: CopyBounds = { fields: { mnemonic: { bytes: 4096 }, passphrase: { bytes: 65536 } } };

function accountInput(command: WalletCommand, args: unknown) {
  const input = fields(args, command === 'account_import'
    ? ['viewingKey', 'birthday', 'name', 'viewOnly', 'enabledPools', 'signal']
    : command === 'account_create_mnemonic_signer'
      ? ['mnemonic', 'passphrase', 'name', 'signal']
      : ['mnemonic', 'passphrase', 'accountIndex', 'birthday', 'name', 'signal']);
  if (mnemonicCommand(command) && (!(input.mnemonic instanceof Uint8Array)
    || input.passphrase !== undefined && !(input.passphrase instanceof Uint8Array))) throw invalidArgument();
  if (command === 'account_create_mnemonic_signer' || input.birthday === 'fullScan') return input;
  const birthday = fields(
    input.birthday,
    ['network', 'firstScanHeight', 'priorTreeState', 'recoverUntilExclusive', 'source'],
  );
  const { definition } = networkBinding(birthday.network);
  const { network: _network, ...checkpoint } = birthday;
  void _network;
  return {
    ...input,
    birthday: {
      ...checkpoint,
      parameters: definition.parameters.bytes,
      genesis: Uint8Array.from(definition.genesisHash.match(/../g)!.reverse(), byte => parseInt(byte, 16)),
    },
  };
}

export function prepareCommand(command: WalletCommand, args: object, pcztMaximum: number): {
  args: object; bounds: CopyBounds; maxDepth: number;
} {
  const maximum = Math.min(pcztMaximum, 4 * 1024 * 1024);
  const result = (args: object, bounds: CopyBounds = {}, maxDepth = 5) => ({ args, bounds, maxDepth });
  switch (command) {
    case 'enhancement_apply': {
      const input = fields(args as unknown, ['revision', 'request', 'result', 'signal']);
      const request = fields(
        input.request,
        ['kind', 'txid', 'address', 'start', 'endExclusive', 'requestAt', 'txStatus', 'outputStatus'],
      );
      const inventory = request.kind === 'address' && request.txStatus === 'all'
        && request.outputStatus === 'unspent' && request.endExclusive === null;
      return result({ ...input, request }, inventory ? inventoryBounds : {}, inventory ? 6 : 5);
    }
    case 'account_import':
    case 'account_import_mnemonic_signer':
    case 'account_create_mnemonic_signer':
      return result(accountInput(command, args), mnemonicCommand(command) ? mnemonicBounds : {});
    case 'pczt_prove':
    case 'pczt_finalize':
      return result(
        { ...fields(args as unknown, ['operationId', 'artifactId', 'spend', 'output', 'signal']), maximum },
        provingBounds,
      );
    case 'fused_send':
      return result(
        {
          ...fields(
            args as unknown,
            ['operationId', 'proposalId', 'reviewCommitment', 'token', 'spend', 'output', 'signal'],
          ),
          maximum,
        },
        provingBounds,
      );
    case 'pczt_import':
      return result(
        { ...fields(args as unknown, ['operationId', 'bytes', 'signal'], maximum), maximum },
        { fields: { bytes: { bytes: maximum } } },
      );
    case 'payment_attempt_begin':
      return result({
        ...fields(
          args as unknown,
          ['operationId', 'stepIndex', 'sourceId', 'routeBinding', 'mode', 'origin', 'wallTimeMs',
            'monotonicElapsedMs', 'observationSequence', 'policy', 'signal'],
        ),
        maximum: Math.min(pcztMaximum, 2 * 1024 * 1024),
      });
    case 'signer_authorize': {
      const input = copyRecord(
        args as unknown,
        ['token', 'format', 'parameters', 'genesis', 'height', 'branch', 'bytes', 'maximum', 'signal'],
      );
      if (typeof input.maximum !== 'number' || !Number.isSafeInteger(input.maximum)
        || input.maximum < 1) throw invalidArgument();
      const allowed = Math.min(maximum, input.maximum);
      return result({ ...input, maximum: allowed }, { fields: { bytes: { bytes: allowed } } });
    }
    default: return result(args);
  }
}
