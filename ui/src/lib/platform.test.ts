import { describe, expect, it } from 'vitest';
import { macShortcuts } from './platform';

describe('macShortcuts', () => {
  it('writes chords the macOS way, in Apple modifier order', () => {
    expect(macShortcuts('Ctrl+S')).toBe('⌘S');
    expect(macShortcuts('Ctrl+Shift+S')).toBe('⇧⌘S');
    expect(macShortcuts('Shift+Ctrl+Z')).toBe('⇧⌘Z');
    expect(macShortcuts('Alt+click')).toBe('⌥click');
    expect(macShortcuts('Ctrl+Alt+drag')).toBe('⌥⌘drag');
  });

  it('rewrites chords inside sentences and leaves everything else alone', () => {
    expect(macShortcuts('Save (Ctrl+S), then undo with Ctrl+Z.')).toBe('Save (⌘S), then undo with ⌘Z.');
    expect(macShortcuts('Shift+drag to copy')).toBe('Shift+drag to copy');
    expect(macShortcuts('No shortcut here')).toBe('No shortcut here');
    expect(macShortcuts('Del')).toBe('Del');
  });

  it('maps chords that have a different Mac key', () => {
    expect(macShortcuts('Alt+F4')).toBe('⌘Q');
  });
});
