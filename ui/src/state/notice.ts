import { createSignal } from 'solid-js';

/** A button on a notice: what it says and what it does (the notice closes after it). */
export interface NoticeAction { label: string; act: () => void; danger?: boolean }
export interface Notice { msg: string; actions: NoticeAction[] }

const [notice, setNotice] = createSignal<Notice | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export { notice };

/**
 * A short message with one-click follow-ups (e.g. "Recorded Take 3 on Track 2 · Undo · Delete"),
 * shown at the bottom of the window. A newer notice replaces it; it closes by itself after `ms`
 * unless the pointer is over it.
 */
export function notify(msg: string, actions: NoticeAction[] = [], ms = 8000) {
  setNotice({ msg, actions });
  arm(ms);
}
export function dismissNotice() { clearTimeout(timer); setNotice(null); }
/** Keeps the notice open while the pointer is on it (`ms` = null), or closes it `ms` after. */
export function holdNotice(ms: number | null) { if (ms == null) clearTimeout(timer); else arm(ms); }
function arm(ms: number) { clearTimeout(timer); timer = setTimeout(() => setNotice(null), ms); }
