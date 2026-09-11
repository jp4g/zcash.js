//! Disposable scalar-only ABI; bundled SQLite and Common BLS in this module.
use bls12_381::{G1Affine, G1Projective, G2Affine, G2Projective, Scalar, pairing};
use rusqlite::{Connection, OpenFlags, params};
use std::cell::RefCell;

thread_local! {
    static DB: RefCell<Option<Connection>> = const { RefCell::new(None) };
    static HEAP: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}
unsafe extern "C" { fn rt_ready() -> i32; }

#[unsafe(no_mangle)]
pub extern "C" fn rt_open() -> i32 {
    if unsafe { rt_ready() } == 0 { return 21; }
    DB.with(|slot| {
        if slot.borrow().is_some() { return 21; }
        match Connection::open_with_flags_and_vfs("/qualification", OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX, "memdb") {
            Ok(db) => { *slot.borrow_mut() = Some(db); 0 }
            Err(_) => 1,
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn rt_sql() -> u32 {
    DB.with(|slot| {
        let borrow = slot.borrow();
        let db = borrow.as_ref().unwrap();
        db.execute_batch("CREATE TABLE fixture(value INTEGER NOT NULL, payload BLOB NOT NULL); BEGIN;").unwrap();
        let blob: Vec<u8> = (0..65536).map(|i| (i % 251) as u8).collect();
        db.execute("INSERT INTO fixture VALUES (?1, ?2)", params![19, &blob]).unwrap();
        db.execute("INSERT INTO fixture VALUES (?1, ?2)", params![23, &blob]).unwrap();
        db.execute_batch("COMMIT; BEGIN; INSERT INTO fixture VALUES(99,x'00'); DELETE FROM fixture WHERE value=19; ROLLBACK;").unwrap();
        let read: Vec<u8> = db.query_row("SELECT payload FROM fixture WHERE value=19", [], |r| r.get(0)).unwrap();
        assert_eq!(blob, read);
        let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
        assert_eq!(integrity, "ok");
        let total: u32 = db.query_row("SELECT sum(value) FROM fixture", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 42);
        total
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn rt_rows() -> i32 {
    DB.with(|slot| slot.borrow().as_ref().unwrap()
        .query_row("SELECT count(*) FROM fixture", [], |r| r.get(0)).unwrap_or(-1))
}

// A successful zero count proves absence; SQL errors trap, never mean empty.
#[unsafe(no_mangle)]
pub extern "C" fn rt_fixture_schema_count() -> i32 {
    DB.with(|slot| slot.borrow().as_ref().unwrap()
        .query_row("SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='fixture'",
                   [], |r| r.get(0)).expect("fixture schema query failed"))
}

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
pub extern "C" fn rt_oom() -> u32 {
    DB.with(|slot| {
        let borrow = slot.borrow();
        let db = borrow.as_ref().unwrap();
        let error = db.execute("INSERT INTO fixture VALUES(99,zeroblob(33554432))", []).unwrap_err();
        assert_eq!(error.sqlite_error_code(), Some(rusqlite::ErrorCode::OutOfMemory));
        let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
        assert_eq!(integrity, "ok");
        1
    })
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

// wasm-bindgen generates both the JS wrapper and its instance export import.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn raw_exports() -> wasm_bindgen::JsValue {
    wasm_bindgen::exports()
}

// Repeat actual committed updates and rolled-back deletes while Rust allocations live.
#[unsafe(no_mangle)]
pub extern "C" fn rt_cycle() -> u32 {
    DB.with(|slot| {
        let borrow = slot.borrow();
        let db = borrow.as_ref().unwrap();
        db.execute_batch("BEGIN; UPDATE fixture SET value=value+1; COMMIT; BEGIN; DELETE FROM fixture; ROLLBACK;").unwrap();
        for row in [1, 2] {
            let blob: Vec<u8> = db.query_row("SELECT payload FROM fixture WHERE rowid=?1", [row], |r| r.get(0)).unwrap();
            assert_eq!(blob.len(), 65536);
            assert!(blob.iter().enumerate().all(|(i, b)| *b == (i % 251) as u8));
        }
        let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap();
        assert_eq!(integrity, "ok");
        db.query_row("SELECT sum(value) FROM fixture", [], |r| r.get(0)).unwrap()
    })
}

// Qualification fault injection only; never a public SDK export.
#[unsafe(no_mangle)]
pub extern "C" fn rt_heap_ptr() -> u32 {
    HEAP.with(|slot| slot.borrow().as_ptr() as u32)
}
