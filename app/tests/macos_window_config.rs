//! `tauri.macos.conf.json` must repeat the main window from `tauri.conf.json`.
//!
//! Tauri merges platform config files with JSON merge-patch, which replaces arrays
//! wholesale: the macOS file cannot override a single key of `app.windows[0]`, it has to
//! carry the whole window. Tauri has no runtime setter for the hidden title or the
//! traffic-light position, so the copy is the only way to get the native title bar.
//! This test keeps the copy honest on every platform's CI: change the main window and it
//! fails until the macOS window says the same.

use serde_json::{Map, Value};

/// Keys only the macOS window has (or overrides): the native title bar over the toolbar.
const MACOS_ONLY: &[&str] = &["decorations", "titleBarStyle", "hiddenTitle", "trafficLightPosition"];

fn main_window(file: &str) -> Map<String, Value> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(file);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    let config: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    let windows = config["app"]["windows"].as_array().unwrap_or_else(|| panic!("{file} has no app.windows"));
    assert_eq!(windows.len(), 1, "{file}: Synkopa has one main window");
    windows[0].as_object().cloned().unwrap_or_else(|| panic!("{file}: the window is not an object"))
}

fn without_macos_keys(mut window: Map<String, Value>) -> Map<String, Value> {
    for key in MACOS_ONLY {
        window.remove(*key);
    }
    window
}

#[test]
fn the_macos_window_is_the_main_window_plus_its_title_bar() {
    let main = main_window("tauri.conf.json");
    let macos = main_window("tauri.macos.conf.json");
    assert_eq!(
        without_macos_keys(macos.clone()),
        without_macos_keys(main),
        "tauri.macos.conf.json's window has drifted from tauri.conf.json: copy the change across \
         (only {MACOS_ONLY:?} may differ)"
    );
    assert_eq!(macos["decorations"], Value::Bool(true), "the traffic lights need the native frame");
    assert_eq!(macos["titleBarStyle"], "Overlay", "the toolbar sits under a transparent title bar");
    assert_eq!(macos["hiddenTitle"], Value::Bool(true), "the window title would be drawn over the toolbar");
}
