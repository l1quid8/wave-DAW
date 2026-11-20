import { describe, expect, it } from 'vitest';
import { stackPatternClips } from './clipOps';

// Several patterns dragged from the Browser: one per track, all from the drop point.
describe('stacking patterns dropped together', () => {
  let id = 100;
  const lens: Record<number, number> = { 1: 8, 2: 4, 3: 16 };
  it('puts each on its own track from the drop track down, at the same start', () => {
    const r = stackPatternClips([1, 2, 3], 4, 8, 30, 512, ref => lens[ref], () => id++);
    expect(r.clips.map(c => [c.track, c.start, c.len, c.ref, c.kind])).toEqual([[4, 8, 8, 1, 'pat'], [5, 8, 4, 2, 'pat'], [6, 8, 16, 3, 'pat']]);
    expect(new Set(r.clips.map(c => c.id)).size).toBe(3);
    expect(r.newTracks).toBe(0);
  });
  it('asks for the tracks missing below the last one', () => {
    expect(stackPatternClips([1, 2, 3], 28, 0, 30, 512, ref => lens[ref], () => id++).newTracks).toBe(1);
  });
  it('clips a pattern at the end of the song', () => {
    const [c] = stackPatternClips([3], 0, 504, 30, 512, ref => lens[ref], () => id++).clips;
    expect(c.len).toBe(8);
  });
});
