//! macOS backend: one `NSWindow` per plugin editor; the handle is its content
//! `NSView`, which is what a VST3 editor's `attached(.., "NSView")` wants.
//!
//! # Who pumps the windows
//!
//! Tauri's event loop (tao) runs `NSApplication` on the main thread, and every
//! window created on that thread is serviced by it -- the same arrangement as
//! the Win32 backend. The wake-up tick is an `NSTimer` added to the main run
//! loop in the *common* modes, so it keeps firing while the user drags a
//! window edge or holds a menu open (the run loop is then in a tracking mode).
//!
//! # Events
//!
//! A small `NSWindowDelegate` turns the close button into
//! [`WindowEvent::Closed`] (refusing the close: the owner detaches the plugin's
//! view and then destroys the window itself) and frame changes into
//! [`WindowEvent::Resized`].
//!
//! # Title bar
//!
//! The editor keeps the native title bar (traffic lights, drag to move) instead of the
//! software header the Win32 and X11 backends draw: the plugin embeds straight into the
//! content view, and the title is the plugin's name alone: AppKit does not shorten a title
//! for a titlebar accessory, and in a narrow editor the subtitle would run under the buttons. The header's gear and pin sit at
//! the title bar's right as a titlebar accessory and report through the same
//! [`WindowState::header_click`]. Pinning raises the window to the floating level.
//!
//! # Units
//!
//! Sizes are in **points**, which is what macOS VST3 editors work in; the
//! backing layer follows the display's scale factor on its own. So [`dpi`]
//! reports the reference 96 and no content scale is ever negotiated.

use std::cell::RefCell;
use std::collections::HashMap;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr::NonNull;
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject, Sel};
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSBackingStoreType, NSButton, NSControlStateValueOff, NSControlStateValueOn, NSFloatingWindowLevel, NSImage, NSLayoutAttribute,
    NSNormalWindowLevel, NSTitlebarAccessoryViewController, NSView, NSWindow, NSWindowDelegate, NSWindowStyleMask,
};
use objc2_foundation::{
    NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect, NSRunLoop, NSRunLoopCommonModes, NSSize, NSString, NSTimer,
};

use crate::header::Part;
use crate::service::{WindowError, WindowEvent, WindowId, WindowOptions, WindowSize, WindowState, PUMP_INTERVAL_MS};

/// The "dpi" every macOS window reports: sizes are already in points.
const REFERENCE_DPI: u32 = 96;

/// Everything one open window needs, keyed by its handle (the content view's
/// address). Main thread only, so a thread-local is the natural home.
struct Entry {
    window: Retained<NSWindow>,
    view: Retained<NSView>,
    // Kept alive for as long as the window refers to it (it is a weak property).
    delegate: Retained<WindowDelegate>,
    timer: Retained<NSTimer>,
    state: Rc<WindowState>,
    /// The title bar's pin, drawn filled while the window is pinned (`None`: no symbol images).
    pin: Option<Retained<NSButton>>,
    // Owned by the window once added; kept for as long as the entry.
    _accessory: Retained<NSTitlebarAccessoryViewController>,
}

thread_local! {
    static WINDOWS: RefCell<HashMap<isize, Entry>> = RefCell::new(HashMap::new());
}

/// The state of a live window, cloned out so no borrow of the registry is held
/// while owner code (which may close this very window) runs.
fn state_of(handle: isize) -> Option<Rc<WindowState>> {
    WINDOWS.with(|windows| windows.borrow().get(&handle).map(|entry| Rc::clone(&entry.state)))
}

fn pin_of(handle: isize) -> Option<Retained<NSButton>> {
    WINDOWS.with(|windows| windows.borrow().get(&handle).and_then(|entry| entry.pin.clone()))
}

fn window_of(handle: isize) -> Option<(Retained<NSWindow>, Retained<NSView>)> {
    WINDOWS.with(|windows| windows.borrow().get(&handle).map(|entry| (entry.window.clone(), entry.view.clone())))
}

/// A panic must not unwind into AppKit.
fn guarded(what: &str, f: impl FnOnce()) {
    if catch_unwind(AssertUnwindSafe(f)).is_err() {
        log::error!("a plugin window {what} handler panicked");
    }
}

fn to_size(size: NSSize) -> WindowSize {
    WindowSize::new(size.width.max(0.0).round() as u32, size.height.max(0.0).round() as u32)
}

fn to_ns_size(size: WindowSize) -> NSSize {
    NSSize::new(f64::from(size.width), f64::from(size.height))
}

fn style_for(resizable: bool) -> NSWindowStyleMask {
    let fixed = NSWindowStyleMask::Titled | NSWindowStyleMask::Closable | NSWindowStyleMask::Miniaturizable;
    if resizable {
        fixed | NSWindowStyleMask::Resizable
    } else {
        fixed
    }
}

struct DelegateIvars {
    handle: isize,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and the delegate does
    // not implement `Drop`.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WavePluginWindowDelegate"]
    #[ivars = DelegateIvars]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    impl WindowDelegate {
        /// The title bar's gear: Synkopa's own window for the plugin.
        #[unsafe(method(synkopaSettings:))]
        fn settings_clicked(&self, _sender: Option<&AnyObject>) {
            let handle = self.ivars().handle;
            guarded("settings", || {
                if let Some(state) = state_of(handle) {
                    state.header_click(Part::Settings);
                }
            });
        }

        /// The title bar's pin: keep the window on top of the app's, or not.
        #[unsafe(method(synkopaPin:))]
        fn pin_clicked(&self, _sender: Option<&AnyObject>) {
            let handle = self.ivars().handle;
            guarded("pin", || {
                if let Some(state) = state_of(handle) {
                    // toggles the state and tells the app, which remembers it per plugin
                    state.header_click(Part::Pin);
                    set_always_on_top(handle, state.pinned());
                }
            });
        }
    }

    unsafe impl NSWindowDelegate for WindowDelegate {
        /// The close button: tell the owner and refuse. The owner detaches the
        /// editor first and then destroys the window (see `Service` docs).
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            let handle = self.ivars().handle;
            guarded("close", || {
                if let Some(state) = state_of(handle) {
                    state.post(WindowEvent::Closed);
                }
            });
            false
        }

        #[unsafe(method(windowDidResize:))]
        fn window_did_resize(&self, _notification: &NSNotification) {
            let handle = self.ivars().handle;
            guarded("resize", || {
                if let (Some(state), Some((_, view))) = (state_of(handle), window_of(handle)) {
                    state.post(WindowEvent::Resized(to_size(view.frame().size)));
                }
            });
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, handle: isize) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars { handle });
        // SAFETY: `init` is NSObject's designated initialiser.
        unsafe { msg_send![super(this), init] }
    }
}

/// SF Symbols for the pin, unpinned and pinned.
const PIN_SYMBOLS: [&str; 2] = ["pin", "pin.fill"];

fn symbol(name: &str, description: &str) -> Option<Retained<NSImage>> {
    NSImage::imageWithSystemSymbolName_accessibilityDescription(&NSString::from_str(name), Some(&NSString::from_str(description)))
}

/// A borderless title-bar button at `x` in the accessory that sends `action` to `delegate`.
fn title_button(mtm: MainThreadMarker, image: &NSImage, tip: &str, delegate: &WindowDelegate, action: Sel, x: f64) -> Retained<NSButton> {
    let target: &AnyObject = delegate.as_ref();
    // SAFETY: the delegate implements `action` (see `define_class!` above) and outlives the
    // button: both live in the window's registry entry.
    let button = unsafe { NSButton::buttonWithImage_target_action(image, Some(target), Some(action), mtm) };
    button.setBordered(false);
    button.setToolTip(Some(&NSString::from_str(tip)));
    button.setFrame(NSRect::new(NSPoint::new(x, 3.0), NSSize::new(26.0, 22.0)));
    button
}

/// The pin and the gear at the title bar's right; the pin is returned so it can show its state.
fn add_title_buttons(
    mtm: MainThreadMarker,
    window: &NSWindow,
    delegate: &WindowDelegate,
) -> (Retained<NSTitlebarAccessoryViewController>, Option<Retained<NSButton>>) {
    let bar = NSView::initWithFrame(NSView::alloc(mtm), NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(64.0, 28.0)));
    let pin = symbol(PIN_SYMBOLS[0], "Keep on top").map(|image| {
        let pin = title_button(mtm, &image, "Keep this window on top", delegate, sel!(synkopaPin:), 4.0);
        bar.addSubview(&pin);
        pin
    });
    if let Some(image) = symbol("gearshape", "Settings") {
        let gear = title_button(mtm, &image, "Synkopa's settings for this plugin", delegate, sel!(synkopaSettings:), 34.0);
        bar.addSubview(&gear);
    }
    let accessory = NSTitlebarAccessoryViewController::new(mtm);
    accessory.setView(&bar);
    accessory.setLayoutAttribute(NSLayoutAttribute::Right);
    window.addTitlebarAccessoryViewController(&accessory);
    (accessory, pin)
}

pub(crate) fn create_window(
    options: &WindowOptions,
    size: WindowSize,
    events: Sender<WindowEvent>,
    ticks: Arc<AtomicU64>,
    // The app window: Win32 owns the editor by it. AppKit stacks a normal window fine
    // without it, and the app does not hand one over on macOS.
    _owner: isize,
) -> Result<isize, WindowError> {
    // `Service` already checked the thread; this is the AppKit-level proof.
    let mtm = MainThreadMarker::new().ok_or_else(|| WindowError::Native("plugin windows must be created on the main thread".into()))?;
    let rect = NSRect::new(NSPoint::new(0.0, 0.0), to_ns_size(size));
    // SAFETY: a standard initialiser with valid arguments, on the main thread.
    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            rect,
            style_for(options.resizable),
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: the window is owned through `Retained`; AppKit must not also
    // release it when it closes.
    unsafe { window.setReleasedWhenClosed(false) };
    let state = Rc::new(WindowState::new(options, events, ticks));
    window.setTitle(&NSString::from_str(&options.title));
    window.setContentMinSize(to_ns_size(state.min_size));
    let view = window.contentView().ok_or_else(|| WindowError::Native("the new window has no content view".into()))?;
    let handle = Retained::as_ptr(&view) as isize;
    state.embed.set(handle);

    let delegate = WindowDelegate::new(mtm, handle);
    window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    window.center();
    let (accessory, pin) = add_title_buttons(mtm, &window, &delegate);

    let block = RcBlock::new(move |_timer: NonNull<NSTimer>| {
        guarded("tick", || {
            if let Some(state) = state_of(handle) {
                state.ticks.fetch_add(1, Ordering::Relaxed);
                state.run_tick();
            }
        });
    });
    // SAFETY: the block only ever runs on the main run loop it is added to.
    let timer = unsafe { NSTimer::timerWithTimeInterval_repeats_block(f64::from(PUMP_INTERVAL_MS) / 1000.0, true, &block) };
    // SAFETY: main thread; `NSRunLoopCommonModes` is a valid mode constant.
    unsafe { NSRunLoop::mainRunLoop().addTimer_forMode(&timer, NSRunLoopCommonModes) };

    WINDOWS.with(|windows| windows.borrow_mut().insert(handle, Entry { window, view, delegate, timer, state, pin, _accessory: accessory }));
    Ok(handle)
}

pub(crate) fn destroy_window(handle: isize) {
    let Some(entry) = WINDOWS.with(|windows| windows.borrow_mut().remove(&handle)) else {
        return;
    };
    entry.timer.invalidate();
    entry.window.setDelegate(None);
    entry.window.orderOut(None);
    entry.window.close();
    drop(entry.delegate);
}

/// The view the plugin embeds into: the content view itself (there is no header to keep clear).
pub(crate) fn embed_handle(handle: isize) -> isize {
    state_of(handle).map_or(0, |state| state.embed.get())
}

pub(crate) fn set_always_on_top(handle: isize, pinned: bool) {
    let (Some(state), Some((window, _))) = (state_of(handle), window_of(handle)) else {
        return;
    };
    state.set_pinned_state(pinned);
    window.setLevel(if pinned { NSFloatingWindowLevel } else { NSNormalWindowLevel });
    if let Some(button) = pin_of(handle) {
        button.setState(if pinned { NSControlStateValueOn } else { NSControlStateValueOff });
        if let Some(image) = symbol(PIN_SYMBOLS[usize::from(pinned)], "Keep on top") {
            button.setImage(Some(&image));
        }
    }
}

pub(crate) fn show_window(handle: isize) {
    if let Some((window, _)) = window_of(handle) {
        window.makeKeyAndOrderFront(None);
    }
}

pub(crate) fn request_close(handle: isize) {
    if let Some(state) = state_of(handle) {
        state.post(WindowEvent::Closed);
        state.run_tick();
    }
}

pub(crate) fn set_tick_handler(handle: isize, handler: Option<Rc<dyn Fn()>>) {
    if let Some(state) = state_of(handle) {
        *state.tick.borrow_mut() = handler;
    }
}

pub(crate) fn dpi(_handle: isize) -> u32 {
    REFERENCE_DPI
}

pub(crate) fn has_child_window(handle: isize) -> Result<bool, WindowError> {
    let (_, view) = window_of(handle).ok_or_else(|| WindowError::Native("the window is gone".into()))?;
    Ok(view.subviews().count() > 0)
}

/// The frame of the view the plugin added (`None` before it added one).
pub(crate) fn embedded_size(handle: isize) -> Result<Option<WindowSize>, WindowError> {
    let (_, view) = window_of(handle).ok_or_else(|| WindowError::Native("the window is gone".into()))?;
    Ok(view.subviews().firstObject().map(|child| to_size(child.frame().size)))
}

pub(crate) fn client_size(id: WindowId, handle: isize) -> Result<WindowSize, WindowError> {
    let (_, view) = window_of(handle).ok_or(WindowError::Closed(id))?;
    Ok(to_size(view.frame().size))
}

pub(crate) fn set_client_size(id: WindowId, handle: isize, size: WindowSize) -> Result<(), WindowError> {
    let (window, _) = window_of(handle).ok_or(WindowError::Closed(id))?;
    window.setContentSize(to_ns_size(size));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fixed_window_cannot_be_resized_and_a_resizable_one_can() {
        assert!(style_for(true).contains(NSWindowStyleMask::Resizable));
        assert!(!style_for(false).contains(NSWindowStyleMask::Resizable));
        assert!(style_for(false).contains(NSWindowStyleMask::Closable));
    }

    #[test]
    fn point_sizes_round_and_never_go_negative() {
        assert_eq!(to_size(NSSize::new(400.4, 250.6)), WindowSize::new(400, 251));
        assert_eq!(to_size(NSSize::new(-3.0, 0.0)), WindowSize::new(0, 0));
        assert_eq!(to_size(to_ns_size(WindowSize::new(800, 600))), WindowSize::new(800, 600));
    }
}
