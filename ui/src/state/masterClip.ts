// Master clip latch: did the mix go over 0 dBFS since the user last looked?
//
// The engine mixes in float, so overs inside the mixer are harmless; the master's output is
// where they turn into distortion (a 16/24-bit WAV or an MP3 bounce clips there, and so does the
// live output). Like the clip LED of Logic's or Ableton's master meter it latches: a 30 ms over
// in bar 9 must still be visible after playback has stopped. It clears on click or with another
// project.
import { createSignal } from 'solid-js';
import { fmtPos } from '../lib/format';
import { t } from '../lib/i18n';

/** Full scale: the level a fixed-point export clips at. Exactly 1.0 still fits. */
export const FULL_SCALE = 1;

export interface MasterClip {
  /** Highest peak over full scale since the latch was reset, in dB (> 0). */
  overDb: number;
  /** Position (beats) of the first over since the reset: into the song, or into the pattern. */
  firstBeat: number;
  /** The first over came while the pattern loop played (PAT mode), not the song. */
  inPattern: boolean;
}

const [clip, setClip] = createSignal<MasterClip | null>(null);
let peak = 0;

/** The latched clip, or null while the master has stayed under full scale. */
export const masterClip = clip;

/** Feed one telemetry frame's master peaks (linear, post-fader), the song beat and the pattern
 *  loop's beat (−1 when it is not playing). */
export function noteMasterPeak(l: number, r: number, beat: number, patBeat = -1) {
  const p = Math.max(l, r);
  if (!(p > FULL_SCALE) || !Number.isFinite(p)) return;
  // a tenth of a dB is the precision the readout shows: no store churn below it
  if (peak > 0 && 20 * Math.log10(p / peak) < 0.05) return;
  const prev = peak > 0 ? clip() : null;
  peak = p;
  setClip({
    overDb: 20 * Math.log10(p),
    firstBeat: prev ? prev.firstBeat : patBeat >= 0 ? patBeat : beat,
    inPattern: prev ? prev.inPattern : patBeat >= 0,
  });
}

export function resetMasterClip() {
  peak = 0;
  if (clip()) setClip(null);
}

/** What the master's level / clip indicator says: the level, or how far over and where. */
export function masterClipTip(): string {
  const c = clip();
  if (!c) return t('a.tb.outTip');
  const v = { db: c.overDb.toFixed(1), pos: fmtPos(c.firstBeat) };
  return c.inPattern ? t('a.tb.clipTipPat', v) : t('a.tb.clipTip', v);
}
