use super::*;
use crate::fixture::*;
use prost::Message;
use rusqlite::Connection;
use crate::observation::{snapshot, canonical_snapshot};
use std::path::Path;
use zcash_client_backend::data_api::chain::scan_cached_blocks;
fn freeze(path: &str, bytes: &[u8]) {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures").join(path);
    if std::env::var_os("SCANNER_FREEZE").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bytes).unwrap();
    }
    assert!(std::fs::read(&path).expect("frozen fixture exists; explicit SCANNER_FREEZE=1 to generate") == bytes, "fixture drift: {}", path.display());
}


#[test]
fn frozen_native_reference_matches_inline() {
    let corpus = generate();
    assert_eq!(corpus.0.len(), 7);
    assert_eq!(corpus.0[4].vtx.iter().map(|t| t.outputs.len()).sum::<usize>(), 1025);
    for b in &corpus.0 { freeze(&format!("{}.pb", b.height()), &b.encode_to_vec()); }
    let corpus = frozen();
    let mut reference = setup();
    let mut inline = setup();
    for conn in [&mut reference, &mut inline] { wallet(conn).update_chain_tip(100_006.into()).unwrap(); }
    eprintln!("reference scan-start");
    let summary = scan_cached_blocks(&network(), &corpus, &mut wallet(&mut reference), 100_000.into(), &initial(), 7).unwrap();
    eprintln!("reference scan-complete (observed on cached return)");
    eprintln!("reference commit-complete");
    assert_eq!(summary.received_sapling_note_count(), 2);
    assert_eq!(summary.spent_sapling_note_count(), 1);
    let canonical = canonical_snapshot(&reference);
    freeze("native-reference.json", &serde_json::to_vec_pretty(&canonical).unwrap());
    inline_scan(&network(), &mut wallet(&mut inline), &initial(), &corpus.0).unwrap();
    assert_eq!(canonical, canonical_snapshot(&inline));
}

fn scan_inline(conn: &mut Connection, corpus: &Corpus) {
    wallet(conn).update_chain_tip(100_006.into()).unwrap();
    let counts = inline_scan(&network(), &mut wallet(conn), &initial(), &corpus.0).unwrap();
    assert_eq!(counts, Counts { sapling_received: 2, sapling_spent: 1, ironwood_received: 2, ironwood_spent: 1 });
}
fn tree_checks(conn: &mut Connection, corpus: &Corpus) -> (String, String) {
    use zcash_client_backend::data_api::WalletCommitmentTrees;
    use shardtree::store::ShardStore;
    let state = chain_state(&corpus.0);
    let tip = state.block_height();
    let retained = [100000u32, 100002, 100004, 100006].map(Into::into).into_iter().collect();
    let s = wallet(conn).with_sapling_tree_mut(|t| {
        assert_eq!(t.store().retained_checkpoints().unwrap(), retained);
        let root = t.root_at_checkpoint_id(&tip)?.unwrap();
        assert_eq!(root, state.final_sapling_tree().root());
        // A usable witness for change, including 1,025 later irrelevant commitments.
        let leaf = sapling::Node::from_bytes(corpus.0[2].vtx[0].outputs[0].cmu.as_slice().try_into().unwrap()).unwrap();
        let path = t.witness_at_checkpoint_id(1u64.into(), &tip)?.unwrap();
        assert_eq!(path.root(leaf), root);
        Ok::<_, shardtree::error::ShardTreeError<_>>(hex::encode(root.to_bytes()))
    }).unwrap();
    let i = wallet(conn).with_ironwood_tree_mut(|t| {
        assert_eq!(t.store().retained_checkpoints().unwrap(), retained);
        let root = t.root_at_checkpoint_id(&tip)?.unwrap();
        assert_eq!(root, state.final_ironwood_tree().root());
        let leaf = orchard::tree::MerkleHashOrchard::from_bytes(corpus.0[3].vtx[0].ironwood_actions[0].cmx.as_slice().try_into().unwrap()).unwrap();
        let path = t.witness_at_checkpoint_id(1u64.into(), &tip)?.unwrap();
        assert_eq!(path.root(leaf), root);
        Ok::<_, shardtree::error::ShardTreeError<_>>(hex::encode(root.to_bytes()))
    }).unwrap();
    (s, i.expect("Ironwood tree active"))
}
#[test]
fn roots_checkpoints_witnesses_and_explicit_values() {
    let corpus = frozen();
    let mut conn = setup();
    scan_inline(&mut conn, &corpus);
    let roots = tree_checks(&mut conn, &corpus);
    freeze("roots.json", &serde_json::to_vec_pretty(&roots).unwrap());
    for (pool, expected) in [("sapling", vec![(30000, 1, 1), (50000, 0, 0)]), ("ironwood", vec![(45000, 1, 1), (70000, 0, 0)])] {
        let rows: Vec<(i64,i64,i64)> = conn.prepare(&format!("SELECT value, commitment_tree_position, is_change FROM {pool}_received_notes ORDER BY value")).unwrap()
            .query_map([], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?))).unwrap().map(Result::unwrap).collect();
        assert_eq!(rows, expected);
        let spends: i64 = conn.query_row(&format!("SELECT count(*) FROM {pool}_received_note_spends"), [], |r| r.get(0)).unwrap();
        assert_eq!(spends, 1);
    }
    assert_eq!(conn.query_row::<i64,_,_>("SELECT count(*) FROM ironwood_received_notes WHERE note_version = 3", [], |r| r.get(0)).unwrap(), 2);
}

#[test]
fn continuity_and_encoding_failures_commit_nothing() {
    let corpus = frozen();
    for kind in ["hash", "height", "commitment", "first_hash", "hash_length"] {
        let mut conn = setup();
        wallet(&mut conn).update_chain_tip(100_006.into()).unwrap();
        let before = snapshot(&conn);
        let mut broken = corpus.clone();
        match kind {
            "hash_length" => broken.0[2].hash.clear(),
            "hash" => broken.0[2].prev_hash[0] ^= 1,
            "height" => broken.0[2].height += 1,
            "commitment" => broken.0[2].vtx[0].outputs[0].cmu = vec![255;32],
            _ => broken.0[0].prev_hash[0] ^= 1,
        }
        let result = inline_scan(&network(), &mut wallet(&mut conn), &initial(), &broken.0);
        assert!(result.is_err(), "{kind}");
        eprintln!("failure {kind}: {result:?}");
        assert_eq!(before, snapshot(&conn), "{kind} changed database");
    }
}

#[test]
fn conflicting_frontier_commit_is_atomic() {
    use zcash_client_backend::data_api::WalletCommitmentTrees;
    let corpus = frozen();
    for pool in ["sapling", "ironwood"] {
        let mut conn = setup();
        wallet(&mut conn).update_chain_tip(100_006.into()).unwrap();
        inline_scan(&network(), &mut wallet(&mut conn), &initial(), &corpus.0[..2]).unwrap();
        let captured = chain_state(&corpus.0[..2]);
        let mut s = captured.final_sapling_tree().clone();
        let mut i = captured.final_ironwood_tree().clone();
        // Same-sized, distinct, valid field-element leaf; no private tree logic.
        if pool == "sapling" { s = incrementalmerkletree::frontier::Frontier::empty(); s.append(sapling::Node::from_bytes([1;32]).unwrap()); }
        else { i = incrementalmerkletree::frontier::Frontier::empty(); i.append(orchard::tree::MerkleHashOrchard::from_bytes(&[1;32]).unwrap()); }
        let bad = zcash_client_backend::data_api::chain::ChainState::new(captured.block_height(), captured.block_hash(), s, captured.final_orchard_tree().clone(), i);
        let before = snapshot(&conn);
        let mut stages = vec![];
        let result = inline_scan_observed(&network(), &mut wallet(&mut conn), &bad, &corpus.0[2..], |s| stages.push(s));
        assert!(matches!(&result, Err(ScanFailure::Commit(zcash_client_sqlite::error::SqliteClientError::PutBlocksCommitmentTree { .. }))), "{pool}: conflicting frontier must fail with typed commitment-tree error: {result:?}");
        assert_eq!(stages, ["scan-start", "scan-complete"]);
        assert_eq!(before, snapshot(&conn), "{pool}: rows/trees/scan queue changed");
        eprintln!("atomic conflicting {pool}: {result:?}");
        // Public trees remain usable after the failed commit.
        wallet(&mut conn).with_sapling_tree_mut(|t| t.root_at_checkpoint_id(&captured.block_height())).unwrap();
    }
}

#[test]
fn rewind_uses_returned_height_and_replays_suffix() {
    let corpus = frozen();
    let mut conn = setup();
    scan_inline(&mut conn, &corpus);
    let before = snapshot(&conn);
    let roots = tree_checks(&mut conn, &corpus);
    let actual = wallet(&mut conn).truncate_to_height(100_001.into()).unwrap();
    eprintln!("rewind requested=100001 actual={actual}");
    let prefix = corpus.0.iter().take_while(|b| b.height() <= actual).count();
    let state = chain_state(&corpus.0[..prefix]);
    inline_scan(&network(), &mut wallet(&mut conn), &state, &corpus.0[prefix..]).unwrap();
    assert_eq!(roots, tree_checks(&mut conn, &corpus));
    let after = snapshot(&conn);
    // Rewind can materialize an empty cap and preserve reference marks. Compare
    // these internal encodings with the same native cached rewind/replay below.
    let storage_tables = ["sapling_tree_shards", "ironwood_tree_shards", "sapling_tree_cap", "orchard_tree_cap", "ironwood_tree_cap"];
    for (table, rows) in &before {
        if !storage_tables.contains(&table.as_str()) { assert_eq!(rows, &after[table], "{table}"); }
    }
    let mut reference = setup();
    wallet(&mut reference).update_chain_tip(100_006.into()).unwrap();
    scan_cached_blocks(&network(), &corpus, &mut wallet(&mut reference), 100_000.into(), &initial(), 7).unwrap();
    let native_actual = wallet(&mut reference).truncate_to_height(100_001.into()).unwrap();
    assert_eq!(actual, native_actual);
    scan_cached_blocks(&network(), &corpus, &mut wallet(&mut reference), actual+1, &state, corpus.0.len()-prefix).unwrap();
    assert_eq!(tree_checks(&mut reference, &corpus), roots);
    assert_eq!(canonical_snapshot(&reference), canonical_snapshot(&conn));
    freeze("native-replayed.json", &serde_json::to_vec_pretty(&canonical_snapshot(&reference)).unwrap());
}

#[test]
fn transparent_receipt_replay_and_parsed_spend_separate_from_compact() {
    use zcash_client_backend::{data_api::{InputSource, wallet::{TargetHeight, decrypt_and_store_transaction}}, wallet::WalletTransparentOutput};
    use zcash_keys::keys::UnifiedAddressRequest;
    use zcash_transparent::{address::Script, bundle::{OutPoint, TxIn, TxOut, Bundle, Authorized}, keys::TransparentKeyScope};
    use zcash_primitives::transaction::{Transaction, TransactionData};
    use zcash_protocol::{consensus::BranchId, value::Zatoshis};
    let mut conn = setup();
    let mut db = wallet(&mut conn);
    db.update_chain_tip(100_006.into()).unwrap();
    let account = db.get_account_ids().unwrap()[0];
    let ua = db.get_last_generated_address_matching(account, UnifiedAddressRequest::AllAvailableKeys).unwrap().unwrap();
    let addr = ua.transparent().unwrap();
    let outpoint = OutPoint::new(bytes("transparent-receipt"), 0);
    let utxo = WalletTransparentOutput::from_parts(outpoint.clone(), TxOut::new(Zatoshis::const_from_u64(100000), addr.script().into()), Some(100_000.into()), Some(account), Some(TransparentKeyScope::EXTERNAL), None).unwrap();
    let id = db.put_received_transparent_utxo(&utxo).unwrap();
    assert_eq!(id, db.put_received_transparent_utxo(&utxo).unwrap());
    let target = TargetHeight::from(zcash_protocol::consensus::BlockHeight::from_u32(100_007));
    let received = db.get_unspent_transparent_output(&outpoint, target).unwrap().unwrap();
    assert_eq!(received.value(), Zatoshis::const_from_u64(100000));
    let request_count = db.transaction_data_requests().unwrap().len();
    assert!(request_count > 0);
    let destination = key(1).to_unified_full_viewing_key().default_address(UnifiedAddressRequest::AllAvailableKeys).unwrap().0;
    let tx = TransactionData::<zcash_primitives::transaction::Authorized>::from_parts_v6(
        BranchId::Nu6_3, 0, 100_020.into(), Some(Bundle { vin: vec![TxIn::from_parts(outpoint.clone(), Script::default(), u32::MAX)],
        vout: vec![TxOut::new(Zatoshis::const_from_u64(90000), destination.transparent().unwrap().script().into())], authorization: Authorized }), None, None, None).freeze().unwrap();
    let mut raw = vec![]; tx.write(&mut raw).unwrap();
    freeze("transparent-spend.bin", &raw);
    // Parse the fixed bytes through the genuine transaction decoder before wallet ingestion.
    let parsed = Transaction::read(raw.as_slice(), BranchId::Nu6_3).unwrap();
    assert_eq!(tx.txid(), parsed.txid());
    eprintln!("transparent receipt-complete requests={request_count}; spend-start");
    decrypt_and_store_transaction(&network(), &mut db, &parsed, Some(100_003.into())).unwrap();
    assert!(db.get_unspent_transparent_output(&outpoint, target).unwrap().is_none());
    drop(db);
    let once = snapshot(&conn);
    decrypt_and_store_transaction(&network(), &mut wallet(&mut conn), &parsed, Some(100_003.into())).unwrap();
    assert_eq!(once, snapshot(&conn));
    eprintln!("transparent spend-complete; receipt and spend replay idempotent");
    freeze("transparent-reference.json", &serde_json::to_vec_pretty(&canonical_snapshot(&conn)).unwrap());
}

#[test]
fn ufvk_import_and_multiple_batches_match_reference() {
    use zcash_client_backend::data_api::{AccountBirthday, AccountPurpose};
    use zcash_client_sqlite::wallet::init::WalletMigrator;
    let corpus = frozen();
    let imported = || {
        let mut conn = Connection::open_in_memory().unwrap();
        rusqlite::vtab::array::load_module(&conn).unwrap();
        let mut db = wallet(&mut conn);
        WalletMigrator::new().init_or_migrate(&mut db).unwrap();
        db.import_account_ufvk("synthetic F2", &key(0).to_unified_full_viewing_key(), &AccountBirthday::from_parts(initial(), None), AccountPurpose::Spending { derivation: None }, None).unwrap();
        db.update_chain_tip(100_006.into()).unwrap();
        conn
    };
    let mut reference = imported();
    let mut inline = imported();
    for (start, end) in [(0,1), (1,2), (2,4), (4,7)] {
        let state = chain_state(&corpus.0[..start]);
        scan_cached_blocks(&network(), &corpus, &mut wallet(&mut reference), state.block_height()+1, &state, end-start).unwrap();
        let counts = inline_scan(&network(), &mut wallet(&mut inline), &state, &corpus.0[start..end]).unwrap();
        if start == 1 {
            assert_eq!(counts, Counts { sapling_received: 0, sapling_spent: 0, ironwood_received: 1, ironwood_spent: 0 });
            eprintln!("Ironwood-only nonempty batch: {counts:?}");
        }
        assert_eq!(canonical_snapshot(&reference), canonical_snapshot(&inline));
        let requests = |conn: &mut Connection| { let mut v: Vec<_> = wallet(conn).transaction_data_requests().unwrap().iter().map(|r| format!("{r:?}")).collect(); v.sort(); v };
        assert_eq!(requests(&mut reference), requests(&mut inline));
    }
    assert_eq!(tree_checks(&mut reference, &corpus), tree_checks(&mut inline, &corpus));
}
