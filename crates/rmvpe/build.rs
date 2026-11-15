//! macOS: link clang's runtime builtins next to ONNX Runtime.
//!
//! The prebuilt `libonnxruntime` (via `ort`) uses Objective-C `@available`
//! checks, which compile to calls to `__isPlatformVersionAtLeast`. That symbol
//! lives in clang's `libclang_rt.osx.a`, which rustc does not link. A debug
//! build happens to resolve it from a copy inside Rust's std, but release
//! builds (thin LTO, one codegen unit) drop that copy as unreferenced and the
//! link fails. Linking the real runtime fixes both.

use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let Some(dir) = clang_runtime_dir() else {
        println!("cargo:warning=clang's runtime directory was not found; a release link may miss __isPlatformVersionAtLeast");
        return;
    };
    if dir.join("libclang_rt.osx.a").is_file() {
        println!("cargo:rustc-link-search=native={}", dir.display());
        println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
}

/// `<clang resource dir>/lib/darwin`, from the clang that links this build.
fn clang_runtime_dir() -> Option<PathBuf> {
    let clang = std::env::var_os("CC").unwrap_or_else(|| "clang".into());
    let output = Command::new(clang).arg("--print-resource-dir").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let resource = String::from_utf8(output.stdout).ok()?;
    Some(PathBuf::from(resource.trim()).join("lib").join("darwin"))
}
