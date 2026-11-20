import { beforeEach, describe, expect, it, vi } from 'vitest';

// F11 and the View menu toggle the window's full screen; the shown state follows the window.
let full = false;
const calls: boolean[] = [];
vi.mock('../api/backend', () => ({
  be: () => ({ win: { isFullscreen: async () => full, setFullscreen: async (on: boolean) => { calls.push(on); full = on; }, onResized: async () => () => {} } }),
}));
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
vi.stubGlobal('window', { addEventListener: (t: string, h: (e: KeyboardEvent) => void) => { if (t === 'keydown') keyHandler = h; } });

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => {
  const e = { key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...mods } as unknown as KeyboardEvent;
  keyHandler!(e);
  return e;
};
const settle = () => new Promise(r => setTimeout(r, 0));

describe('full screen', () => {
  beforeEach(() => { full = false; calls.length = 0; });

  it('F11 toggles it and the shown state follows the window', async () => {
    const m = await import('./fullscreen');
    m.watchFullscreen();
    await settle();
    expect(m.isFullscreen()).toBe(false);
    const e = key('F11');
    expect(e.preventDefault).toHaveBeenCalled();
    await settle();
    expect(calls).toEqual([true]);
    expect(m.isFullscreen()).toBe(true);
    key('F11'); await settle();
    expect(m.isFullscreen()).toBe(false);
  });

  it('ignores a held key and modified F11', async () => {
    await import('./fullscreen');
    key('F11', { repeat: true });
    key('F11', { ctrlKey: true });
    key('F10');
    await settle();
    expect(calls).toEqual([]);
  });
});
