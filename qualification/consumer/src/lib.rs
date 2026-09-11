//! Disposable real-symbol link probe. No wallet API or durable storage claim.
use bls12_381::{G1Affine, G1Projective, G2Affine, G2Projective, Scalar, pairing};

/// C ABI: no pointers or host-owned buffers; returns 42 only after both checks.
/// SQLite is the rusqlite dependency's bundled instance, using an ephemeral DB.
#[unsafe(no_mangle)]
pub extern "C" fn qualification_probe() -> u32 {
    let connection = rusqlite::Connection::open_in_memory().expect("SQLite open");
    connection.execute_batch(
        "CREATE TABLE fixture(value INTEGER NOT NULL); BEGIN; \
         INSERT INTO fixture VALUES (19), (23); COMMIT;",
    ).expect("SQLite transaction");
    let total: u32 = connection.query_row("SELECT sum(value) FROM fixture", [], |r| r.get(0))
        .expect("SQLite query");
    assert_eq!(total, 42);
    let two = Scalar::from(2u64);
    let g1 = G1Affine::generator();
    let g2 = G2Affine::generator();
    let left = pairing(&G1Affine::from(G1Projective::from(g1) * two), &g2);
    let right = pairing(&g1, &G2Affine::from(G2Projective::from(g2) * two));
    assert_eq!(left, right);
    assert_ne!(left, pairing(&g1, &g2));
    total
}
