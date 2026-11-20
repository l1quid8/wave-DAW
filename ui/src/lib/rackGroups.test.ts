import { describe, expect, it } from 'vitest';
import type { Channel } from '../api/types';
import { cleanGroup, fullIndexFor, inFilter, liveFilter, rackGroups } from './rackGroups';

const ch = (id: number, group?: string) => ({ id, name: 'C' + id, group } as unknown as Channel);

describe('Channel Rack filter groups', () => {
  const chans = [ch(1, 'Drums'), ch(2), ch(3, 'Bass'), ch(4, 'Drums'), ch(5)];
  it('lists the groups in rack order with their counts', () => {
    expect(rackGroups(chans)).toEqual([{ name: 'Drums', n: 2 }, { name: 'Bass', n: 1 }]);
    expect(rackGroups([ch(1), ch(2)])).toEqual([]);
  });
  it('filters every channel, the unsorted ones, or one group', () => {
    expect(chans.filter(c => inFilter(c, null)).map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(chans.filter(c => inFilter(c, '')).map(c => c.id)).toEqual([2, 5]);
    expect(chans.filter(c => inFilter(c, 'Drums')).map(c => c.id)).toEqual([1, 4]);
  });
  it('a group with no channel left falls back to every channel', () => {
    expect(liveFilter(chans, 'Drums')).toBe('Drums');
    expect(liveFilter(chans, 'Keys')).toBeNull();
    expect(liveFilter([ch(1, 'Drums')], '')).toBeNull();
  });
  it('cleans a typed name', () => {
    expect(cleanGroup('  Drums ')).toBe('Drums');
    expect(cleanGroup('   ')).toBeUndefined();
    expect(cleanGroup('x'.repeat(50))).toHaveLength(40);
  });
  it('maps a move inside a filtered rack to the full list', () => {
    const all = [1, 2, 3, 4, 5], drums = [1, 4];
    // channel 4 to the top of the Drums view: before 1
    expect(fullIndexFor(all, drums, 4, 0)).toBe(0);
    // channel 1 below 4: after 4 (4 is at index 2 once 1 is out, so index 3)
    expect(fullIndexFor(all, drums, 1, 1)).toBe(3);
    // with the whole rack shown it is the row itself
    expect(fullIndexFor(all, all, 2, 4)).toBe(4);
  });
});
