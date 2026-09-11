fn main() {
    let sdk = std::env::var("runtime_sdk").expect("source runtime/env.sh");
    let out = std::env::var("OUT_DIR").unwrap();
    let sqlite = "/home/jack/zcash-storage-scratch/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/libsqlite3-sys-0.35.0/sqlite3";
    let status = std::process::Command::new(format!("{sdk}/bin/clang"))
        .args(["--target=wasm32-wasi", "-O2", "-g", "-ffunction-sections", "-fdata-sections",
            "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter", "-I", sqlite,
            "-c", "adapter.c", "-o", &format!("{out}/adapter.o")])
        .status().unwrap();
    assert!(status.success());
    println!("cargo:rerun-if-changed=adapter.c");
    println!("cargo:rustc-link-arg={out}/adapter.o");
    println!("cargo:rustc-link-search=native={sdk}/share/wasi-sysroot/lib/wasm32-wasi");
    println!("cargo:rustc-link-lib=static=c");
    println!("cargo:rustc-link-arg=--error-limit=0");
    println!("cargo:rustc-link-arg=-Map=/home/jack/zcash-storage-scratch/runtime.map");
    for name in ["rt_init", "rt_pool_check", "rt_pool_start", "rt_pool_size", "rt_hosts", "rt_time", "__heap_base", "__heap_end"] {
        println!("cargo:rustc-link-arg=--export={name}");
    }
}
