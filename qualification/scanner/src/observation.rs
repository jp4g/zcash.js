//! Schema-pinned qualification observations over the real SQLite connection.
use rusqlite::{Connection, types::ValueRef};
use std::collections::BTreeMap;
pub fn snapshot(conn: &Connection) -> BTreeMap<String, Vec<Vec<String>>> {
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
pub fn canonical_snapshot(conn: &Connection) -> BTreeMap<String, Vec<Vec<String>>> {
    let mut state = snapshot(conn);
    let uuid_index = conn.prepare("SELECT * FROM accounts").unwrap().column_index("uuid").unwrap();
    let accounts = state.get_mut("accounts").unwrap();
    assert_eq!(accounts.len(), 1);
    accounts[0][uuid_index] = "opaque:fixture-account-0".into();
    state
}
