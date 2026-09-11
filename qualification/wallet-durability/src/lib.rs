//! Synthetic qualification only. Immutable scanner modules use public backend APIs.
// Module path is generated from the receipt-bound input snapshot, never a live checkout.
include!(concat!(env!("OUT_DIR"), "/scanner-module.rs"));
use rusqlite::{Connection, OpenFlags};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use zcash_client_backend::data_api::{WalletRead, WalletWrite, AccountBirthday, AccountPurpose, WalletCommitmentTrees, wallet::ConfirmationsPolicy};
use zcash_client_sqlite::wallet::init::WalletMigrator;
use serde_json::{json, Value};
use prost::Message;
thread_local! { static DB: RefCell<Option<Connection>> = const { RefCell::new(None) }; }
#[wasm_bindgen]
pub fn raw_exports() -> JsValue { wasm_bindgen::exports() }
fn corpus() -> scanner::fixture::Corpus {
    scanner::fixture::Corpus([
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100000.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100001.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100002.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100003.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100004.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100005.pb")).as_slice(),
        include_bytes!(concat!(env!("WD_FIXTURES"), "/100006.pb")).as_slice(),
    ].into_iter().map(|b| zcash_client_backend::proto::compact_formats::CompactBlock::decode(b).unwrap()).collect())
}
fn setup(conn: &mut Connection, import: bool) {
    use scanner::fixture::*;
    rusqlite::vtab::array::load_module(conn).unwrap();
    let mut wallet = wallet(conn);
    WalletMigrator::new().init_or_migrate(&mut wallet).unwrap();
    let birthday = AccountBirthday::from_parts(initial(), None);
    if import {
        wallet.import_account_ufvk("synthetic F2", &key(0).to_unified_full_viewing_key(), &birthday, AccountPurpose::Spending { derivation: None }, None).unwrap();
    } else {
        wallet.create_account("synthetic F2", &secrecy::Secret::new(vec![0;32]), &birthday, None).unwrap();
    }
    wallet.update_chain_tip(100_006.into()).unwrap();
}
fn scan(conn: &mut Connection, start: usize, end: usize) -> Result<Value, String> {
    let corpus = corpus();
    if start >= end || end > corpus.0.len() { return Err("fixture range".into()); }
    let state = scanner::fixture::chain_state(&corpus.0[..start]);
    let result = scanner::inline_scan_observed(&scanner::fixture::network(), &mut scanner::fixture::wallet(conn), &state, &corpus.0[start..end], |_| {})
        .map_err(|e| format!("scan: {e:?}"))?;
    Ok(json!({"saplingReceived":result.sapling_received,"saplingSpent":result.sapling_spent,"ironwoodReceived":result.ironwood_received,"ironwoodSpent":result.ironwood_spent}))
}
fn observe(conn: &mut Connection, complete: bool) -> Result<Value, String> {
    // Query errors are propagated; an empty database is never a successful wallet.
    let count: i64 = conn.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).map_err(|e| format!("accounts query: {e}"))?;
    if count != 1 { return Err(format!("expected one persisted account, got {count}")); }
    let integrity: Vec<String> = conn.prepare("PRAGMA integrity_check").map_err(|e|e.to_string())?.query_map([], |r|r.get(0)).map_err(|e|e.to_string())?.collect::<Result<_,_>>().map_err(|e|e.to_string())?;
    if integrity != ["ok"] { return Err(format!("integrity: {integrity:?}")); }
    let migration_count: i64 = conn.query_row("SELECT count(*) FROM schemer_migrations", [], |r|r.get(0)).unwrap();
    assert_eq!(migration_count, 66);
    let mut wallet = scanner::fixture::wallet(conn);
    let ids = wallet.get_account_ids().map_err(|e|format!("account ids: {e:?}"))?;
    assert_eq!(ids.len(), 1);
    let account = wallet.get_account(ids[0]).unwrap().expect("persisted account");
    let addresses = wallet.list_addresses(ids[0]).unwrap();
    assert!(!addresses.is_empty());
    let keys = wallet.get_unified_full_viewing_keys().unwrap();
    let key = keys.get(&ids[0]).unwrap().encode(&scanner::fixture::network());
    assert_eq!(key, scanner::fixture::key(0).to_unified_full_viewing_key().encode(&scanner::fixture::network()));
    let summary = wallet.get_wallet_summary(ConfirmationsPolicy::default()).unwrap();
    let balances = summary.as_ref().map(|s| {
        let b = s.account_balances().get(&ids[0]).unwrap();
        json!({"sapling":u64::from(b.sapling_balance().total()),"ironwood":u64::from(b.ironwood_balance().total()),"total":u64::from(b.total())})
    });
    let public = json!({"account":format!("{account:?}"),"addresses":addresses.iter().map(|a|json!({"address":a.address().encode(&scanner::fixture::network()),"source":format!("{:?}",a.source())})).collect::<Vec<_>>(),"ufvk":key,"balances":balances});
    let mut roots = Value::Null;
    if complete {
        use shardtree::store::ShardStore;
        let corpus = corpus(); let state = scanner::fixture::chain_state(&corpus.0); let tip = state.block_height();
        let expected = [100000u32,100002,100004,100006].map(Into::into).into_iter().collect();
        let s = wallet.with_sapling_tree_mut(|tree| {
            assert_eq!(tree.store().retained_checkpoints().unwrap(), expected);
            let root = tree.root_at_checkpoint_id(&tip)?.unwrap();
            assert_eq!(root, state.final_sapling_tree().root());
            let leaf = sapling::Node::from_bytes(corpus.0[2].vtx[0].outputs[0].cmu.as_slice().try_into().unwrap()).unwrap();
            assert_eq!(tree.witness_at_checkpoint_id(1u64.into(), &tip)?.unwrap().root(leaf), root);
            Ok::<_,shardtree::error::ShardTreeError<_>>(hex::encode(root.to_bytes()))
        }).unwrap();
        let i = wallet.with_ironwood_tree_mut(|tree| {
            assert_eq!(tree.store().retained_checkpoints().unwrap(), expected);
            let root = tree.root_at_checkpoint_id(&tip)?.unwrap();
            assert_eq!(root, state.final_ironwood_tree().root());
            let leaf = orchard::tree::MerkleHashOrchard::from_bytes(corpus.0[3].vtx[0].ironwood_actions[0].cmx.as_slice().try_into().unwrap()).unwrap();
            assert_eq!(tree.witness_at_checkpoint_id(1u64.into(), &tip)?.unwrap().root(leaf), root);
            Ok::<_,shardtree::error::ShardTreeError<_>>(hex::encode(root.to_bytes()))
        }).unwrap().unwrap();
        roots=json!([s,i]);
        assert_eq!(roots, serde_json::from_slice::<Value>(include_bytes!(concat!(env!("WD_FIXTURES"), "/roots.json"))).unwrap());
        assert_eq!(public["balances"], json!({"sapling":30000,"ironwood":45000,"total":75000}));
    }
    drop(wallet);
    let exact = scanner::observation::snapshot(conn);
    let canonical = scanner::observation::canonical_snapshot(conn);
    Ok(json!({"exact":exact,"canonical":canonical,"public":public,"roots":roots,"integrity":integrity,"migrations":migration_count}))
}
#[cfg(target_arch="wasm32")]
#[wasm_bindgen]
pub fn durability(command: &str) -> Result<String, JsValue> {
    execute(command).map(|v|v.to_string()).map_err(|e| JsValue::from_str(&e))
}
#[cfg(target_arch="wasm32")]
fn execute(command: &str) -> Result<Value,String> {
    let request: Value = serde_json::from_str(command).map_err(|e|e.to_string())?;
    let op = request["op"].as_str().ok_or("op")?;
    DB.with(|slot| {
        let mut slot=slot.borrow_mut();
        if op=="walletOpen" {
            if slot.is_some() { return Err("already open".into()); }
            let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
            if request["create"]==true { flags |= OpenFlags::SQLITE_OPEN_CREATE; }
            let conn=Connection::open_with_flags_and_vfs("/wallet.db",flags,"storage-host").map_err(|e|format!("open: {e}"))?;
            unsafe extern "C" { fn st_policy(db:*mut rusqlite::ffi::sqlite3)->i32; }
            assert_eq!(unsafe { st_policy(conn.handle()) },0);
            conn.execute_batch("PRAGMA journal_mode=TRUNCATE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=8;").map_err(|e|e.to_string())?;
            rusqlite::vtab::array::load_module(&conn).map_err(|e|e.to_string())?;
            *slot=Some(conn); return Ok(json!({"rc":0}));
        }
        if op=="walletClose" { let conn=slot.take().ok_or("not open")?; conn.close().map_err(|(_,e)|e.to_string())?; return Ok(json!({"rc":0})); }
        let conn=slot.as_mut().ok_or("not open")?;
        match op {
            "walletSetup"=> { setup(conn,request["import"]==true); Ok(json!({"rc":0})) },
            "walletScan"=>scan(conn,request["start"].as_u64().unwrap_or(0) as usize,request["end"].as_u64().unwrap_or(7) as usize),
            "walletObserve"=>observe(conn,request["complete"]==true),
            "walletBadQuery"=> conn.query_row::<i64,_,_>("SELECT count(*) FROM deliberately_absent",[],|r|r.get(0)).map(|n|json!(n)).map_err(|e|format!("query failed: {e}")),
            _=>Err("unknown operation".into())
        }
    })
}

/// Independent native cached-scanner reference; never used for Wasm persistence.
#[cfg(not(target_arch="wasm32"))]
pub fn native_reference() -> Value {
    let mut result=serde_json::Map::new();
    for import in [false,true] {
        let mut conn=Connection::open_in_memory().unwrap();
        setup(&mut conn,import);
        let blocks=corpus();
        zcash_client_backend::data_api::chain::scan_cached_blocks(&scanner::fixture::network(), &blocks, &mut scanner::fixture::wallet(&mut conn),100000.into(),&scanner::fixture::initial(),7).unwrap();
        let observed=observe(&mut conn,true).unwrap();
        if !import { assert_eq!(observed["canonical"],serde_json::from_slice::<Value>(include_bytes!(concat!(env!("WD_FIXTURES"),"/native-reference.json"))).unwrap()); }
        result.insert(if import {"imported"} else {"created"}.into(),observed["canonical"].clone());
    }
    Value::Object(result)
}
