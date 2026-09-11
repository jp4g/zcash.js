fn main() {
    let inputs = std::env::var("WD_INPUTS").expect("use build.py");
    let out = std::env::var("OUT_DIR").unwrap();
    std::fs::write(format!("{out}/scanner-module.rs"), format!("#[path = \"{inputs}/scanner/src/lib.rs\"] pub mod scanner;" )).unwrap();
    println!("cargo:rustc-env=WD_FIXTURES={inputs}/scanner/fixtures");
    println!("cargo:rerun-if-env-changed=WD_INPUTS");
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("wasm32") { return; }
    let sdk = std::env::var("runtime_sdk").unwrap();
    let out = std::env::var("OUT_DIR").unwrap();
    let cargo = std::env::var("CARGO_HOME").unwrap();
    let sqlite = format!("{cargo}/registry/src/index.crates.io-1949cf8c6b5b557f/libsqlite3-sys-0.35.0/sqlite3");
    let adapter = format!("{inputs}/storage/adapter.c");
    let status = std::process::Command::new(format!("{sdk}/bin/clang"))
        .args(["--target=wasm32-wasi", "-O2", "-g", "-ffunction-sections", "-fdata-sections", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter", "-I", &sqlite, "-c", &adapter, "-o", &format!("{out}/adapter.o")]).status().unwrap();
    assert!(status.success());
    println!("cargo:rustc-link-arg={out}/adapter.o");
    println!("cargo:rustc-link-search=native={sdk}/share/wasi-sysroot/lib/wasm32-wasi");
    println!("cargo:rustc-link-lib=static=c");
    let target = std::env::var("CARGO_TARGET_DIR").unwrap();
    println!("cargo:rustc-link-arg=-Map={target}/runtime.map");
    for name in ["rt_init", "rt_pool_check", "rt_pool_start", "rt_pool_size", "__heap_base", "__heap_end"] { println!("cargo:rustc-link-arg=--export={name}"); }
}
