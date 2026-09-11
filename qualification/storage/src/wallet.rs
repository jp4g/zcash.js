//! Actual pinned wallet schema and external-migration seam; no accounts or funds.
use rand::{SeedableRng, rngs::SmallRng};
use rusqlite::Transaction;
use schemerz::Migration;
use schemerz_rusqlite::RusqliteMigration;
use std::{collections::HashSet, time::{Duration, SystemTime, UNIX_EPOCH}};
use uuid::Uuid;
use zcash_client_backend::data_api::WalletRead;
use zcash_client_sqlite::{WalletDb, util::Clock, wallet::init::{WalletMigrator, WalletMigrationError}};
use zcash_protocol::consensus::TEST_NETWORK;

#[derive(Clone)]
struct HostClock;
impl Clock for HostClock {
    fn now(&self) -> SystemTime {
        unsafe extern "C" { fn rt_time() -> f64; }
        let ms = unsafe { rt_time() } - 210866760000000.0;
        assert!(ms >= 0.0);
        UNIX_EPOCH + Duration::from_millis(ms as u64)
    }
}
struct External { fail: bool }
impl Migration<Uuid> for External {
    fn id(&self) -> Uuid { Uuid::from_bytes([0x72; 16]) }
    fn dependencies(&self) -> HashSet<Uuid> { HashSet::new() }
    fn description(&self) -> &'static str { "Synthetic storage atomicity fixture" }
}
impl RusqliteMigration for External {
    type Error = WalletMigrationError;
    fn up(&self, tx: &Transaction<'_>) -> Result<(), Self::Error> {
        tx.execute_batch("CREATE TABLE ext_storage_fixture(value BLOB NOT NULL); INSERT INTO ext_storage_fixture VALUES(x'0123456789abcdef');")?;
        if self.fail { tx.execute_batch("INSERT INTO deliberately_missing VALUES(1);")?; }
        Ok(())
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn st_wallet_migrate(mode: i32) -> i32 {
    crate::DB.with(|s| {
        let mut slot = s.borrow_mut(); let db = slot.as_mut().unwrap();
        rusqlite::vtab::array::load_module(db).unwrap();
        // Deterministic RNG is restricted to this synthetic, empty-wallet test.
        let mut wallet = WalletDb::from_connection(&mut *db, TEST_NETWORK, HostClock, SmallRng::from_seed([7; 32]));
        let migrator = if mode == 0 { WalletMigrator::new() } else {
            WalletMigrator::new().with_external_migrations(vec![Box::new(External { fail: mode == 1 })])
        };
        let result = migrator.init_or_migrate(&mut wallet);
        if mode == 1 { assert!(result.is_err(), "external migration should fail"); }
        else { result.expect("real wallet migration failed"); }
        assert!(wallet.get_account_ids().unwrap().is_empty());
        let count: i32 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE name='ext_storage_fixture'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, if mode == 2 { 1 } else { 0 });
        let check: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0)).unwrap(); assert_eq!(check, "ok");
        0
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn st_wallet_check(external: i32) -> i32 {
    crate::DB.with(|s| {
        let slot = s.borrow(); let db = slot.as_ref().unwrap();
        let count: i32 = db.query_row("SELECT count(*) FROM schemer_migrations", [], |r| r.get(0)).unwrap();
        assert!(count > 20);
        let accounts: i32 = db.query_row("SELECT count(*) FROM accounts", [], |r| r.get(0)).unwrap(); assert_eq!(accounts, 0);
        if external != 0 {
            let blob: Vec<u8> = db.query_row("SELECT value FROM ext_storage_fixture", [], |r| r.get(0)).unwrap();
            assert_eq!(blob, vec![1, 35, 69, 103, 137, 171, 205, 239]);
        } else {
            let absent: i32 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE name='ext_storage_fixture'", [], |r| r.get(0)).unwrap(); assert_eq!(absent, 0);
        }
        count
    })
}
