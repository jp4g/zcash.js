//! Disposable public scanner orchestration; not a production SDK.
use zcash_client_backend::{
    data_api::{WalletRead, WalletWrite, chain::ChainState},
    proto::compact_formats::CompactBlock,
    scanning::{Nullifiers, ScanningKeys, scan_block},
};
use zcash_protocol::consensus::Parameters;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Counts {
    pub sapling_received: usize,
    pub sapling_spent: usize,
    pub ironwood_received: usize,
    pub ironwood_spent: usize,
}

#[derive(Debug)]
pub enum ScanFailure<E> {
    Validation(&'static str),
    Read(E),
    Scan(zcash_client_backend::scanning::ScanError),
    Commit(E),
}
impl<E> From<&'static str> for ScanFailure<E> {
    fn from(message: &'static str) -> Self { Self::Validation(message) }
}

/// The caller owns exclusive wallet access for this synchronous operation.
/// All blocks scan before a single unchanged transactional `put_blocks` call.
/// The first predecessor hash is checked even when DB metadata is absent; this is
/// deliberately stronger input validation than the cached scanner's None case.
pub fn inline_scan<P, W>(params: &P, wallet: &mut W, state: &ChainState, blocks: &[CompactBlock]) -> Result<Counts, ScanFailure<<W as WalletRead>::Error>>
where
    P: Parameters + Send + 'static,
    W: WalletWrite,
    <W as WalletRead>::AccountId: subtle::ConditionallySelectable + Default + Send + Sync + 'static,
{
    inline_scan_observed(params, wallet, state, blocks, |stage| eprintln!("inline {stage}"))
}

pub fn inline_scan_observed<P, W>(params: &P, wallet: &mut W, state: &ChainState, blocks: &[CompactBlock], mut stage: impl FnMut(&'static str)) -> Result<Counts, ScanFailure<<W as WalletRead>::Error>>
where
    P: Parameters + Send + 'static,
    W: WalletWrite,
    <W as WalletRead>::AccountId: subtle::ConditionallySelectable + Default + Send + Sync + 'static,
{
    if blocks.is_empty() || blocks.len() > 16 {
        return Err("validation: expected 1..=16 blocks".into());
    }
    if blocks.iter().any(|b| b.height >= u64::from(u32::MAX) || b.hash.len() != 32 || b.prev_hash.len() != 32 || b.vtx.iter().any(|t| t.txid.len() != 32)) {
        return Err("validation: block height or identity encoding".into());
    }
    let commitments: usize = blocks.iter().flat_map(|b| &b.vtx)
        .map(|t| t.outputs.len() + t.actions.len() + t.ironwood_actions.len()).sum();
    if commitments > 4096 { return Err("validation: commitment limit".into()); }
    if blocks[0].height != u64::from(u32::from(state.block_height())) + 1
        || blocks[0].prev_hash != state.block_hash().0 {
        return Err("validation: initial continuity".into());
    }
    let keys = ScanningKeys::from_account_ufvks(wallet.get_unified_full_viewing_keys().map_err(ScanFailure::Read)?);
    let mut prior = wallet.block_metadata(state.block_height()).map_err(ScanFailure::Read)?;
    let mut nullifiers = Nullifiers::unspent(wallet).map_err(ScanFailure::Read)?;
    let mut scanned = Vec::with_capacity(blocks.len());
    let mut counts = Counts::default();
    stage("scan-start");
    for block in blocks {
        let next = scan_block(params, block.clone(), &keys, &nullifiers, prior.as_ref())
            .map_err(ScanFailure::Scan)?;
        for tx in next.transactions() {
            counts.sapling_received += tx.sapling_outputs().len();
            counts.sapling_spent += tx.sapling_spends().len();
            counts.ironwood_received += tx.ironwood_outputs().len();
            counts.ironwood_spent += tx.ironwood_spends().len();
        }
        nullifiers.update_with(&next);
        prior = Some(next.to_block_metadata());
        scanned.push(next);
    }
    stage("scan-complete");
    wallet.put_blocks(state, scanned).map_err(ScanFailure::Commit)?;
    stage("commit-complete");
    Ok(counts)
}

#[cfg(any(feature = "native-fixtures", feature = "wasm-replay"))]
pub mod fixture;
#[cfg(all(test, feature = "native-fixtures"))]
mod tests;

#[cfg(any(feature = "native-fixtures", feature = "wasm-replay"))]
pub mod observation;
#[cfg(all(feature = "wasm-replay", target_arch = "wasm32"))]
mod wasm;

#[cfg(any(feature = "native-fixtures", feature = "wasm-replay"))]
pub mod cases;
