import type { AccountId, Network, Op, Pool, Proposal, ProposedOutput, TransactionPolicy } from '../../docs/api/public-api.js';
import type { openWalletRuntime } from '../runtime/wallet.js';
import { networkBinding } from '../network.js';
import { failure, invalidArgument } from '../errors.js';
import { ownBytes } from '../clients/owned-plumbing.js';

export interface NativeProposalInput {
  readonly revision: string; readonly accountId: AccountId;
  readonly payments: readonly { readonly to: string; readonly amount: bigint; readonly memo?: Uint8Array | null }[];
  readonly policy: Omit<TransactionPolicy, 'freshness' | 'shieldingThreshold'>;
  readonly maxFee?: bigint;
}
export interface NativeProposalReview {
  readonly operationId: string; readonly proposalId: string; readonly reviewCommitment: string;
  readonly accountId: AccountId; readonly revision: string; readonly targetHeight: number;
  readonly branchId: number; readonly expiryHeight: number; readonly lockExpiryHeight: number; readonly totalFee: bigint;
  readonly steps: readonly (Omit<Proposal['steps'][number], 'outputs'> & {
    readonly outputs: readonly { readonly accountId: AccountId | null; readonly pool: Pool; readonly address: string | null;
      readonly amount: bigint; readonly memo: Uint8Array | null; readonly kind: 'payment' | 'change' | 'step-funding' }[];
  })[];
}
export interface ProposalInventoryInput { readonly afterSequence: string; readonly highWater?: string; readonly limit: number }
export interface ProposalInventory { readonly highWater: string; readonly items: readonly { readonly sequence: string; readonly operationId: string }[] }
type Session = Awaited<ReturnType<typeof openWalletRuntime>>['session'];
const proposals = new WeakMap<Proposal, Readonly<{ session: Session; operationId: string; proposalId: string; reviewCommitment: string }>>();
const protocol = () => failure('PROTOCOL_MISMATCH','proposal','reopen','Native proposal review does not match its context.');

/** Private composition after wallet policy/freshness admission; not WalletClient.propose. */
export class WalletProposals {
  constructor(private readonly session: Session, private readonly network: Network) { networkBinding(network); }
  private project(value: NativeProposalReview): Proposal {
    const bound=networkBinding(this.network);
    if (![value.operationId,value.proposalId,value.reviewCommitment].every(id=>typeof id==='string'&&/^[0-9a-f]{64}$/.test(id))
      || !value.steps.length || bound.codec.consensusContext(bound.definition.parametersFormat,bound.definition.parameters.bytes,value.targetHeight).branchId!==value.branchId) throw protocol();
    const context=Object.freeze({network:this.network,targetHeight:value.targetHeight,branchId:value.branchId});
    const steps=value.steps.map(step=>Object.freeze({...step,dependsOn:Object.freeze([...step.dependsOn]),
      inputs:Object.freeze(step.inputs.map(input=>Object.freeze({...input,source:Object.freeze({...input.source})}))),
      outputs:Object.freeze(step.outputs.map(output=>{
        if(output.kind==='payment'&&output.address===null)throw protocol();
        const bytes=output.memo===null?null:ownBytes(output.memo,protocol,protocol,512);
        const memo=bytes===null?null:Object.freeze({get bytes(){return bytes.slice();}});
        return Object.freeze({...output,memo}) as ProposedOutput;
      }))}));
    const result=Object.freeze({operationId:value.operationId,proposalId:value.proposalId,accountIds:Object.freeze([value.accountId]),
      context,revision:value.revision,reviewCommitment:value.reviewCommitment,totalFee:value.totalFee,
      lockExpiryHeight:value.lockExpiryHeight,steps:Object.freeze(steps)}) as unknown as Proposal;
    proposals.set(result,Object.freeze({session:this.session,operationId:value.operationId,proposalId:value.proposalId,reviewCommitment:value.reviewCommitment}));
    return result;
  }
  async create(args: NativeProposalInput & Op): Promise<Proposal> { return this.project(await this.session.proposals.create(args)); }
  async restore(args: { operationId: string } & Op): Promise<Proposal | null> {
    const value=await this.session.proposals.get(args);return value===null?null:this.project(value);
  }
  list(args: ProposalInventoryInput & Op): Promise<ProposalInventory> { return this.session.proposals.list(args); }
}

/** Execution uses only retained native IDs, never the caller-visible effect fields. */
export function proposalBinding(proposal: Proposal, session: Session) {
  const value=proposals.get(proposal);
  if(!value)throw invalidArgument();
  if(value.session!==session)throw failure('WRONG_INSTANCE','proposal','none','Proposal belongs to another wallet instance.');
  return Object.freeze({operationId:value.operationId,proposalId:value.proposalId,reviewCommitment:value.reviewCommitment});
}
