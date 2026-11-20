// The pitch editor's "Copy notes": a vocal's detected (and edited) notes as piano roll notes, so a
// melody that was sung can be played by an instrument (FL's NewTone "Send to piano roll", Melodyne's
// "Copy as MIDI"). Pure: the editor hands in what it draws, the piano roll pastes what comes out.
import type { Note } from '../api/types';

/** A pitch editor note: source seconds, the pitch it sounds at (MIDI, fractional), its level 0..1. */
export interface SungNote { start: number; end: number; pitch: number; level: number }

/** Where the clip plays its source: `start` beat on the song, from source second `t0`, `spbSrc` source seconds per beat. */
export interface ClipTiming { start: number; t0: number; t1: number; spbSrc: number }

const STEPS_PER_BEAT = 4, STEPS_PER_BAR = 16;
/** Shortest pasted note, steps (the engine's `MIN_NOTE_STEPS`). */
const MIN_STEPS = 0.25;
/** Step positions keep 1/1000 of a step (sub-millisecond at any tempo), so floats stay clean. */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * The sung notes as pattern notes (channel `ch` 0: the paste puts them on its channel).
 * - Time: source seconds → song steps through the clip (offset, stretch, tempo), **as sung**:
 *   no grid. A voice is rarely on the grid, and rounding moves notes up to half a step and
 *   collapses short ones; the Piano roll's Quantize snaps the pasted (selected) notes when wanted.
 *   Only what the clip plays is kept; a note gets at least a quarter step.
 * - Steps count from the bar the first note is in, so the melody keeps its place in the bar.
 * - Key: the sounding pitch rounded to a semitone (pitch edits included).
 * - Velocity: the level relative to the loudest copied note (0.35..1), so accents survive.
 * - The voice is monophonic: a note still sounding when the next starts ends there.
 * `songStep` is where the first bar starts on the song, in steps (to paste in place).
 */
export function sungToPattern(sung: readonly SungNote[], clip: ClipTiming): { notes: Note[]; songStep: number } {
  const toStep = (sec: number) => (clip.start + (sec - clip.t0) / clip.spbSrc) * STEPS_PER_BEAT;
  const loud = Math.max(1e-6, ...sung.map(n => n.level));
  const out: Note[] = [];
  for (const n of [...sung].sort((a, b) => a.start - b.start)) {
    const a = Math.max(n.start, clip.t0), b = Math.min(n.end, clip.t1);
    if (!(b > a) || !Number.isFinite(n.pitch)) continue;
    const s = r3(toStep(a)), e = r3(toStep(b));
    const p = Math.min(127, Math.max(0, Math.round(n.pitch)));
    const v = Math.round((0.35 + 0.65 * Math.min(1, Math.max(0, n.level / loud))) * 100) / 100;
    const prev = out[out.length - 1];
    if (prev && prev.step + prev.len > s) {
      prev.len = r3(s - prev.step);
      if (prev.len < MIN_STEPS) out.pop();
    }
    out.push({ ch: 0, step: s, len: Math.max(MIN_STEPS, r3(e - s)), p, v });
  }
  if (!out.length) return { notes: [], songStep: 0 };
  const bar = Math.floor(out[0].step / STEPS_PER_BAR) * STEPS_PER_BAR;
  return { notes: out.map(n => ({ ...n, step: r3(n.step - bar) })), songStep: bar };
}
