// Full screen (F11, View menu, Settings → start in full screen). The desktop app asks the
// window (no taskbar, no frame); in a browser the page's own Fullscreen API stands in.
import { createSignal } from 'solid-js';
import { be } from '../api/backend';

const [isFullscreen, setIsFullscreen] = createSignal(false);
export { isFullscreen };

const docFull = () => typeof document !== 'undefined' && !!document.fullscreenElement;

async function read(): Promise<boolean> {
  const win = be().win;
  return win ? win.isFullscreen().catch(() => false) : docFull();
}

export async function setFullscreen(on: boolean) {
  const win = be().win;
  try {
    if (win) await win.setFullscreen(on);
    else if (on) await document.documentElement.requestFullscreen?.();
    else if (docFull()) await document.exitFullscreen();
  } catch { /* refused (a browser without a user gesture): the state below stays truthful */ }
  setIsFullscreen(await read());
}

export const toggleFullscreen = () => setFullscreen(!isFullscreen());

let watching = false;
/** Keep `isFullscreen` true to the window: the OS or the browser (its own Esc) can change it too. */
export function watchFullscreen() {
  if (watching) return;
  watching = true;
  const win = be().win;
  const upd = () => void read().then(setIsFullscreen);
  if (win) void win.onResized(upd);
  else if (typeof document !== 'undefined') document.addEventListener('fullscreenchange', upd);
  upd();
  // F11 from anywhere: a text field (it types nothing), an open dialog, a floating window. Its own
  // capturing listener, so no view's key handler can swallow it first.
  window.addEventListener('keydown', e => {
    if (e.key !== 'F11' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) void toggleFullscreen();
  }, true);
}
