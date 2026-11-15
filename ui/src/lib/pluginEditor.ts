// Keep an effect window in step with the plugin's own editor window: the editor button turns back to
// "open" when the user closes the window with its own close button, and the parameter list is read again when
// the plugin changes values itself. Edits arrive up to ~60 times a second while a knob is dragged,
// and reading the list asks the plugin for every parameter, so re-reads are throttled.

import type { PluginEditorEvent } from '../api/types';

/** Longest a moved editor control takes to show in the parameter list (ms). */
export const EDIT_RELOAD_MS = 100;

/**
 * How long after the user moves a control in WAVE's own list the plugin's "I changed values" reports
 * are taken as an echo of that move (ms). Some plugins report a host-set value back as their own
 * edit; re-reading the list then would pull the slider under the user's mouse. The list's own
 * re-read after a local change brings the plugin's answer in anyway.
 */
export const ECHO_MS = 300;

export interface EditorFollower {
  /** Feed every `plugin-editor` event; those for other effects are ignored. */
  handle(e: PluginEditorEvent): void;
  /** The user just changed a value in WAVE's own list: what the plugin reports next is its echo. */
  localEdit(): void;
  /** Cancel a pending re-read (the window is closing). */
  dispose(): void;
}

/**
 * `onClosed`: the user closed the editor's window. Only a close changes the button: an "edited" event
 * that was still in flight when the user closed the editor from WAVE's own button must not reopen it.
 */
export function followEditor(fxId: number, onClosed: () => void, reload: () => void, ms = EDIT_RELOAD_MS): EditorFollower {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let last = -Infinity, local = -Infinity;
  const run = () => { if (pending !== null) clearTimeout(pending); pending = null; last = Date.now(); reload(); };
  return {
    handle(e) {
      if (e.fxId !== fxId) return;
      if (!e.open) onClosed();
      if (!e.edited || Date.now() - local < ECHO_MS) return;
      // At most one re-read per `ms`. Leading edge: the first move shows at once, and a timer the
      // webview delays (an inactive window) can never hold the list back. Trailing: the last value
      // of a drag always lands.
      const since = Date.now() - last;
      if (since >= ms) run();
      else if (pending === null) pending = setTimeout(run, ms - since);
    },
    localEdit() {
      local = Date.now();
      // a re-read already queued would land mid-drag with the value from before the move
      if (pending !== null) clearTimeout(pending);
      pending = null;
    },
    dispose() {
      if (pending !== null) clearTimeout(pending);
      pending = null;
    },
  };
}
