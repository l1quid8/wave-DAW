// The OS the UI runs on, and shortcut labels written the way that OS writes them.
//
// Every keyboard handler accepts Cmd wherever it accepts Ctrl (`e.ctrlKey || e.metaKey`),
// so on macOS the hints say ⌘ / ⌥ / ⇧ like every other Mac app instead of Ctrl / Alt / Shift.

export const IS_MAC: boolean =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// Whole chords whose Mac equivalent is a different key, not just a different modifier.
const MAC_CHORDS: Record<string, string> = { 'Alt+F4': '⌘Q' };

/** Rewrite every `Ctrl+…` / `Alt+…` chord in `text` in macOS notation (⌘⇧S). Other text is untouched. */
export function macShortcuts(text: string): string {
  // A chord is one or more modifiers joined by `+`, then a key; at least one must be Ctrl or Alt
  // (a bare "Shift+drag" reads the same on every platform).
  return text.replace(/\b((?:(?:Ctrl|Alt|Shift)\+)+)([^\s+,;:)]+)/g, (chord: string, mods: string, key: string) => {
    if (Object.prototype.hasOwnProperty.call(MAC_CHORDS, chord)) return MAC_CHORDS[chord];
    if (!/Ctrl|Alt/.test(mods)) return chord;
    // Apple's order: ⌃ ⌥ ⇧ ⌘. Ctrl maps to ⌘ because the handlers treat them alike.
    const has = (m: string) => mods.split('+').includes(m);
    return (has('Alt') ? '⌥' : '') + (has('Shift') ? '⇧' : '') + (has('Ctrl') ? '⌘' : '') + key;
  });
}

/** `macShortcuts` on macOS, the text itself elsewhere. */
export function shortcuts(text: string): string {
  return IS_MAC ? macShortcuts(text) : text;
}
