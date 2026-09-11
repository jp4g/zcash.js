use std::sync::atomic::{AtomicU32, Ordering};
static VALUE: AtomicU32 = AtomicU32::new(0);
#[unsafe(no_mangle)]
pub extern "C" fn probe() -> u32 { VALUE.fetch_add(1, Ordering::SeqCst) }
