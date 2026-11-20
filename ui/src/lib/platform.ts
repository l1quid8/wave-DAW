// The OS the UI runs on, and shortcut labels written the way that OS writes them.
//
// Every keyboard handler accepts Cmd wherever it accepts Ctrl (`e.ctrlKey || e.metaKey`),
// so on macOS the hints say ⌘ / ⌥ / ⇧ like every other Mac app instead of Ctrl / Alt / Shift.

// Never under the test runner: jsdom reports "Macintosh" on a Mac, and the UI's tests must read the
// same text on every machine (`macShortcuts` is tested directly).
export const IS_MAC: boolean =
  import.meta.env.MODE !== 'test' &&
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

// Whole chords whose Mac equivalent is a different key, not just a different modifier.
const MAC_CHORDS: Record<string, string> = { 'Alt+F4': '⌘Q' };

/** A lower-case word ("click", "wheel", "right-click", "przeciągnij") rather than a key name ("S", "F4", "Enter", "Del"). */
const isGesture = (key: string) => key.length > 1 && key[0] !== key[0].toUpperCase();

const MODIFIERS = ['Ctrl', 'Alt', 'Shift'];

/**
 * Rewrite every `Ctrl+…` / `Alt+…` chord in `text` in macOS notation (⌘⇧S), with or without spaces
 * around the `+` ("Ctrl + drag"), and a lone Ctrl or Alt ("hold Alt", "Ctrl = pitch only") as its
 * glyph. Other text is untouched, and text already in macOS notation stays as it is.
 */
export function macShortcuts(text: string): string {
  // A chord is one or more modifiers joined by `+`, then a key (which may itself be a modifier:
  // "Ctrl+Alt"); at least one must be Ctrl or Alt (a bare "Shift+drag" reads the same everywhere).
  const chords = text.replace(/\b((?:(?:Ctrl|Alt|Shift)\s*\+\s*)+)([^\s+,;:)]+)/g, (chord: string, rawMods: string, key: string) => {
    const mods = rawMods.replace(/\s+/g, '').split('+').filter(Boolean);
    const named = mods.join('+') + '+' + key;
    if (Object.prototype.hasOwnProperty.call(MAC_CHORDS, named)) return MAC_CHORDS[named];
    const keyIsModifier = MODIFIERS.includes(key);
    const all = keyIsModifier ? [...mods, key] : mods;
    if (!all.includes('Ctrl') && !all.includes('Alt')) return chord;
    // Apple's order: ⌃ ⌥ ⇧ ⌘. Ctrl maps to ⌘ because the handlers treat them alike.
    const glyphs = (all.includes('Alt') ? '⌥' : '') + (all.includes('Shift') ? '⇧' : '') + (all.includes('Ctrl') ? '⌘' : '');
    if (keyIsModifier) return glyphs;
    // A key is written right after its glyphs (⌘S, ⇧⌘F4); a mouse gesture or other word keeps a
    // hyphen, as Apple writes "⌘-click", so "⌘-click" / "⌥-drag" / "⌘-klik" stay readable.
    return glyphs + (isGesture(key) ? '-' : '') + key;
  });
  return chords.replace(/\bCtrl\b/g, '⌘').replace(/\bAlt\b/g, '⌥');
}

const MAC_KEYCAPS: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧' };

/** One key of a chord drawn as a keycap (the shortcuts table): a modifier as its Mac glyph. */
export function macKeyCap(key: string): string {
  return Object.prototype.hasOwnProperty.call(MAC_KEYCAPS, key) ? MAC_KEYCAPS[key] : key;
}

/** `macKeyCap` on macOS, the key itself elsewhere. */
export function keyCap(key: string): string {
  return IS_MAC ? macKeyCap(key) : key;
}

/** `macShortcuts` on macOS, the text itself elsewhere. */
export function shortcuts(text: string): string {
  return IS_MAC ? macShortcuts(text) : text;
}
