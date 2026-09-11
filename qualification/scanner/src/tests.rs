use super::*;
use crate::fixture::*;
use prost::Message;
use rusqlite::{Connection, types::ValueRef};
use std::{collections::BTreeMap, path::Path};
use zcash_client_backend::data_api::chain::scan_cached_blocks;
fn snapshot(conn: &Connection) -> BTreeMap<String, Vec<Vec<String>>> {
    let mut result = BTreeMap::new();
    let tables: Vec<String> = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").unwrap()
        .query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect();
    for table in tables {
        let mut stmt = conn.prepare(&format!("SELECT * FROM \"{}\"", table.replace('"', "\"\""))).unwrap();
        let count = stmt.column_count();
        let mut rows: Vec<Vec<String>> = stmt.query_map([], |r| (0..count).map(|i| Ok(match r.get_ref(i)? {
            ValueRef::Null => "null".into(), ValueRef::Integer(v) => format!("i:{v}"),
            ValueRef::Real(v) => format!("r:{v}"), ValueRef::Text(v) => format!("t:{}", String::from_utf8_lossy(v)),
            ValueRef::Blob(v) => format!("b:{}", hex::encode(v)),
        })).collect()).unwrap().map(Result::unwrap).collect();
        rows.sort(); result.insert(table, rows);
    }
    result
}
fn freeze(path: &str, bytes: &[u8]) {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures").join(path);
    if std::env::var_os("SCANNER_FREEZE").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, bytes).unwrap();
    }
    assert_eq!(std::fs::read(&path).expect("frozen fixture exists; explicit SCANNER_FREEZE=1 to generate"), bytes, "fixture drift: {}", path.display());
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
    let canonical = snapshot(&reference);
    freeze("native-reference.json", &serde_json::to_vec_pretty(&canonical).unwrap());
    inline_scan(&network(), &mut wallet(&mut inline), &initial(), &corpus.0).unwrap();
    assert_eq!(canonical, snapshot(&inline));
}
