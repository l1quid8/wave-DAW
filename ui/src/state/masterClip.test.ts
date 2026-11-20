import { beforeEach, describe, expect, it } from 'vitest';
import { masterClip, noteMasterPeak, resetMasterClip } from './masterClip';

describe('master clip latch', () => {
  beforeEach(() => resetMasterClip());

  it('stays off at and under full scale', () => {
    noteMasterPeak(0.5, 0.99, 4);
    noteMasterPeak(1, 1, 8);
    expect(masterClip()).toBeNull();
  });

  it('latches the first over and keeps it after the level drops', () => {
    noteMasterPeak(1.2, 0.8, 32);
    noteMasterPeak(0.1, 0.1, 40);
    const c = masterClip()!;
    expect(c.firstBeat).toBe(32);
    expect(c.overDb).toBeCloseTo(20 * Math.log10(1.2), 5);
  });

  it('raises to the highest over but keeps where it first clipped', () => {
    noteMasterPeak(1.1, 1.1, 32);
    noteMasterPeak(1.05, 1.0, 36);
    expect(masterClip()!.overDb).toBeCloseTo(20 * Math.log10(1.1), 5);
    noteMasterPeak(1.0, 1.78, 48);
    expect(masterClip()!.overDb).toBeCloseTo(20 * Math.log10(1.78), 5);
    expect(masterClip()!.firstBeat).toBe(32);
  });

  it('places an over in PAT mode in the pattern', () => {
    noteMasterPeak(1.3, 0, 120, 6);
    expect(masterClip()).toMatchObject({ firstBeat: 6, inPattern: true });
  });

  it('ignores non-finite peaks and clears on reset', () => {
    noteMasterPeak(NaN, Infinity, 1);
    expect(masterClip()).toBeNull();
    noteMasterPeak(2, 0, 3);
    resetMasterClip();
    expect(masterClip()).toBeNull();
    noteMasterPeak(1.5, 0, 12);
    expect(masterClip()!.firstBeat).toBe(12);
  });
});
