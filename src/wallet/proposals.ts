import type { AccountId, Network, Op, Pool, Proposal, ProposedOutput, PcztArtifact, ReviewedOutput, TransactionPolicy, WalletPcztApi, LocalProvingOptions } from '../../docs/api/public-api.js';
import type { openWalletRuntime } from '../runtime/wallet.js';
import {ProvingAssets} from './proving-assets.js';
import {operation} from '../clients/light-chain-reads.js';
import { networkBinding } from '../network.js';
import { failure, invalidArgument } from '../errors.js';
import { ownBytes, snapshot } from '../clients/owned-plumbing.js';

export type NativeProposalIntent = {
  readonly accountId: AccountId; readonly idempotencyKey?: string;
  readonly policy: Omit<TransactionPolicy, 'freshness' | 'shieldingThreshold'>;
  readonly maxFee?: bigint;
} & ({ readonly kind?: never;
  readonly payments: readonly { readonly to: string; readonly amount: bigint; readonly memo?: Uint8Array | null }[];
} | { readonly kind: 'shield'; readonly threshold: bigint; readonly fromAddresses?: readonly string[] });
export type NativeProposalInput = NativeProposalIntent & {readonly revision: string};
export interface NativeProposalReview {
  readonly operationId: string; readonly proposalId: string; readonly reviewCommitment: string;
  readonly accountId: AccountId; readonly revision: string; readonly targetHeight: number;
  readonly branchId: number; readonly expiryHeight: number; readonly lockExpiryHeight: number; readonly totalFee: bigint;
  readonly steps: readonly (Omit<Proposal['steps'][number], 'outputs'> & {
    readonly outputs: readonly { readonly accountId: AccountId | null; readonly pool: Pool; readonly address: string | null;
      readonly amount: bigint; readonly memo: Uint8Array | null; readonly kind: 'payment' | 'change' | 'step-funding' }[];
  })[];
}
export interface NativePcztBuildInput { readonly operationId: string; readonly proposalId: string; readonly reviewCommitment: string }
export interface NativePcztArtifact {
  readonly operationId: string; readonly artifactId: string; readonly accountId: AccountId;
  readonly outputs: readonly (Omit<ReviewedOutput, 'memo'> & { readonly memo: Uint8Array | null })[];
  readonly requiresSaplingProofs?: boolean; readonly requiresIronwoodProof?: boolean; readonly requiresOrchardProof?: boolean;
  readonly bytes: Uint8Array; readonly proofsComplete: boolean; readonly authorizationComplete: boolean;
}
export interface ProposalInventoryInput { readonly afterSequence: string; readonly highWater?: string; readonly limit: number }
export interface ProposalInventory { readonly highWater: string; readonly items: readonly { readonly sequence: string; readonly operationId: string }[] }
type Session = Awaited<ReturnType<typeof openWalletRuntime>>['session'];
const proposals = new WeakMap<Proposal, Readonly<{ session: Session; operationId: string; proposalId: string; reviewCommitment: string }>>();
const artifacts = new WeakMap<PcztArtifact, Readonly<{ session: Session; operationId: string; artifactId: string }>>();
const protocol = () => failure('PROTOCOL_MISMATCH','proposal','reopen','Native proposal review does not match its context.');

/** Private composition after wallet policy/freshness admission; not WalletClient.propose. */
export class WalletProposals {
  private readonly proving?:ProvingAssets;
  private reserved=false;
  constructor(private readonly session: Session, private readonly network: Network, proving?:LocalProvingOptions) { networkBinding(network);if(proving)this.proving=new ProvingAssets(proving); }
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
  async create(args: NativeProposalInput & Op): Promise<Proposal> {
    const value=await this.session.proposals.create(args);
    try { return this.project(value); }
    catch(error) {
      const rejected=typeof error==='object'&&error!==null?error:protocol();
      this.session.committed(rejected,value);throw rejected;
    }
  }
  async lookup(args: NativeProposalIntent & {idempotencyKey:string} & Op): Promise<Proposal|null> {
    const value=await this.session.proposals.lookup(args);return value===null?null:this.project(value);
  }
  async restore(args: { operationId: string } & Op): Promise<Proposal | null> {
    const value=await this.session.proposals.get(args);return value===null?null:this.project(value);
  }
  async build(args: { proposal: Proposal } & Op): Promise<PcztArtifact> {
    const input=snapshot(args,['proposal','signal']),binding=proposalBinding(input.proposal,this.session);
    const value=await this.session.pczt.build({...binding,...(input.signal===undefined?{}:{signal:input.signal})});
    return this.projectArtifact(value,binding.operationId,input.proposal.accountIds[0]);
  }
  async prove(args: {pczt:PcztArtifact} & Op):Promise<PcztArtifact> {
    const input=snapshot(args,['pczt','signal']),binding=pcztArtifactBinding(input.pczt,this.session);
    const pending=operation(input.signal);let release:(()=>void)|undefined,working:(()=>void)|undefined;
    try {
      pending.check();if(!this.proving)throw failure('PROVING_MATERIAL_REQUIRED','proving','configure','Local proving is not configured.');
      release=this.session.pczt.startProof();
      const retained=await this.session.pczt.get({...binding,signal:pending.signal});pending.check();
      if(!retained)throw protocol();
      if([retained.requiresSaplingProofs,retained.requiresIronwoodProof,retained.requiresOrchardProof].some(value=>typeof value!=='boolean'))throw protocol();
      if(retained.requiresOrchardProof)throw failure('ROLE_PRECONDITION','proving','correct-input','Legacy Orchard proving is unsupported.');
      let assets:{spend:Uint8Array;output:Uint8Array}={spend:new Uint8Array(),output:new Uint8Array()};
      if(retained.requiresSaplingProofs){
        this.session.pczt.checkProvingAssets();
        if(!this.reserved){this.session.pczt.reserveProving(this.proving.cacheReservation,()=>this.proving!.close());this.reserved=true;}
        working=this.session.pczt.reserveProving(this.proving.workingReservation,()=>this.proving!.close());
        assets=await this.proving.sapling(pending.signal);
      }
      pending.check();
      const value=await this.session.pczt.prove({...binding,...assets,signal:pending.signal});
      return this.projectArtifact(value,binding.operationId,input.pczt.accountIds[0]);
    }finally{working?.();release?.();pending.close();}
  }
  async import(args: Parameters<WalletPcztApi['import']>[0]): Promise<PcztArtifact> {
    const input=snapshot(args,['operationId','bytes','signal'],this.session.pczt.maximum);
    const value=await this.session.pczt.import(input);
    return this.projectArtifact(value,input.operationId);
  }
  private projectArtifact(value: NativePcztArtifact, operationId: string, accountId?: AccountId): PcztArtifact {
    try {
      if(value.operationId!==operationId||!/^[0-9a-f]{64}$/.test(value.artifactId)
        ||typeof value.accountId!=='string'||!value.accountId||(accountId!==undefined&&value.accountId!==accountId)||typeof value.proofsComplete!=='boolean'||typeof value.authorizationComplete!=='boolean'
        ||!Array.isArray(value.outputs)||value.outputs.length>256)throw protocol();
      const outputs=value.outputs.map(output=>{
        if(typeof output.address!=='string'||!output.address||typeof output.amount!=='bigint'||output.amount<0n
          ||!['transparent','sapling','ironwood'].includes(output.pool)||!['payment','change','step-funding'].includes(output.kind))throw protocol();
        const bytes=output.memo===null?null:ownBytes(output.memo,protocol,protocol,512);
        return Object.freeze({...output,memo:bytes===null?null:Object.freeze({get bytes(){return bytes.slice();}})});
      });
      const result=Object.freeze({operationId:value.operationId,artifactId:value.artifactId,accountIds:Object.freeze([value.accountId]),
        outputs:Object.freeze(outputs),proofsComplete:value.proofsComplete,authorizationComplete:value.authorizationComplete}) as unknown as PcztArtifact;
      artifacts.set(result,Object.freeze({session:this.session,operationId:value.operationId,artifactId:value.artifactId}));
      return result;
    } catch(error) {const rejected=typeof error==='object'&&error!==null?error:protocol();this.session.committed(rejected,value);throw rejected;}
  }
  list(args: ProposalInventoryInput & Op): Promise<ProposalInventory> { return this.session.proposals.list(args); }
}

/** Execution uses only retained native IDs, never the caller-visible effect fields. */
export function proposalBinding(proposal: Proposal, session: Session) {
  const value=proposals.get(proposal);
  if(!value)throw invalidArgument();
  if(value.session!==session)throw failure('WRONG_INSTANCE','proposal','none','Proposal belongs to another wallet instance.');
  session.check();
  return Object.freeze({operationId:value.operationId,proposalId:value.proposalId,reviewCommitment:value.reviewCommitment});
}

/** Native retained artifact identity, never caller-visible output fields. */
export function pcztArtifactBinding(artifact: PcztArtifact, session: Session) {
  const value=artifacts.get(artifact);if(!value)throw invalidArgument();
  if(value.session!==session)throw failure('WRONG_INSTANCE','proposal','none','PCZT belongs to another wallet instance.');
  session.check();return Object.freeze({operationId:value.operationId,artifactId:value.artifactId});
}
