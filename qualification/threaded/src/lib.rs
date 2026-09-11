//! Synthetic F1/thread-bootstrap qualification, not scanner parity or production.
mod baseline;
use rayon::{ThreadBuilder, ThreadPoolBuilder};
use std::cell::Cell;
use std::sync::{Mutex, Condvar};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use wasm_bindgen::prelude::*;

// Bounded handoff uses rebuilt std synchronization. No host pointers or copied
// Rayon algorithms: ThreadBuilder::run is the pinned public spawn_handler seam.
static SLOTS: Mutex<Vec<Option<ThreadBuilder>>> = Mutex::new(Vec::new());
static CHANGED: Condvar = Condvar::new();
static PREPARED: AtomicBool = AtomicBool::new(false);
static READY: AtomicBool = AtomicBool::new(false);
static ENTERED: AtomicU32 = AtomicU32::new(0);
thread_local! {
    static ROLE: Cell<u32> = const { Cell::new(0) };
    static TLS_MARK: Cell<u32> = const { Cell::new(0) };
}
pub(crate) fn assert_owner() { ROLE.with(|r| assert_eq!(r.get(), 1, "owner-only export")); }
fn assert_ready() { assert_owner(); assert!(READY.load(Ordering::Acquire), "pool not ready"); }
#[wasm_bindgen]
pub fn owner_prepare(count: u32) {
    assert!((1..=8).contains(&count));
    assert!(!PREPARED.swap(true, Ordering::AcqRel), "one bootstrap per domain");
    ROLE.with(|r| { assert_eq!(r.get(), 0); r.set(1); });
    *SLOTS.lock().unwrap() = (0..count).map(|_| None).collect();
}
#[wasm_bindgen]
pub fn worker_enter(index: u32) {
    ROLE.with(|r| { assert_eq!(r.get(), 0); r.set(index + 2); });
    TLS_MARK.with(|v| v.set(0xabc000 + index));
    let thread = {
        let mut slots = SLOTS.lock().unwrap();
        assert!((index as usize) < slots.len());
        loop {
            if let Some(thread) = slots[index as usize].take() { break thread; }
            slots = CHANGED.wait(slots).unwrap();
        }
    };
    ENTERED.fetch_or(1 << index, Ordering::AcqRel);
    thread.run();
}
#[wasm_bindgen]
pub fn owner_build() {
    assert_owner(); assert!(!READY.load(Ordering::Acquire));
    let count = SLOTS.lock().unwrap().len();
    ThreadPoolBuilder::new().num_threads(count).spawn_handler(|thread| {
        let index = thread.index();
        let mut slots = SLOTS.lock().unwrap();
        assert!(slots[index].is_none()); slots[index] = Some(thread); CHANGED.notify_all(); Ok(())
    }).build_global().unwrap();
    assert_eq!(ENTERED.load(Ordering::Acquire), (1 << count) - 1);
    READY.store(true, Ordering::Release);
}
#[wasm_bindgen]
pub fn parallel_evidence() -> Vec<u32> {
    assert_ready();
    // Broadcast forces actual work on every pool worker, unlike a sum which may
    // complete on one worker. Hold simultaneous heap allocations across barrier.
    let barrier = std::sync::Barrier::new(rayon::current_num_threads());
    let rows = rayon::broadcast(|context| {
        let index = context.index() as u32;
        let allocation: Vec<u32> = (0..65536).map(|i| i ^ index).collect();
        let stack_marker = index + 17;
        barrier.wait();
        assert!(allocation.iter().enumerate().all(|(i, v)| *v == (i as u32 ^ index)));
        let tls = TLS_MARK.with(|v| { assert_eq!(v.get(), 0xabc000 + index); v as *const Cell<u32> as u32 });
        let role = ROLE.with(Cell::get); assert_eq!(role, index + 2);
        vec![index, role, tls, &stack_marker as *const u32 as u32,
             allocation.as_ptr() as u32, allocation.len() as u32]
    });
    rows.into_iter().flatten().collect()
}
unsafe extern "C" { fn rt_init(configure: i32) -> i32; fn rt_pool_check() -> i32; }
#[wasm_bindgen]
pub fn owner_sql_init() -> i32 { assert_ready(); unsafe { rt_init(1) } }
#[wasm_bindgen]
pub fn owner_sql() -> u32 {
    assert_ready(); assert_eq!(baseline::rt_open(), 0);
    assert_eq!(baseline::rt_fixture_schema_count(), 0); baseline::rt_sql()
}
#[wasm_bindgen]
pub fn owner_pairing() -> u32 { assert_ready(); baseline::rt_pairing() }
#[wasm_bindgen]
pub fn owner_pool_check() -> i32 { assert_ready(); unsafe { rt_pool_check() } }
#[wasm_bindgen]
pub fn owner_cycle() -> u32 { assert_ready(); baseline::rt_cycle() }
#[wasm_bindgen]
pub fn owner_grow(size: u32) -> u32 { assert_ready(); baseline::rt_grow(size) }
#[wasm_bindgen]
pub fn raw_exports() -> JsValue { wasm_bindgen::exports() }
