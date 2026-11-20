import { describe, expect, it } from 'vitest';
import type { Clip } from '../api/types';
import { putSoundClips, sharedSound } from './clipOps';

const clip = (id: number, ref: number, extra: Partial<Clip> = {}): Clip => ({
  id, track: 0, start: id * 4, len: 2, offset: 0, kind: 'audio', ref, muted: false, gain: 0, fadeIn: 0, fadeOut: 0, pan: 0, norm: false, rev: false, ...extra,
});

describe('the sound of a sample is shared by its clips', () => {
  const clips = [clip(1, 10), clip(2, 10, { fadeIn: 0.1 }), clip(3, 11)];
  it('a volume change reaches every clip of the same sample in one op', () => {
    const op = putSoundClips(clips, clips[0], { gain: -6 });
    expect(op.op).toBe('putClips');
    const out = op.op === 'putClips' ? op.clips : [];
    expect(out.map(c => [c.id, c.gain])).toEqual([[1, -6], [2, -6]]);
    // the other clip keeps what is its own
    expect(out[1].fadeIn).toBe(0.1);
  });
  it('pitch, pan, reverse and normalize are shared too', () => {
    const op = putSoundClips(clips, clips[1], { pitch: 2, pan: 0.5, rev: true, norm: true });
    const out = op.op === 'putClips' ? op.clips : [];
    expect(out.find(c => c.id === 1)).toMatchObject({ pitch: 2, pan: 0.5, rev: true, norm: true });
    expect(out.some(c => c.id === 3)).toBe(false);
  });
  it('a fade or a region stays the edited clip\'s own', () => {
    const op = putSoundClips(clips, clips[0], { fadeIn: 0.3, len: 1 });
    expect(op.op === 'putClips' && op.clips.map(c => c.id)).toEqual([1]);
  });
  it('clips already matching are not rewritten', () => {
    const same = [clip(1, 10), clip(2, 10, { gain: -6 })];
    const op = putSoundClips(same, same[0], { gain: -6 });
    expect(op.op === 'putClips' && op.clips.map(c => c.id)).toEqual([1]);
  });
  it('a new clip of the sample starts with its shared sound', () => {
    expect(sharedSound([clip(1, 10, { gain: -3, rev: true })], 10)).toMatchObject({ gain: -3, rev: true, norm: false, pan: 0 });
    expect(sharedSound(clips, 99)).toEqual({});
  });
});
