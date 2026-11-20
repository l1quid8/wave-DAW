import type { Project } from '../api/types';

/**
 * Where a recording starting at `from` goes (the engine's `rec_target`): the track armed with
 * "Record into this track", else (as in FL) the first track with nothing on it from `from` to
 * `until` (the loop end, or for good), else a new track added below the others (`'new'`).
 */
export function recTarget(p: Project, from: number, until = Infinity): number | 'new' {
  const armed = p.tracks.findIndex(t => t.arm);
  if (armed >= 0) return armed;
  const i = freeTrack(p, from, until);
  return i < 0 ? 'new' : i;
}

/** The first track with no clip between beats `from` and `until`, or −1. */
export function freeTrack(p: Project, from: number, until: number): number {
  return p.tracks.findIndex((_, i) => !p.clips.some(c => c.track === i && c.start < until - 1e-9 && c.start + c.len > from + 1e-9));
}

/** The loop end a recording from `from` cycles to (recording always loops over a set loop), else Infinity. */
export function recUntil(p: Project): number {
  return p.loop && p.loop.b > p.loop.a ? p.loop.b : Infinity;
}

/** Removes track `id` if no clip is on it (the tracks below move up). True when it did. */
export function dropEmptyTrack(p: Project, id: number): boolean {
  const i = p.tracks.findIndex(t => t.id === id);
  if (i < 0 || p.clips.some(c => c.track === i)) return false;
  p.tracks.splice(i, 1);
  for (const c of p.clips) if (c.track > i) c.track--;
  return true;
}
