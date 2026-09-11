fn main() {
    let sdk = std::env::var("runtime_sdk").expect("source threaded/env.sh");
    let out = std::env::var("OUT_DIR").unwrap();
    let cache = std::env::var("CARGO_HOME").unwrap();
    let sqlite = format!("{cache}/registry/src/index.crates.io-1949cf8c6b5b557f/libsqlite3-sys-0.35.0/sqlite3");
    let status = std::process::Command::new(format!("{sdk}/bin/clang"))
        .args(["--target=wasm32-wasi-threads", "-matomics", "-mbulk-memory", "-pthread", "-O2", "-g",
            "-ffunction-sections", "-fdata-sections", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
            "-I", &sqlite, "-c", "adapter.c", "-o", &format!("{out}/adapter.o")])
        .status().unwrap();
    assert!(status.success());
    println!("cargo:rerun-if-changed=adapter.c");
    println!("cargo:rustc-link-arg={out}/adapter.o");
    println!("cargo:rustc-link-search=native={sdk}/share/wasi-sysroot/lib/wasm32-wasi-threads");
    println!("cargo:rustc-link-lib=static=c");
    println!("cargo:rustc-link-arg=--error-limit=0");
    let target = std::env::var("CARGO_TARGET_DIR").unwrap();
    println!("cargo:rustc-link-arg=-Map={target}/threaded.map");
    for name in ["__wasm_init_tls", "__tls_size", "__tls_align", "__tls_base", "rt_init", "rt_pool_check", "rt_pool_start", "rt_pool_size", "__heap_base", "__heap_end"] {
        println!("cargo:rustc-link-arg=--export={name}");
    }
}
