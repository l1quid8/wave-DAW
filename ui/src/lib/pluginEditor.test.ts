import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDIT_RELOAD_MS, followEditor } from './pluginEditor';

describe('followEditor', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('follows the editor window being closed with its own close button', () => {
    const open: boolean[] = [];
    const f = followEditor(7, v => open.push(v), () => {});
    f.handle({ fxId: 7, open: false, edited: false });
    expect(open).toEqual([false]);
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
