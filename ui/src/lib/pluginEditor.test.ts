import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ECHO_MS, EDIT_RELOAD_MS, followEditor } from './pluginEditor';

describe('followEditor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('follows the editor window being closed with its own close button', () => {
    const closed = vi.fn();
    const f = followEditor(7, closed, () => {});
    f.handle({ fxId: 7, open: false, edited: false });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('re-reads the parameters once per interval however fast the editor sends edits', () => {
    const reload = vi.fn();
    const f = followEditor(7, () => {}, reload);
    for (let i = 0; i < 30; i++) { f.handle({ fxId: 7, open: true, edited: true }); vi.advanceTimersByTime(16); }
    // 30 ticks over 480 ms: one re-read per 100 ms, and the last edit still lands after the drag
    vi.advanceTimersByTime(EDIT_RELOAD_MS);
    expect(reload.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(reload.mock.calls.length).toBeLessThanOrEqual(7);
    const settled = reload.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(reload.mock.calls.length).toBe(settled);
  });

  it('shows the first move at once, even if the webview never runs its timers', () => {
    const reload = vi.fn();
    const f = followEditor(7, () => {}, reload);
    f.handle({ fxId: 7, open: true, edited: true });
    expect(reload).toHaveBeenCalledTimes(1);
    // timers starved: a later edit past the interval still re-reads
    vi.setSystemTime(Date.now() + 5 * EDIT_RELOAD_MS);
    f.handle({ fxId: 7, open: true, edited: true });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('takes the plugin\'s reports right after a change in WAVE\'s own list as its echo', () => {
    const reload = vi.fn(), open = vi.fn();
    const f = followEditor(7, open, reload);
    f.localEdit();
    f.handle({ fxId: 7, open: true, edited: true });
    vi.advanceTimersByTime(ECHO_MS - 1);
    f.handle({ fxId: 7, open: true, edited: true });
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled(); // edits never touch the editor button
    // once the user lets go, the plugin's own edits show again
    f.handle({ fxId: 7, open: true, edited: true });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('drops a re-read queued before a change in WAVE\'s own list', () => {
    const reload = vi.fn();
    const f = followEditor(7, () => {}, reload);
    f.handle({ fxId: 7, open: true, edited: true });
    f.handle({ fxId: 7, open: true, edited: true }); // trailing re-read queued
    f.localEdit();
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still follows the window being closed during the echo window', () => {
    const closed = vi.fn();
    const f = followEditor(7, closed, () => {});
    f.localEdit();
    f.handle({ fxId: 7, open: false, edited: false });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('an edit still in flight after the user closed the editor from WAVE does not reopen the button', () => {
    let guiOpen = true;
    const f = followEditor(7, () => { guiOpen = false; }, () => {});
    guiOpen = false; // WAVE's own "Close plugin GUI" resolved
    f.handle({ fxId: 7, open: true, edited: true }); // emitted by the last tick before the close
    expect(guiOpen).toBe(false);
  });

  it('ignores other effects and forgets a pending re-read when disposed', () => {
    const reload = vi.fn(), open = vi.fn();
    const f = followEditor(7, open, reload);
    f.handle({ fxId: 8, open: false, edited: true });
    expect(open).not.toHaveBeenCalled();
    f.handle({ fxId: 7, open: true, edited: true });
    expect(reload).toHaveBeenCalledTimes(1);
    f.handle({ fxId: 7, open: true, edited: true });
    f.dispose();
    vi.advanceTimersByTime(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
