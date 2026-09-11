//! Portable, bounded real-wallet acceptance cases shared by native and WASM.
//! Assertions are qualification checks, not production error handling.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use rusqlite::Connection;
use zcash_client_backend::data_api::{WalletRead, WalletWrite, WalletCommitmentTrees, chain::ChainState};
use zcash_client_sqlite::error::SqliteClientError;
use crate::{ScanFailure, fixture::*, observation::{snapshot, canonical_snapshot}};

pub const CASES: [&str; 6] = [
    "transparent", "effects-trees", "imported-batches", "failures", "rollback", "rewind",
];
#[derive(Clone, Copy)]
pub enum Mode { Inline, NativeReference }

fn state_hash(conn: &Connection) -> String {
    hex::encode(Sha256::digest(serde_json::to_vec_pretty(&canonical_snapshot(conn)).unwrap()))
}
fn frozen_state(conn: &Connection, expected: &[u8]) {
    assert_eq!(serde_json::to_vec_pretty(&canonical_snapshot(conn)).unwrap(), expected);
}
fn ready() -> Connection {
    let mut conn = setup();
    wallet(&mut conn).update_chain_tip(100_006.into()).unwrap();
    conn
}
fn scan(mode: Mode, conn: &mut Connection, state: &ChainState, corpus: &Corpus, stage: &mut dyn FnMut(&str)) -> Result<(), ScanFailure<SqliteClientError>> {
    match mode {
        Mode::Inline => {
            crate::inline_scan_observed(&network(), &mut wallet(conn), state, &corpus.0, |s| stage(s))?;
            Ok(())
        }
        Mode::NativeReference => {
            #[cfg(not(target_arch = "wasm32"))]
            {
                use zcash_client_backend::data_api::chain::{scan_cached_blocks, error::Error};
                stage("scan-start");
                scan_cached_blocks(&network(), corpus, &mut wallet(conn), state.block_height()+1, state, corpus.0.len())
                    .map_err(|e| match e {
                        Error::Wallet(e) => ScanFailure::Commit(e),
                        Error::Scan(e) => ScanFailure::Scan(e),
                        other => panic!("unexpected reference error: {other:?}"),
                    })?;
                stage("scan-complete"); // cached API returns after commit; cannot independently observe its scan boundary
                stage("commit-complete");
                Ok(())
            }
            #[cfg(target_arch = "wasm32")]
            { Err(ScanFailure::Validation("native reference unavailable in WASM")) }
        }
    }
}
fn requests(conn: &mut Connection) -> Vec<String> {
    let mut requests: Vec<_> = wallet(conn).transaction_data_requests().unwrap().iter().map(|r| format!("{r:?}")).collect();
    requests.sort();
    requests
}

/// Read all checkpoint IDs/positions/retention and construct both receipt and change witnesses.
/// No tree algorithms are reimplemented: append/frontier/root/path APIs do the work.
fn trees(conn: &mut Connection, corpus: &Corpus) -> Value {
    use shardtree::store::ShardStore;
    let state = chain_state(&corpus.0);
    let tip = state.block_height();
    let expected_retained: Vec<u32> = vec![100000,100002,100004,100006];
    macro_rules! inspect {
        ($method:ident, $root:expr, $leaves:expr) => {
            wallet(conn).$method(|tree| {
                let retained: Vec<u32> = tree.store().retained_checkpoints().unwrap().into_iter().map(Into::into).collect();
                assert_eq!(retained, expected_retained);
                let mut checkpoints = vec![];
                tree.store().for_each_checkpoint(tree.store().checkpoint_count().unwrap(), |id, checkpoint| {
                    checkpoints.push(json!({"height": u32::from(*id), "position": checkpoint.position().map(u64::from)}));
                    Ok(())
                }).unwrap();
                assert_eq!(checkpoints.len(), 7);
                let root = tree.root_at_checkpoint_id(&tip)?.unwrap();
                assert_eq!(root, $root);
                let mut witnesses = vec![];
                for (position, leaf) in $leaves {
                    let path = tree.witness_at_checkpoint_id(position.into(), &tip)?.unwrap();
                    assert_eq!(path.root(leaf), root);
                    witnesses.push(json!({"position": u64::from(path.position()),
                        "path": path.path_elems().iter().map(|h| hex::encode(h.to_bytes())).collect::<Vec<_>>()}));
                }
                Ok::<_, shardtree::error::ShardTreeError<_>>(json!({"root": hex::encode(root.to_bytes()), "retained": retained,
                    "checkpoints": checkpoints, "witnesses": witnesses}))
            }).unwrap()
        }
    }
    let sapling_leaves = [(0u64, &corpus.0[0].vtx[0].outputs[0]), (1, &corpus.0[2].vtx[0].outputs[0])]
        .map(|(p, out)| (p, sapling::Node::from_bytes(out.cmu.as_slice().try_into().unwrap()).unwrap()));
    let ironwood_leaves = [(0u64, &corpus.0[1].vtx[0].ironwood_actions[0]), (1, &corpus.0[3].vtx[0].ironwood_actions[0])]
        .map(|(p, out)| (p, orchard::tree::MerkleHashOrchard::from_bytes(out.cmx.as_slice().try_into().unwrap()).unwrap()));
    let sapling = inspect!(with_sapling_tree_mut, state.final_sapling_tree().root(), sapling_leaves);
    let ironwood = inspect!(with_ironwood_tree_mut, state.final_ironwood_tree().root(), ironwood_leaves).expect("Ironwood active");
    let expected_roots: Vec<String> = serde_json::from_slice(include_bytes!("../fixtures/roots.json")).unwrap();
    assert_eq!(sapling["root"], expected_roots[0]);
    assert_eq!(ironwood["root"], expected_roots[1]);
    json!({"sapling": sapling, "ironwood": ironwood})
}
fn effects(mode: Mode, stage: &mut dyn FnMut(&str)) -> Value {
    let corpus = frozen();
    let mut conn = ready();
    scan(mode, &mut conn, &initial(), &corpus, stage).unwrap();
    frozen_state(&conn, include_bytes!("../fixtures/native-reference.json"));
    let tree_report = trees(&mut conn, &corpus);
    stage("witnesses-verified");
    json!({"canonical_sha256": state_hash(&conn), "trees": tree_report, "requests": requests(&mut conn)})
}
fn transparent(stage: &mut dyn FnMut(&str)) -> Value {
    use zcash_client_backend::{data_api::{InputSource, wallet::{TargetHeight, decrypt_and_store_transaction}}, wallet::WalletTransparentOutput};
    use zcash_keys::keys::UnifiedAddressRequest;
    use zcash_transparent::{bundle::{OutPoint, TxOut}, keys::TransparentKeyScope};
    use zcash_primitives::transaction::Transaction;
    use zcash_protocol::{consensus::{BranchId, BlockHeight}, value::Zatoshis};
    let mut conn = ready();
    let mut db = wallet(&mut conn);
    let account = db.get_account_ids().unwrap()[0];
    let ua = db.get_last_generated_address_matching(account, UnifiedAddressRequest::AllAvailableKeys).unwrap().unwrap();
    let outpoint = OutPoint::new(bytes("transparent-receipt"), 0);
    let utxo = WalletTransparentOutput::from_parts(outpoint.clone(), TxOut::new(Zatoshis::const_from_u64(100000), ua.transparent().unwrap().script().into()),
        Some(100000.into()), Some(account), Some(TransparentKeyScope::EXTERNAL), None).unwrap();
    let id = db.put_received_transparent_utxo(&utxo).unwrap();
    assert_eq!(id, db.put_received_transparent_utxo(&utxo).unwrap());
    let target = TargetHeight::from(BlockHeight::from_u32(100007));
    assert_eq!(db.get_unspent_transparent_output(&outpoint, target).unwrap().unwrap().value(), Zatoshis::const_from_u64(100000));
    drop(db);
    let before_requests = requests(&mut conn);
    assert!(!before_requests.is_empty());
    let once_received = snapshot(&conn);
    wallet(&mut conn).put_received_transparent_utxo(&utxo).unwrap();
    assert_eq!(once_received, snapshot(&conn));
    stage("transparent-receipt-idempotent");
    let raw = include_bytes!("../fixtures/transparent-spend.bin");
    let parsed = Transaction::read(raw.as_slice(), BranchId::Nu6_3).unwrap();
    let mut roundtrip = vec![]; parsed.write(&mut roundtrip).unwrap();
    assert_eq!(roundtrip, raw);
    decrypt_and_store_transaction(&network(), &mut wallet(&mut conn), &parsed, Some(100003.into())).unwrap();
    assert!(wallet(&mut conn).get_unspent_transparent_output(&outpoint, target).unwrap().is_none());
    let once_spent = snapshot(&conn);
    decrypt_and_store_transaction(&network(), &mut wallet(&mut conn), &parsed, Some(100003.into())).unwrap();
    assert_eq!(once_spent, snapshot(&conn));
    frozen_state(&conn, include_bytes!("../fixtures/transparent-reference.json"));
    stage("transparent-spend-idempotent");
    json!({"receipt_value": 100000, "unspent_after_spend": false, "receipt_requests": before_requests,
        "requests": requests(&mut conn), "canonical_sha256": state_hash(&conn)})
}
fn imported_batches(mode: Mode, stage: &mut dyn FnMut(&str)) -> Value {
    use zcash_client_backend::data_api::{AccountBirthday, AccountPurpose};
    use zcash_client_sqlite::wallet::init::WalletMigrator;
    let corpus = frozen();
    let mut conn = Connection::open_in_memory().unwrap();
    rusqlite::vtab::array::load_module(&conn).unwrap();
    let mut db = wallet(&mut conn);
    WalletMigrator::new().init_or_migrate(&mut db).unwrap();
    db.import_account_ufvk("synthetic F2", &key(0).to_unified_full_viewing_key(), &AccountBirthday::from_parts(initial(), None),
        AccountPurpose::Spending { derivation: None }, None).unwrap();
    db.update_chain_tip(100006.into()).unwrap();
    drop(db);
    stage("ufvk-import-complete");
    let mut batches = vec![];
    for (start, end) in [(0,1), (1,2), (2,4), (4,7)] {
        let state = chain_state(&corpus.0[..start]);
        scan(mode, &mut conn, &state, &Corpus(corpus.0[start..end].to_vec()), stage).unwrap();
        if start == 1 { stage("ironwood-only-batch-complete"); }
        batches.push(json!({"start": start, "end": end, "canonical_sha256": state_hash(&conn), "requests": requests(&mut conn)}));
    }
    json!({"batches": batches, "trees": trees(&mut conn, &corpus)})
}
fn failures(mode: Mode, stage: &mut dyn FnMut(&str)) -> Value {
    use zcash_client_backend::scanning::ScanError;
    let corpus = frozen();
    let mut results = vec![];
    for kind in ["hash", "height", "sapling-encoding", "ironwood-encoding", "first-hash", "hash-length"] {
        let mut conn = ready();
        let before = snapshot(&conn);
        let mut broken = corpus.clone();
        match kind {
            "hash" => broken.0[2].prev_hash[0] ^= 1,
            "height" => broken.0[2].height += 1,
            "sapling-encoding" => broken.0[2].vtx[0].outputs[0].cmu = vec![255;32],
            "ironwood-encoding" => broken.0[3].vtx[0].ironwood_actions[0].cmx = vec![255;32],
            "hash-length" => broken.0[2].hash.clear(),
            _ => broken.0[0].prev_hash[0] ^= 1,
        }
        // These two checks are intentionally stronger wrapper-only preconditions.
        let selected = if matches!(kind, "first-hash" | "hash-length") { Mode::Inline } else { mode };
        let mut observed = vec![];
        let error = scan(selected, &mut conn, &initial(), &broken, &mut |s| { stage(s); observed.push(s.to_owned()); }).unwrap_err();
        let classification = match (kind, error) {
            ("hash", ScanFailure::Scan(ScanError::PrevHashMismatch { at_height })) => { assert_eq!(u32::from(at_height),100002); "PrevHashMismatch" },
            ("height", ScanFailure::Scan(ScanError::BlockHeightDiscontinuity { prev_height, new_height })) => { assert_eq!((u32::from(prev_height),u32::from(new_height)),(100001,100003)); "BlockHeightDiscontinuity" },
            ("sapling-encoding" | "ironwood-encoding", ScanFailure::Scan(ScanError::EncodingInvalid { at_height, pool_type, .. })) => {
                assert_eq!(u32::from(at_height), if kind=="sapling-encoding" {100002} else {100003});
                assert_eq!(format!("{pool_type:?}"), if kind=="sapling-encoding" {"Sapling"} else {"Ironwood"});
                "EncodingInvalid"
            },
            ("first-hash" | "hash-length", ScanFailure::Validation(_)) => "Validation",
            (_, other) => panic!("{kind}: wrong typed failure {other:?}"),
        };
        assert!(!observed.iter().any(|s| s=="commit-complete"));
        assert_eq!(before,snapshot(&conn));
        stage(&format!("{kind}-atomic"));
        results.push(json!({"case": kind, "classification": classification, "unchanged": true}));
    }
    // Genuine protobuf decoder failure occurs before any wallet mutation.
    use prost::Message;
    let conn = ready();
    let before = snapshot(&conn);
    let mut encoded = corpus.0[2].encode_to_vec(); encoded.pop();
    assert!(zcash_client_backend::proto::compact_formats::CompactBlock::decode(encoded.as_slice()).is_err());
    assert_eq!(before,snapshot(&conn));
    stage("protobuf-decode-atomic");
    results.push(json!({"case":"truncated-protobuf","classification":"DecodeError","unchanged":true}));
    json!(results)
}
fn rollback(mode: Mode, stage: &mut dyn FnMut(&str)) -> Value {
    use zcash_protocol::ShieldedPool;
    let corpus = frozen();
    let mut results = vec![];
    for pool in [ShieldedPool::Sapling, ShieldedPool::Ironwood] {
        let mut conn = ready();
        scan(mode, &mut conn, &initial(), &Corpus(corpus.0[..2].to_vec()), stage).unwrap();
        let captured = chain_state(&corpus.0[..2]);
        let mut s = captured.final_sapling_tree().clone();
        let mut i = captured.final_ironwood_tree().clone();
        if pool==ShieldedPool::Sapling {
            s = incrementalmerkletree::frontier::Frontier::empty();
            assert!(s.append(sapling::Node::from_bytes([1;32]).unwrap()));
        } else {
            i = incrementalmerkletree::frontier::Frontier::empty();
            assert!(i.append(orchard::tree::MerkleHashOrchard::from_bytes(&[1;32]).unwrap()));
        }
        let bad = ChainState::new(captured.block_height(),captured.block_hash(),s,captured.final_orchard_tree().clone(),i);
        let before = snapshot(&conn);
        let mut observed = vec![];
        let error = scan(mode, &mut conn, &bad, &Corpus(corpus.0[2..].to_vec()), &mut |s| { stage(s); observed.push(s.to_owned()); }).unwrap_err();
        match error {
            ScanFailure::Commit(SqliteClientError::PutBlocksCommitmentTree { pool: actual, block_range, .. }) => {
                assert_eq!(actual,pool); assert_eq!(block_range,100001.into()..100007.into());
            },
            other => panic!("{pool:?}: wrong typed commit failure {other:?}"),
        }
        if matches!(mode,Mode::Inline) { assert_eq!(observed,["scan-start","scan-complete"]); }
        assert!(!observed.iter().any(|s| s=="commit-complete"));
        assert_eq!(before,snapshot(&conn));
        // Recover by replaying the genuine frontier, proving the failed transaction leaves a usable wallet.
        scan(mode,&mut conn,&captured,&Corpus(corpus.0[2..].to_vec()),stage).unwrap();
        let report = trees(&mut conn,&corpus);
        results.push(json!({"pool":format!("{pool:?}"),"error":"PutBlocksCommitmentTree","range":[100001,100007],
            "raw_rows_unchanged":true,"recovered_sha256":state_hash(&conn),"recovered_trees":report}));
    }
    json!(results)
}
fn rewind(mode: Mode, stage: &mut dyn FnMut(&str)) -> Value {
    let corpus = frozen();
    let mut conn = ready();
    scan(mode,&mut conn,&initial(),&corpus,stage).unwrap();
    frozen_state(&conn,include_bytes!("../fixtures/native-reference.json"));
    let before = snapshot(&conn);
    let original_trees = trees(&mut conn,&corpus);
    let actual = wallet(&mut conn).truncate_to_height(100001.into()).unwrap();
    stage(&format!("rewind-returned-{}",u32::from(actual)));
    let prefix = corpus.0.iter().take_while(|b|b.height()<=actual).count();
    let state = chain_state(&corpus.0[..prefix]);
    scan(mode,&mut conn,&state,&Corpus(corpus.0[prefix..].to_vec()),stage).unwrap();
    let after = snapshot(&conn);
    for (table,rows) in &before {
        if !["sapling_tree_shards","ironwood_tree_shards","sapling_tree_cap","orchard_tree_cap","ironwood_tree_cap"].contains(&table.as_str()) {
            assert_eq!(rows,&after[table],"{table}");
        }
    }
    assert_eq!(trees(&mut conn,&corpus),original_trees);
    frozen_state(&conn,include_bytes!("../fixtures/native-replayed.json"));
    json!({"requested":100001,"returned":u32::from(actual),"suffix_start":prefix,"canonical_sha256":state_hash(&conn),
        "trees":original_trees,"requests":requests(&mut conn)})
}

pub fn run_case(name: &str, mode: Mode, stage: &mut dyn FnMut(&str)) -> Result<Value, String> {
    if !CASES.contains(&name) { return Err(format!("unknown qualification case: {name}")); }
    #[cfg(target_arch = "wasm32")]
    if matches!(mode,Mode::NativeReference) { return Err("native reference unavailable in WASM".into()); }
    stage("case-start");
    let result = match name {
        "transparent" => transparent(stage),
        "effects-trees" => effects(mode,stage),
        "imported-batches" => imported_batches(mode,stage),
        "failures" => failures(mode,stage),
        "rollback" => rollback(mode,stage),
        "rewind" => rewind(mode,stage),
        _ => unreachable!(),
    };
    stage("case-complete");
    Ok(result)
}
#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    fn check(name: &str) {
        let reference = run_case(name, Mode::NativeReference, &mut |s| eprintln!("reference {name} {s}")).unwrap();
        let actual = run_case(name, Mode::Inline, &mut |s| eprintln!("inline {name} {s}")).unwrap();
        assert_eq!(reference, actual);
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("references").join(format!("{name}.json"));
        if std::env::var_os("SCANNER_EXT_CAPTURE").is_some() {
            use std::io::Write;
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            // Capture once, only after independent native/inline equality. Never overwrite.
            std::fs::OpenOptions::new().write(true).create_new(true).open(&path).unwrap()
                .write_all(&serde_json::to_vec_pretty(&reference).unwrap()).unwrap();
        }
        let expected: Value = serde_json::from_slice(&std::fs::read(path).expect("explicit native reference capture required")).unwrap();
        assert_eq!(actual, expected);
    }
    #[test] fn transparent() { check("transparent"); }
    #[test] fn effects_trees() { check("effects-trees"); }
    #[test] fn imported_batches() { check("imported-batches"); }
    #[test] fn failures() { check("failures"); }
    #[test] fn rollback() { check("rollback"); }
    #[test] fn rewind() { check("rewind"); }
}

/// Immutable native observations, captured only after cached/inline parity succeeds.
pub fn expected_case(name: &str) -> Result<Value, String> {
    let bytes: &[u8] = match name {
        "transparent" => include_bytes!("../references/transparent.json"),
        "effects-trees" => include_bytes!("../references/effects-trees.json"),
        "imported-batches" => include_bytes!("../references/imported-batches.json"),
        "failures" => include_bytes!("../references/failures.json"),
        "rollback" => include_bytes!("../references/rollback.json"),
        "rewind" => include_bytes!("../references/rewind.json"),
        _ => return Err(format!("unknown qualification case: {name}")),
    };
    serde_json::from_slice(bytes).map_err(|e| e.to_string())
}
