import { describe, expect, it } from 'vitest';
import { macKeyCap, macShortcuts } from './platform';

describe('macShortcuts', () => {
  it('writes chords the macOS way, in Apple modifier order', () => {
    expect(macShortcuts('Ctrl+S')).toBe('⌘S');
    expect(macShortcuts('Ctrl+Shift+S')).toBe('⇧⌘S');
    expect(macShortcuts('Shift+Ctrl+Z')).toBe('⇧⌘Z');
    expect(macShortcuts('Alt+F4')).toBe('⌘Q');
    expect(macShortcuts('Ctrl+Enter')).toBe('⌘Enter');
  });

  it('rewrites chords inside sentences and leaves everything else alone', () => {
    expect(macShortcuts('Save (Ctrl+S), then undo with Ctrl+Z.')).toBe('Save (⌘S), then undo with ⌘Z.');
    expect(macShortcuts('Shift+drag to copy')).toBe('Shift+drag to copy');
    expect(macShortcuts('No shortcut here')).toBe('No shortcut here');
    expect(macShortcuts('Del')).toBe('Del');
  });

  it('keeps a hyphen before a mouse gesture, as Apple writes it', () => {
    expect(macShortcuts('Alt+click')).toBe('⌥-click');
    expect(macShortcuts('Ctrl+Alt+drag')).toBe('⌥⌘-drag');
    expect(macShortcuts('Ctrl+right-click to solo')).toBe('⌘-right-click to solo');
    expect(macShortcuts('Ctrl+wheel zooms')).toBe('⌘-wheel zooms');
    expect(macShortcuts('Ctrl+klik')).toBe('⌘-klik');
    expect(macShortcuts('Ctrl+przeciągnij')).toBe('⌘-przeciągnij');
  });

  it('reads chords written with spaces and lone modifiers, as the shortcuts table writes them', () => {
    expect(macShortcuts('Ctrl + drag')).toBe('⌘-drag');
    expect(macShortcuts('Alt + wheel')).toBe('⌥-wheel');
    expect(macShortcuts('Shift + drag')).toBe('Shift + drag');
    expect(macShortcuts('hold Alt')).toBe('hold ⌥');
    expect(macShortcuts('press Shift = time only, Ctrl = pitch only')).toBe('press Shift = time only, ⌘ = pitch only');
    expect(macShortcuts('(Ctrl+Alt = 1 %)')).toBe('(⌥⌘ = 1 %)');
    expect(macShortcuts('Ctrl+C · X · V')).toBe('⌘C · X · V');
    expect(macShortcuts('Ctrl+↑↓ = octave')).toBe('⌘↑↓ = octave');
  });

  it('leaves text that is already in macOS notation, or only looks like a modifier, alone', () => {
    for (const s of ['⇧⌘S', '⌘-click', 'hold ⌥', 'Alternative take', 'Control room']) expect(macShortcuts(s)).toBe(s);
    expect(macShortcuts(macShortcuts('Shift+Ctrl+L'))).toBe('⇧⌘L');
  });

  it('maps chords that have a different Mac key', () => {
    expect(macShortcuts('Alt+F4')).toBe('⌘Q');
  });
});

describe('macKeyCap', () => {
  it('draws modifier keycaps as their glyphs and leaves other keys alone', () => {
    expect(['Ctrl', 'Shift', 'S'].map(macKeyCap)).toEqual(['⌘', '⇧', 'S']);
    expect(macKeyCap('Alt')).toBe('⌥');
    expect(macKeyCap('F4')).toBe('F4');
    expect(macKeyCap('toString')).toBe('toString');
  });
});
