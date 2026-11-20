import { describe, expect, it } from 'vitest';
import { barFits, fitLevel, FIT_MAX } from './toolbarFit';

/** A bar whose content needs `need` px at level 0 and frees `free[i]` px at level i + 1. */
function bar(room: number, need: number, free: number[]) {
  let level = -1;
  const applied: number[] = [];
  const apply = (n: number) => { level = n; applied.push(n); };
  const fits = () => need - free.slice(0, level).reduce((a, b) => a + b, 0) <= room;
  return { apply, fits, applied };
}

describe('fitLevel', () => {
  it('hides nothing when everything fits', () => {
    const b = bar(1000, 900, [50, 50]);
    expect(fitLevel(b.apply, b.fits)).toBe(0);
    expect(b.applied).toEqual([0]);
  });
  it('steps aside only as far as needed', () => {
    const b = bar(1000, 1080, [50, 50, 50]);
    expect(fitLevel(b.apply, b.fits)).toBe(2);
  });
  it('starts from nothing hidden every time, so growing the window brings parts back', () => {
    const narrow = bar(900, 1080, [50, 50, 50, 50]);
    expect(fitLevel(narrow.apply, narrow.fits)).toBe(4);
    const wide = bar(1100, 1080, [50, 50, 50, 50]);
    expect(fitLevel(wide.apply, wide.fits)).toBe(0);
  });
  it('stops at the last level when even that does not fit', () => {
    const b = bar(10, 1080, []);
    expect(fitLevel(b.apply, b.fits)).toBe(FIT_MAX);
  });
});

describe('barFits', () => {
  const ok = { bar: { left: 0, right: 1000 }, left: { left: 0, right: 300 }, mid: { left: 310, right: 700 }, right: { left: 710, right: 1000 }, leftOver: false, midOver: false, rightOver: false };
  it('fits when nothing clips or overlaps', () => expect(barFits(ok)).toBe(true));
  it('does not fit when a section clips its content (the clock cut short)', () => {
    expect(barFits({ ...ok, midOver: true })).toBe(false);
    expect(barFits({ ...ok, leftOver: true })).toBe(false);
  });
  it('does not fit when the sections overlap or run off the bar', () => {
    expect(barFits({ ...ok, mid: { left: 280, right: 700 } })).toBe(false);
    expect(barFits({ ...ok, right: { left: 690, right: 1000 } })).toBe(false);
    expect(barFits({ ...ok, right: { left: 710, right: 1040 } })).toBe(false);
  });
});
