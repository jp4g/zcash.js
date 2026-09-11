//! Native regression using a genuinely parsed header.
pub fn check() {
    use crate::{fixture::*, observation::snapshot, inline_scan_observed, ScanFailure};
    use zcash_client_backend::data_api::{WalletRead, WalletWrite};
    use zcash_primitives::block::{BlockHash, BlockHeaderData};
    let mut conn = setup();
    wallet(&mut conn).update_chain_tip(100_006.into()).unwrap();
    assert!(wallet(&mut conn).block_metadata(initial().block_height()).unwrap().is_none());
    let before = snapshot(&conn);
    let mut corpus = frozen();
    let b = &mut corpus.0[0];
    let header = BlockHeaderData { version: 4, prev_block: BlockHash([9;32]),
        merkle_root: [0;32], final_sapling_root: [0;32], time: b.time,
        bits: 0, nonce: [0;32], solution: vec![] }.freeze().unwrap();
    header.write(&mut b.header).unwrap();
    assert!(b.header().is_some());
    assert_eq!(b.prev_hash, initial().block_hash().0);
    assert_ne!(b.prev_hash(), initial().block_hash());
    let mut stages = vec![];
    let result = inline_scan_observed(&network(), &mut wallet(&mut conn), &initial(), &corpus.0[..1], |s| stages.push(s));
    assert_eq!(before, snapshot(&conn), "parsed header mismatch changed wallet rows: {result:?}");
    assert!(matches!(result, Err(ScanFailure::Validation(_))), "{result:?}");
    assert!(stages.is_empty());
}
