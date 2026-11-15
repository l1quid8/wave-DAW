// Keep an effect window in step with the plugin's own editor window: the editor button follows the
// window (the user can close it with its own close button), and the parameter list is read again when
// the plugin changes values itself. Edits arrive up to ~60 times a second while a knob is dragged,
// and reading the list asks the plugin for every parameter, so re-reads are throttled.

import type { PluginEditorEvent } from '../api/types';

/** Longest a moved editor control takes to show in the parameter list (ms). */
export const EDIT_RELOAD_MS = 100;

export interface EditorFollower {
  /** Feed every `plugin-editor` event; those for other effects are ignored. */
  handle(e: PluginEditorEvent): void;
  /** Cancel a pending re-read (the window is closing). */
  dispose(): void;
}

export function followEditor(fxId: number, setOpen: (open: boolean) => void, reload: () => void, ms = EDIT_RELOAD_MS): EditorFollower {
  let pending: ReturnType<typeof setTimeout> | null = null;
  let last = -Infinity;
  const run = () => { if (pending !== null) clearTimeout(pending); pending = null; last = Date.now(); reload(); };
  return {
    handle(e) {
      if (e.fxId !== fxId) return;
      setOpen(e.open);
      if (!e.edited) return;
      // At most one re-read per `ms`. Leading edge: the first move shows at once, and a timer the
      // webview delays (an inactive window) can never hold the list back. Trailing: the last value
      // of a drag always lands.
      const since = Date.now() - last;
      if (since >= ms) run();
      else if (pending === null) pending = setTimeout(run, ms - since);
    },
    dispose() {
      if (pending !== null) clearTimeout(pending);
      pending = null;
    },
  };
}
