//! Spotify Basic Pitch (ICASSP 2022, Apache-2.0) as a note transcriber for the benchmark.
//!
//! Follows the reference Python package `basic_pitch` (inference.py, note_creation.py,
//! constants.py): 22050 Hz mono audio cut into 43844-sample windows that overlap by 30 model
//! frames, the half-overlap trimmed from both ends of every window's output, and
//! `output_to_notes_polyphonic` with the library defaults (onset 0.5, frame 0.3, 11-frame minimum,
//! inferred onsets, melodia trick, energy tolerance 11). Pitch bends (the contour head) are not
//! used: the benchmark scores integer MIDI notes.

use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

use crate::transcribe::N;

const SR: f32 = 22050.0;
const FFT_HOP: usize = 256;
/// ANNOTATIONS_FPS = 22050 // 256
const FPS: usize = 86;
/// ANNOT_N_FRAMES = ANNOTATIONS_FPS * AUDIO_WINDOW_LENGTH (2 s)
const ANNOT_N_FRAMES: usize = FPS * 2;
/// AUDIO_N_SAMPLES = 22050 * 2 - 256
const AUDIO_N_SAMPLES: usize = 22050 * 2 - FFT_HOP;
const OVERLAP_FRAMES: usize = 30;
const OVERLAP_LEN: usize = OVERLAP_FRAMES * FFT_HOP;
const HOP: usize = AUDIO_N_SAMPLES - OVERLAP_LEN;
const BINS: usize = 88;
const MIDI_OFFSET: usize = 21;
const MAX_FREQ_IDX: usize = 87;
const MAGIC_ALIGNMENT_OFFSET: f64 = 0.0018;

const ONSET_THRESH: f32 = 0.5;
const FRAME_THRESH: f32 = 0.3;
/// round(127.7 ms * 22050 / 256 / 1000)
const MIN_NOTE_LEN: usize = 11;
const ENERGY_TOL: usize = 11;

#[derive(Clone, Copy, Debug)]
pub struct Note {
    pub on: f64,
    pub off: f64,
    pub pitch: u8,
    pub amp: f32,
}

pub struct BasicPitch {
    session: Mutex<ort::session::Session>,
    _env: ort::environment::Environment,
    note: String,
    onset: String,
}

impl BasicPitch {
    pub fn load(model: &Path) -> Result<Self, String> {
        let fail = |e: String| format!("Basic Pitch model {}: {e}", model.display());
        let env = wave_rmvpe::ort_env().map_err(fail)?;
        let threads = std::thread::available_parallelism().map(|n| n.get().min(8)).unwrap_or(4);
        let mut b = ort::session::Session::builder(&env)
            .map_err(|e| fail(e.to_string()))?
            .with_intra_threads(threads)
            .map_err(|e| fail(e.to_string()))?;
        let session = b.commit_from_file(model).map_err(|e| fail(e.to_string()))?;
        let ins: Vec<String> = session.inputs().iter().map(|o| o.name().to_string()).collect();
        let outs: Vec<String> = session.outputs().iter().map(|o| o.name().to_string()).collect();
        eprintln!("basic-pitch: inputs {ins:?}, outputs {outs:?}");
        if ins.len() != 1 {
            return Err(fail(format!("expected one input, got {ins:?}")));
        }
        // inference.py maps StatefulPartitionedCall:1 → note, :2 → onset, :0 → contour
        let pick = |suffix: &str| {
            outs.iter().find(|n| n.ends_with(suffix)).cloned().ok_or_else(|| fail(format!("no output *{suffix} in {outs:?}")))
        };
        let (note, onset) = (pick(":1")?, pick(":2")?);
        Ok(Self { session: Mutex::new(session), _env: env, note, onset })
    }

    /// Unwrapped (note, onset) activations, `BINS` per frame, as `run_inference` returns them.
    pub fn infer(&self, mono: &[f32], sr: f32) -> Result<(Vec<f32>, Vec<f32>), String> {
        let x = wave_rmvpe::resample(mono, sr, SR);
        let original_len = x.len();
        let mut padded = vec![0f32; OVERLAP_LEN / 2];
        padded.extend_from_slice(&x);
        let n_olap = OVERLAP_FRAMES / 2;
        let (mut note, mut onset) = (vec![], vec![]);
        let mut sess = self.session.lock().map_err(|_| "Basic Pitch session poisoned".to_string())?;
        for start in (0..padded.len()).step_by(HOP) {
            let mut w = padded[start..(start + AUDIO_N_SAMPLES).min(padded.len())].to_vec();
            w.resize(AUDIO_N_SAMPLES, 0.0);
            let input = ort::value::Tensor::from_array(([1usize, AUDIO_N_SAMPLES, 1], w)).map_err(|e| e.to_string())?;
            let res = sess.run(ort::inputs![input]).map_err(|e| format!("Basic Pitch inference failed: {e}"))?;
            for (name, dst) in [(&self.note, &mut note), (&self.onset, &mut onset)] {
                let (shape, v) = res[name.as_str()].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
                let t = shape.get(1).copied().unwrap_or(0) as usize;
                if shape.len() != 3 || shape[2] as usize != BINS || t <= 2 * n_olap {
                    return Err(format!("unexpected Basic Pitch output shape {shape:?}"));
                }
                dst.extend_from_slice(&v[n_olap * BINS..(t - n_olap) * BINS]);
            }
        }
        // unwrap_output: keep int(original_length / hop_size * n_frames_per_window) frames
        let keep = (original_len as f64 / HOP as f64 * (ANNOT_N_FRAMES - OVERLAP_FRAMES) as f64) as usize;
        let keep = keep.min(note.len() / BINS) * BINS;
        note.truncate(keep);
        onset.truncate(keep);
        Ok((note, onset))
    }

    /// Note events with the library's default decoding.
    pub fn notes(&self, mono: &[f32], sr: f32) -> Result<Vec<Note>, String> {
        let (frames, onsets) = self.infer(mono, sr)?;
        let n = frames.len() / BINS;
        let mut notes: Vec<Note> = decode(&frames, &onsets, n)
            .into_iter()
            .map(|(s, e, p, amp)| Note { on: frame_time(s), off: frame_time(e), pitch: p as u8, amp })
            .collect();
        notes.sort_by(|a, b| a.on.total_cmp(&b.on).then(a.pitch.cmp(&b.pitch)));
        Ok(notes)
    }
}

/// `model_frames_to_time` for one frame index.
pub fn frame_time(f: usize) -> f64 {
    let hop_s = FFT_HOP as f64 / SR as f64;
    let window_offset = hop_s * (ANNOT_N_FRAMES as f64 - AUDIO_N_SAMPLES as f64 / FFT_HOP as f64) + MAGIC_ALIGNMENT_OFFSET;
    f as f64 * hop_s - window_offset * (f / ANNOT_N_FRAMES) as f64
}

/// `get_infered_onsets` with n_diff = 2.
fn infer_onsets(onsets: &[f32], frames: &[f32], n: usize) -> Vec<f32> {
    let mut diff = vec![0f32; n * BINS];
    for t in 2..n {
        for f in 0..BINS {
            let cur = frames[t * BINS + f];
            let d = (cur - frames[(t - 1) * BINS + f]).min(cur - frames[(t - 2) * BINS + f]);
            diff[t * BINS + f] = d.max(0.0);
        }
    }
    let max_on = onsets.iter().copied().fold(f32::MIN, f32::max);
    let max_d = diff.iter().copied().fold(0f32, f32::max);
    if max_d <= 0.0 {
        return onsets.to_vec();
    }
    onsets.iter().zip(&diff).map(|(&o, &d)| o.max(max_on * d / max_d)).collect()
}

fn clear(rem: &mut [f32], t: usize, f: usize) {
    rem[t * BINS + f] = 0.0;
    if f < MAX_FREQ_IDX {
        rem[t * BINS + f + 1] = 0.0;
    }
    if f > 0 {
        rem[t * BINS + f - 1] = 0.0;
    }
}

fn mean(frames: &[f32], f: usize, a: usize, b: usize) -> f32 {
    (a..b).map(|t| frames[t * BINS + f]).sum::<f32>() / (b - a).max(1) as f32
}

/// `output_to_notes_polyphonic`: (start frame, end frame, MIDI pitch, amplitude).
pub fn decode(frames: &[f32], onsets: &[f32], n: usize) -> Vec<(usize, usize, usize, f32)> {
    let mut out = vec![];
    if n < 2 {
        return out;
    }
    let onsets = infer_onsets(onsets, frames, n);
    // scipy.signal.argrelmax along time (strict, edges excluded), thresholded, newest first
    let mut peaks = vec![];
    for t in 1..n - 1 {
        for f in 0..BINS {
            let v = onsets[t * BINS + f];
            if v > onsets[(t - 1) * BINS + f] && v > onsets[(t + 1) * BINS + f] && v >= ONSET_THRESH {
                peaks.push((t, f));
            }
        }
    }
    let mut rem = frames.to_vec();
    for &(t0, f) in peaks.iter().rev() {
        if t0 >= n - 1 {
            continue;
        }
        let (mut i, mut k) = (t0 + 1, 0);
        while i < n - 1 && k < ENERGY_TOL {
            if rem[i * BINS + f] < FRAME_THRESH {
                k += 1;
            } else {
                k = 0;
            }
            i += 1;
        }
        i -= k;
        if i - t0 <= MIN_NOTE_LEN {
            continue;
        }
        for t in t0..i {
            clear(&mut rem, t, f);
        }
        out.push((t0, i, f + MIDI_OFFSET, mean(frames, f, t0, i)));
    }
    // melodia trick: grow notes from the strongest leftover energy in both directions
    loop {
        let (mut best, mut at) = (f32::MIN, 0usize);
        for (j, &v) in rem.iter().enumerate() {
            if v > best {
                best = v;
                at = j;
            }
        }
        if best <= FRAME_THRESH {
            break;
        }
        let (i_mid, f) = (at / BINS, at % BINS);
        rem[at] = 0.0;
        let (mut i, mut k) = (i_mid as isize + 1, 0usize);
        while i < n as isize - 1 && k < ENERGY_TOL {
            if rem[i as usize * BINS + f] < FRAME_THRESH {
                k += 1;
            } else {
                k = 0;
            }
            clear(&mut rem, i as usize, f);
            i += 1;
        }
        let i_end = i - 1 - k as isize;
        let (mut i, mut k) = (i_mid as isize - 1, 0usize);
        while i > 0 && k < ENERGY_TOL {
            if rem[i as usize * BINS + f] < FRAME_THRESH {
                k += 1;
            } else {
                k = 0;
            }
            clear(&mut rem, i as usize, f);
            i -= 1;
        }
        let i_start = i + 1 + k as isize;
        if i_end - i_start <= MIN_NOTE_LEN as isize {
            continue;
        }
        let (s, e) = (i_start as usize, i_end as usize);
        out.push((s, e, f + MIDI_OFFSET, mean(frames, f, s, e)));
    }
    out
}

/// Monophonic reduction: louder notes claim their time span first; a quieter overlapping note
/// keeps only its longest uncovered stretch, and is dropped if that is shorter than the decoder's
/// minimum note length.
pub fn monophonic(notes: &[Note]) -> Vec<Note> {
    let min_len = (MIN_NOTE_LEN + 1) as f64 * FFT_HOP as f64 / SR as f64;
    let mut order: Vec<&Note> = notes.iter().collect();
    order.sort_by(|a, b| b.amp.total_cmp(&a.amp));
    let mut kept: Vec<Note> = vec![];
    for n in order {
        // free stretches of [on, off) not covered by kept notes
        let mut free = vec![(n.on, n.off)];
        for k in &kept {
            free = free
                .into_iter()
                .flat_map(|(a, b)| {
                    if k.off <= a || k.on >= b {
                        vec![(a, b)]
                    } else {
                        [(a, k.on), (k.off, b)].into_iter().filter(|(x, y)| y > x).collect()
                    }
                })
                .collect();
        }
        if let Some(&(a, b)) = free.iter().max_by(|x, y| (x.1 - x.0).total_cmp(&(y.1 - y.0))) {
            if b - a >= min_len - 1e-9 {
                kept.push(Note { on: a, off: b, ..*n });
            }
        }
    }
    kept.sort_by(|a, b| a.on.total_cmp(&b.on));
    kept
}

/// Basic Pitch in a child process (`tune-bench basic-pitch-worker --model PATH`): ONNX Runtime
/// allows one environment per process and `wave_rmvpe` keeps its own private one, so the two
/// models cannot share this process. Protocol over stdin/stdout, little endian: request
/// `u32 n, f32 sr, n × f32`; reply `u32 count, count × (f64 on, f64 off, u32 pitch, f32 amp)`.
pub struct Worker {
    io: Mutex<(Child, ChildStdin, BufReader<ChildStdout>)>,
}

impl Worker {
    pub fn spawn(model: &Path) -> Result<Self, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut child = Command::new(exe)
            .args(["basic-pitch-worker", "--model"])
            .arg(model)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("Basic Pitch worker: {e}"))?;
        let stdin = child.stdin.take().ok_or("Basic Pitch worker has no stdin")?;
        let stdout = BufReader::new(child.stdout.take().ok_or("Basic Pitch worker has no stdout")?);
        let w = Self { io: Mutex::new((child, stdin, stdout)) };
        // fail now, not on the first recording, when the model does not load
        w.notes(&[0.0; 22050], SR)?;
        Ok(w)
    }

    pub fn notes(&self, mono: &[f32], sr: f32) -> Result<Vec<Note>, String> {
        let mut g = self.io.lock().map_err(|_| "Basic Pitch worker poisoned".to_string())?;
        let (_, tx, rx) = &mut *g;
        let fail = |e: std::io::Error| format!("Basic Pitch worker: {e}");
        let mut req = Vec::with_capacity(8 + mono.len() * 4);
        req.extend_from_slice(&(mono.len() as u32).to_le_bytes());
        req.extend_from_slice(&sr.to_le_bytes());
        mono.iter().for_each(|x| req.extend_from_slice(&x.to_le_bytes()));
        tx.write_all(&req).and_then(|_| tx.flush()).map_err(fail)?;
        let count = u32::from_le_bytes(read::<4>(rx).map_err(fail)?) as usize;
        (0..count)
            .map(|_| {
                Ok(Note {
                    on: f64::from_le_bytes(read::<8>(rx)?),
                    off: f64::from_le_bytes(read::<8>(rx)?),
                    pitch: u32::from_le_bytes(read::<4>(rx)?) as u8,
                    amp: f32::from_le_bytes(read::<4>(rx)?),
                })
            })
            .collect::<std::io::Result<Vec<Note>>>()
            .map_err(fail)
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        if let Ok(g) = self.io.get_mut() {
            let _ = g.0.kill();
            let _ = g.0.wait();
        }
    }
}

fn read<const K: usize>(r: &mut impl Read) -> std::io::Result<[u8; K]> {
    let mut b = [0u8; K];
    r.read_exact(&mut b)?;
    Ok(b)
}

/// The worker side of [`Worker`]: serves requests until stdin closes.
pub fn serve(model: &Path) -> Result<(), String> {
    let bp = BasicPitch::load(model)?;
    let (mut rx, mut tx) = (BufReader::new(std::io::stdin().lock()), BufWriter::new(std::io::stdout().lock()));
    loop {
        let n = match read::<4>(&mut rx) {
            Ok(b) => u32::from_le_bytes(b) as usize,
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(e) => return Err(e.to_string()),
        };
        let sr = f32::from_le_bytes(read::<4>(&mut rx).map_err(|e| e.to_string())?);
        let mut raw = vec![0u8; n * 4];
        rx.read_exact(&mut raw).map_err(|e| e.to_string())?;
        let x: Vec<f32> = raw.as_chunks::<4>().0.iter().map(|c| f32::from_le_bytes(*c)).collect();
        let notes = bp.notes(&x, sr)?;
        let mut out = (notes.len() as u32).to_le_bytes().to_vec();
        for n in &notes {
            out.extend_from_slice(&n.on.to_le_bytes());
            out.extend_from_slice(&n.off.to_le_bytes());
            out.extend_from_slice(&(n.pitch as u32).to_le_bytes());
            out.extend_from_slice(&n.amp.to_le_bytes());
        }
        tx.write_all(&out).and_then(|_| tx.flush()).map_err(|e| e.to_string())?;
    }
}

pub fn to_n(notes: &[Note]) -> Vec<N> {
    notes.iter().map(|n| N { on: n.on, off: n.off, p: n.pitch as f32 }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A C4-E4-G4-C5 arpeggio of harmonic tones (0.5 s each, 0.1 s gaps) comes back at those
    /// pitches and times. Needs the model: BASIC_PITCH_MODEL=path/to/nmp.onnx cargo test -- --ignored
    #[test]
    #[ignore]
    fn arpeggio() {
        let model = std::env::var("BASIC_PITCH_MODEL").expect("BASIC_PITCH_MODEL");
        let bp = BasicPitch::load(Path::new(&model)).unwrap();
        let sr = 44100.0f32;
        let pitches = [60u8, 64, 67, 72];
        let mut x = vec![0f32; (sr * 0.3) as usize];
        for &p in &pitches {
            let hz = 440.0 * 2f32.powf((p as f32 - 69.0) / 12.0);
            let n = (sr * 0.5) as usize;
            for i in 0..n {
                let t = i as f32 / sr;
                let env = (i.min(n - i) as f32 / (0.01 * sr)).min(1.0);
                let v: f32 = (1..=4).map(|h| (std::f32::consts::TAU * hz * h as f32 * t).sin() / h as f32).sum();
                x.push(0.3 * env * v);
            }
            x.extend(std::iter::repeat_n(0.0, (sr * 0.1) as usize));
        }
        let notes = bp.notes(&x, sr).unwrap();
        let mono = monophonic(&notes);
        eprintln!("{notes:?}");
        assert_eq!(mono.iter().map(|n| n.pitch).collect::<Vec<_>>(), pitches);
        for (k, n) in mono.iter().enumerate() {
            let on = 0.3 + 0.6 * k as f64;
            assert!((n.on - on).abs() < 0.05, "onset {} vs {on}", n.on);
            assert!((n.off - (on + 0.5)).abs() < 0.08, "offset {} vs {}", n.off, on + 0.5);
        }
    }
}
