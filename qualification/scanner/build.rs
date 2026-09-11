fn main() {
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() != Ok("wasm32") { return; }
    let sdk = std::env::var("SCANNER_SDK").expect("use build-wasm.py");
    let adapter = std::env::var("SCANNER_ADAPTER").expect("use build-wasm.py");
    let sqlite = std::env::var("SCANNER_SQLITE").expect("use build-wasm.py");
    let out = std::env::var("OUT_DIR").unwrap();
    let status = std::process::Command::new(format!("{sdk}/bin/clang"))
        .args(["--target=wasm32-wasi", "-O2", "-g", "-ffunction-sections", "-fdata-sections",
            "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter", "-I", &sqlite,
            "-c", &adapter, "-o", &format!("{out}/adapter.o")]).status().unwrap();
    assert!(status.success());
    println!("cargo:rerun-if-changed={adapter}");
    for key in ["SCANNER_SDK", "SCANNER_ADAPTER", "SCANNER_SQLITE"] { println!("cargo:rerun-if-env-changed={key}"); }
    println!("cargo:rustc-link-arg={out}/adapter.o");
    println!("cargo:rustc-link-search=native={sdk}/share/wasi-sysroot/lib/wasm32-wasi");
    println!("cargo:rustc-link-lib=static=c");
    println!("cargo:rustc-link-arg=--error-limit=0");
    let target = std::env::var("CARGO_TARGET_DIR").unwrap();
    println!("cargo:rustc-link-arg=-Map={target}/scanner.map");
    for name in ["rt_init", "__heap_base", "__heap_end"] { println!("cargo:rustc-link-arg=--export={name}"); }
}
