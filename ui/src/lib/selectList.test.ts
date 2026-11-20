import { describe, expect, it } from 'vitest';
import { step, typeAhead, type Row } from './selectList';

const o = (label: string, disabled = false): Row => ({ kind: 'opt', label, value: label, disabled });
// a select with a group: auto, off, [Triplets] 1/6, 1/12 (disabled), 1/24
const rows: Row[] = [o('auto'), o('off'), { kind: 'grp', label: 'Triplets' }, o('1/6'), o('1/12', true), o('1/24')];

describe('select list keyboard', () => {
  it('steps over group labels and disabled options, and stops at the ends', () => {
    expect(step(rows, 1, 1)).toBe(3); // off → 1/6, skipping the group label
    expect(step(rows, 3, 1)).toBe(5); // 1/6 → 1/24, skipping the disabled 1/12
    expect(step(rows, 5, 1)).toBe(5); // last stays
    expect(step(rows, 0, -1)).toBe(0); // first stays
    expect(step(rows, -1, 1)).toBe(0); // Home
    expect(step(rows, rows.length, -1)).toBe(5); // End
  });

  it('jumps to typed letters, cycling on a repeated first letter', () => {
    expect(typeAhead(rows, 0, 'o')).toBe(1);
    expect(typeAhead(rows, 3, '1')).toBe(5); // the next "1…", skipping the disabled one
    expect(typeAhead(rows, 5, '1')).toBe(3); // wraps around
    expect(typeAhead(rows, 3, '1/2')).toBe(5); // more letters refine
    expect(typeAhead(rows, 0, 'x')).toBe(-1);
    expect(typeAhead(rows, -1, 'a')).toBe(0); // nothing highlighted yet
  });
});
