// Identical native-seeded shielding workflow for filesystem and OPFS owners.
import {defineNetwork} from '../../dist/src/index.js';
import {WalletProposals} from '../../dist/src/wallet/proposals.js';
import {walletPropose} from '../../dist/src/wallet/propose-intent.js';
import {WalletSync} from '../../dist/src/wallet/sync.js';
const check=(value,label)=>{if(!value)throw Error(label);};
const identity=value=>[value.operationId,value.proposalId,value.reviewCommitment];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const rejects=async(promise,code)=>{try{await promise;throw Error('unexpected proposal success');}catch(error){check(error.code===code,`expected ${code}, received ${error.code}`);}};
export async function shieldingChecks(session,fixture,definition,saved) {
  check(fixture?.database&&fixture.input,'source-bound native shielding fixture');
  const network=await defineNetwork(definition),proposals=new WalletProposals(session,network);
  const sync=new WalletSync(session,undefined,{pollIntervalMs:1000,maxBufferedUpdates:2});
  const input={...fixture.input,threshold:BigInt(fixture.input.threshold)};
  const policy={...input.policy,shieldingThreshold:input.threshold,freshness:{mode:'require-synced',maxLagBlocks:0}};
  const propose=walletPropose(proposals,sync,policy);
  const intent={kind:'shield',accountId:fixture.accountId,idempotencyKey:input.idempotencyKey};
  try {
    if(saved) {
      const inventory=await proposals.list({afterSequence:'0',limit:200});
      check(inventory.items.length===1,'reopen discovers retained shielding without saved operation ID');
      const restored=await proposals.restore({operationId:inventory.items[0].operationId});
      check(restored!==null&&same(identity(restored),saved),'reopened native proposal identity');
      check(same(identity(await propose(intent)),saved),'stale reopened idempotent public intent');
      return saved;
    }
    const before=await session.scan.state();
    // Native selection uses the emitted DB; no host-created transaction or funds.
    const plan=await proposals.create({...input,revision:before.revision});
    check(plan.steps[0].inputs.length===1&&plan.steps[0].inputs.every(value=>value.pool==='transparent'&&value.value===70000n),'native shielding consumes the fixture transparent input');
    check(plan.steps[0].outputs.length>0&&plan.steps[0].outputs.every(value=>value.pool==='sapling'&&value.address===null),'native shielding retains unresolved internal destination');
    check(plan.totalFee>0n&&plan.accountIds[0]===fixture.accountId,'native fee and account projection');
    const committed=await session.scan.state();
    await rejects(proposals.create({...input,revision:committed.revision,idempotencyKey:'exhausted-shield'}),'NOTHING_TO_SHIELD');
    check((await session.scan.state()).revision===committed.revision,'exhausted shielding does not mutate');
    await session.scan.plan({target:{height:before.tipHeight+1,hash:'41'.repeat(32)}});
    const stale=await sync.getSyncStatus();
    check(stale.scan.scanComplete===false,'native target advance makes local status stale');
    const repeated=await propose(intent);
    check(same(identity(repeated),identity(plan)),'same key bypasses stale freshness without reselection');
    await rejects(propose({...intent,threshold:input.threshold+1n}),'IDEMPOTENCY_CONFLICT');
    await rejects(propose({...intent,idempotencyKey:'new-stale-shield'}),'SYNC_REQUIRED');
    check((await session.scan.state()).revision===stale.scan.revision,'lookup/conflict/freshness checks do not mutate');
    check((await proposals.list({afterSequence:'0',limit:200})).items.length===1,'only one retained operation');
    return identity(plan);
  }finally{await sync.stop();}
}
