use wasm_bindgen::prelude::*;
use zcash_client_backend::data_api::WalletWrite;

/// Runs frozen bytes through real migrated WalletDb; requires runtime rt_init first.
#[wasm_bindgen]
pub fn scanner_replay(on_stage: js_sys::Function) -> Result<String, JsValue> {
    let report = |stage: &str| on_stage.call1(&JsValue::NULL, &JsValue::from_str(stage)).expect("stage observer");
    std::panic::set_hook(Box::new(|info| {
        // Forward the real panic text through generated bindings, without replacing behavior.
        panic_message(&info.to_string());
    }));
    report("setup-start");
    let mut conn = crate::fixture::setup();
    crate::fixture::wallet(&mut conn).update_chain_tip(100_006.into()).map_err(|e| JsValue::from_str(&format!("tip: {e:?}")))?;
    report("setup-complete");
    let corpus = crate::fixture::frozen();
    let result = crate::inline_scan_observed(&crate::fixture::network(), &mut crate::fixture::wallet(&mut conn), &crate::fixture::initial(), &corpus.0, |s| { report(s); })
        .map_err(|e| JsValue::from_str(&format!("scan: {e:?}")))?;
    let canonical = serde_json::to_vec_pretty(&crate::observation::canonical_snapshot(&conn)).unwrap();
    if canonical != include_bytes!("../fixtures/native-reference.json") {
        return Err(JsValue::from_str("native canonical mismatch"));
    }
    report("canonical-match");
    Ok(format!("{result:?}"))
}

#[wasm_bindgen(module = "/replay/panic.mjs")]
extern "C" {
    fn panic_message(message: &str);
}

/// Reusable per-case entry. Caller initializes its real runtime/worker pool first.
/// Each case creates and closes its own real ephemeral WalletDb.
#[wasm_bindgen]
pub fn scanner_case(name: &str, on_stage: js_sys::Function) -> Result<String, JsValue> {
    std::panic::set_hook(Box::new(|info| panic_message(&info.to_string())));
    let expected = crate::cases::expected_case(name).map_err(|e| JsValue::from_str(&e))?;
    let mut report = |stage: &str| { on_stage.call1(&JsValue::NULL, &JsValue::from_str(stage)).expect("stage observer"); };
    let result = crate::cases::run_case(name, crate::cases::Mode::Inline, &mut report).map_err(|e| JsValue::from_str(&e))?;
    if result != expected { return Err(JsValue::from_str(&format!("{name}: native reference mismatch"))); }
    report("reference-match");
    Ok(serde_json::json!({"schema":2,"case":name,"passed":true,"result":result}).to_string())
}
