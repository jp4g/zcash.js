//! Isolated same-instance SQLite VFS qualification. Runtime probe provenance in JSON.
use bls12_381::{G1Affine, G1Projective, G2Affine, G2Projective, Scalar, pairing};
use rusqlite::{Connection, OpenFlags, params};
use std::cell::RefCell;
thread_local! {
 static DB: RefCell<Option<Connection>> = const { RefCell::new(None) };
 static HEAP: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}
unsafe extern "C" { fn rt_ready() -> i32; fn st_policy(db: *mut rusqlite::ffi::sqlite3) -> i32; }
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn raw_exports() -> wasm_bindgen::JsValue { wasm_bindgen::exports() }
fn rc(result: rusqlite::Result<()>) -> i32 {
 result.map(|_|0).unwrap_or_else(|e| e.sqlite_error().map(|e|e.extended_code).unwrap_or(-1))
}
fn with_db(f: impl FnOnce(&Connection) -> rusqlite::Result<()>) -> i32 {
 DB.with(|s| match s.borrow().as_ref() { Some(db)=>rc(f(db)), None=>21 })
}
#[unsafe(no_mangle)]
pub extern "C" fn st_open() -> i32 {
 if unsafe { rt_ready() } == 0 { return 21; }
 DB.with(|s| {
  if s.borrow().is_some() { return 21; }
  rc((|| {
   let db = Connection::open_with_flags_and_vfs("/wallet.db", OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX, "storage-host")?;
   assert_eq!(unsafe { st_policy(db.handle()) },0);
   db.execute_batch("PRAGMA journal_mode=TRUNCATE; PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=8;")?;
   let journal: String = db.query_row("PRAGMA journal_mode",[],|r|r.get(0))?;
   let sync: i32 = db.query_row("PRAGMA synchronous",[],|r|r.get(0))?;
   assert_eq!(journal,"truncate"); assert_eq!(sync,2);
   *s.borrow_mut()=Some(db); Ok(())
  })())
 })
}
#[unsafe(no_mangle)]
pub extern "C" fn st_close() -> i32 {
 DB.with(|s| match s.borrow_mut().take() { None=>21, Some(db)=> match db.close() { Ok(())=>0, Err((db,e))=> { *s.borrow_mut()=Some(db); rc(Err(e)) } } })
}
#[unsafe(no_mangle)]
pub extern "C" fn st_seed() -> i32 { with_db(|db| {
 db.execute_batch("BEGIN; CREATE TABLE fixture(id INTEGER PRIMARY KEY, payload BLOB NOT NULL); CREATE TABLE state(scan INTEGER, tree BLOB, locked INTEGER, outbox BLOB, epoch INTEGER); INSERT INTO state VALUES(7,x'0708',1,x'0910',1);")?;
 let blob: Vec<u8>=(0..65536).map(|i|(i%251) as u8).collect();
 db.execute("INSERT INTO fixture VALUES(1,?1)", params![blob])?;
 db.execute_batch("PRAGMA user_version=1; COMMIT;")
}) }
#[unsafe(no_mangle)]
pub extern "C" fn st_verify() -> i32 { with_db(|db| {
 let blob: Vec<u8>=db.query_row("SELECT payload FROM fixture WHERE id=1",[],|r|r.get(0))?;
 assert_eq!(blob.len(),65536); assert!(blob.iter().enumerate().all(|(i,b)|*b==(i%251) as u8));
 let state: (i32,Vec<u8>,i32,Vec<u8>,i32)=db.query_row("SELECT scan,tree,locked,outbox,epoch FROM state",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?;
 assert_eq!(state,(7,vec![7,8],1,vec![9,16],1));
 let check:String=db.query_row("PRAGMA integrity_check",[],|r|r.get(0))?; assert_eq!(check,"ok"); Ok(())
}) }
#[unsafe(no_mangle)]
pub extern "C" fn st_verify_committed() -> i32 { with_db(|db| {
 let blob:Vec<u8>=db.query_row("SELECT payload FROM fixture WHERE id=1",[],|r|r.get(0))?;
 assert_eq!(blob,vec![0;65536]);
 let state:(i32,Vec<u8>,i32,Vec<u8>,i32)=db.query_row("SELECT scan,tree,locked,outbox,epoch FROM state",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?;
 assert_eq!(state,(8,vec![153],0,vec![136],2));
 let check:String=db.query_row("PRAGMA integrity_check",[],|r|r.get(0))?; assert_eq!(check,"ok"); Ok(())
}) }
#[unsafe(no_mangle)]
pub extern "C" fn st_update(commit: i32) -> i32 { with_db(|db| {
 db.execute_batch("BEGIN IMMEDIATE; UPDATE fixture SET payload=zeroblob(65536); UPDATE state SET scan=8,tree=x'99',locked=0,outbox=x'88',epoch=2;")?;
 if commit != 0 { db.execute_batch("COMMIT;")?; } Ok(())
}) }
#[unsafe(no_mangle)]
pub extern "C" fn st_rollback() -> i32 { with_db(|db| db.execute_batch("ROLLBACK;")) }
#[unsafe(no_mangle)]
pub extern "C" fn st_migrate(fail: i32) -> i32 { with_db(|db| {
 db.execute_batch("BEGIN; ALTER TABLE state ADD COLUMN migrated INTEGER NOT NULL DEFAULT 42; PRAGMA user_version=2;")?;
 if fail != 0 {
  assert!(db.execute_batch("INSERT INTO nonexistent VALUES(1);").is_err());
  db.execute_batch("ROLLBACK;")?;
 } else { db.execute_batch("COMMIT;")?; } Ok(())
}) }
#[unsafe(no_mangle)]
pub extern "C" fn st_version() -> i32 {
 DB.with(|s| s.borrow().as_ref().unwrap().query_row("PRAGMA user_version",[],|r|r.get(0)).unwrap())
}
#[unsafe(no_mangle)]
pub extern "C" fn st_policy_check() -> i32 { with_db(|db| {
 for sql in ["PRAGMA journal_mode=WAL", "PRAGMA journal_mode=OFF", "PRAGMA journal_mode=MEMORY", "PRAGMA synchronous=OFF", "PRAGMA locking_mode=EXCLUSIVE", "ATTACH ':memory:' AS other"] {
  assert_eq!(db.execute_batch(sql).unwrap_err().sqlite_error_code(),Some(rusqlite::ErrorCode::AuthorizationForStatementDenied));
 } Ok(())
}) }
#[unsafe(no_mangle)]
pub extern "C" fn rt_pairing() -> u32 {
    let two = Scalar::from(2u64);
    let g1 = G1Affine::generator();
    let g2 = G2Affine::generator();
    let left = pairing(&G1Affine::from(G1Projective::from(g1) * two), &g2);
    let right = pairing(&g1, &G2Affine::from(G2Projective::from(g2) * two));
    assert_eq!(left, right);
    assert_ne!(left, pairing(&g1, &g2));
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn rt_grow(size: u32) -> u32 {
    assert!(size <= 64 * 1024 * 1024);
    HEAP.with(|slot| *slot.borrow_mut() = (0..size).map(|i| (i % 251) as u8).collect());
    rt_heap_check()
}

#[unsafe(no_mangle)]
pub extern "C" fn rt_heap_check() -> u32 {
    HEAP.with(|slot| u32::from(slot.borrow().iter().enumerate().all(|(i, b)| *b == (i % 251) as u8)))
}
