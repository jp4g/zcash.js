//! Disposable public scanner orchestration; not a production SDK.
use zcash_client_backend::{data_api::{WalletWrite, WalletRead, chain::ChainState}, proto::compact_formats::CompactBlock};
use zcash_protocol::consensus::Parameters;

pub fn inline_scan<P, W>(_params: &P, _wallet: &mut W, _state: &ChainState, _blocks: &[CompactBlock]) -> Result<(), String>
where P: Parameters + Send + 'static, W: WalletWrite,
      <W as WalletRead>::AccountId: subtle::ConditionallySelectable + Default + Send + Sync + 'static,
{
    Err("RED: inline orchestration not implemented".into())
}

#[cfg(all(test, feature = "native-fixtures"))]
mod tests;

#[cfg(feature = "native-fixtures")]
pub mod fixture;
