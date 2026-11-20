import { describe, expect, it } from 'vitest';
import type { Clip, Project } from '../api/types';
import { dropEmptyTrack, recTarget } from './recTarget';
import { recLanded, recSnapshot } from './recLanded';
import { newTrack } from './clipOps';

const clip = (id: number, track: number, start: number, len: number, kind: Clip['kind'] = 'pat', ref = 1): Clip =>
  ({ id, track, start, len, offset: 0, kind, ref, muted: false, gain: 0, fadeIn: 0, fadeOut: 0, pan: 0, norm: false, rev: false });
const project = (tracks: number, clips: Clip[] = []): Project => ({
  version: 2, bpm: 120, tracks: Array.from({ length: tracks }, (_, i) => newTrack(i + 1, i)),
  inserts: [{ id: 0, name: 'Master', color: '#fff', vol: 0.79, pan: 0, muted: false, solo: false, fx: [] }],
  patterns: [{ id: 1, name: 'Beat', color: '#fff', len: 4, minLen: 4, notes: [] }], sources: [], clips, loop: null, nextId: 1000,
} as unknown as Project);

describe('where a recording goes (mirror of engine rec_target)', () => {
  it('takes the first track with nothing on it from the start on', () => {
    expect(recTarget(project(3, [clip(10, 0, 0, 4)]), 0)).toBe(1);
    // track 0 is busy later in the song: not free "for good" from beat 0
    expect(recTarget(project(3, [clip(10, 0, 32, 4)]), 0)).toBe(1);
    // ...but free after that clip
    expect(recTarget(project(3, [clip(10, 0, 32, 4)]), 40)).toBe(0);
  });
  it('only looks at the loop range when recording loops', () => {
    expect(recTarget(project(2, [clip(10, 0, 32, 4)]), 0, 8)).toBe(0);
  });
  it('asks for a new track when every track is busy, and an armed track wins over all', () => {
    const p = project(2, [clip(10, 0, 0, 4), clip(11, 1, 0, 4)]);
    expect(recTarget(p, 0)).toBe('new');
    p.tracks[1].arm = true;
    expect(recTarget(p, 0)).toBe(1);
  });
  it('drops an empty track (the ones below move up) and keeps one that holds clips', () => {
    const p = project(3, [clip(10, 2, 0, 4)]);
    expect(dropEmptyTrack(p, p.tracks[2].id)).toBe(false);
    expect(dropEmptyTrack(p, p.tracks[1].id)).toBe(true);
    expect(p.tracks).toHaveLength(2);
    expect(p.clips[0].track).toBe(1);
  });
});

describe('what a recording added', () => {
  it('finds new clips, new takes of a comp and notes added to a pattern', () => {
    const p = project(2);
    p.comps = [{ id: 50, name: 'Comp 1', takes: [{ id: 51, name: 'Take 1', ref: 5, start: 0, len: 4, offset: 0 }], regions: [], xfade: 0 }] as Project['comps'];
    const snap = recSnapshot(p);
    expect(recLanded(snap, p)).toBeNull();
    // PAT mode: notes added to the pattern
    const notes = structuredClone(p); notes.patterns[0].notes.push({ ch: 1, step: 0, len: 1 } as never, { ch: 1, step: 4, len: 1 } as never);
    expect(recLanded(snap, notes)).toEqual({ kind: 'notes', pattern: 1, from: 0, count: 2 });
    // recorded over the comp: a new take
    const takes = structuredClone(p); takes.comps![0].takes.push({ id: 52, name: 'Take 2', ref: 6, start: 0, len: 4, offset: 0 });
    expect(recLanded(snap, takes)).toEqual({ kind: 'takes', comp: 50, takes: [52] });
    // a take as a new clip (and a MIDI take's new pattern)
    const clips = structuredClone(p); clips.clips.push(clip(60, 1, 0, 4, 'pat', 61));
    clips.patterns.push({ id: 61, name: 'MIDI take 1', color: '#fff', len: 4, minLen: 4, notes: [] } as never);
    expect(recLanded(snap, clips)).toEqual({ kind: 'clips', ids: [60], patterns: [61] });
  });
});
