// The keyboard logic of the select list (ui/SelectPopup.tsx), kept pure for tests.

export interface Opt { kind: 'opt'; label: string; value: string; disabled: boolean }
export interface Grp { kind: 'grp'; label: string }
export type Row = Opt | Grp;

/** Next pickable row from `i` in direction `d` (stays put at the ends). */
export function step(rows: Row[], i: number, d: number): number {
  for (let j = i + d; j >= 0 && j < rows.length; j += d) {
    const r = rows[j];
    if (r.kind === 'opt' && !r.disabled) return j;
  }
  return i;
}

/** The row typed letters jump to (-1: none). A first letter moves on to the next match (so
 *  pressing it again cycles), more letters refine the current one. */
export function typeAhead(rows: Row[], hot: number, typed: string): number {
  const n = rows.length, from = typed.length > 1 ? Math.max(hot, 0) : hot + 1;
  for (let k = 0; k < n; k++) {
    const j = (((from + k) % n) + n) % n, r = rows[j];
    if (r.kind === 'opt' && !r.disabled && r.label.toLowerCase().startsWith(typed)) return j;
  }
  return -1;
}
