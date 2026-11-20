//! Hosts a VST3 instrument, holds one note and measures what comes out: level, the
//! noise between the note's harmonics, and the silence after the release. Writes the
//! render as a WAV to listen to.
//!
//! `cargo run -p wave-vst3 --example instrument_probe -- <bundle.vst3 | name substring> [key] [out.wav]`

use std::f64::consts::TAU;
use std::path::Path;

use wave_engine::{InstEvent, InstMsg, ProcessCtx};

const SR: f32 = 48_000.0;
const BLOCK: usize = 256;

fn main() {
    if wave_vst3::run_scan_worker_if_requested() {
        return;
    }
    let mut args = std::env::args().skip(1);
    let want = args.next().expect("usage: instrument_probe <bundle | name> [key] [out.wav]");
    let key: u8 = args.next().and_then(|s| s.parse().ok()).unwrap_or(57);
    let out = args.next();
    let list = if Path::new(&want).exists() {
        let root = Path::new(&want).parent().unwrap().to_path_buf();
        wave_vst3::testing::scan_instrument_roots(&[root], None)
    } else {
        wave_vst3::scan_instruments(false)
    };
    let info = list
        .iter()
        .find(|p| Path::new(&p.path) == Path::new(&want) || p.name.to_lowercase().contains(&want.to_lowercase()))
        .unwrap_or_else(|| panic!("no instrument like {want:?} in {:?}", list.iter().map(|p| &p.name).collect::<Vec<_>>()));
    println!("hosting {} by {}", info.name, info.vendor);
    let (mut inst, _h) = wave_vst3::instantiate_instrument(&info.path, &info.cid, None, SR, BLOCK, false).expect("instantiates");

    let ctx = ProcessCtx { sample_rate: SR, bpm: 120.0, beat: 0.0, playing: false };
    let (mut l, mut r) = (vec![0f32; BLOCK], vec![0f32; BLOCK]);
    let mut all: Vec<f32> = vec![];
    let blocks = |secs: f32| (secs * SR / BLOCK as f32) as usize;
    // silence, a held note, its release
    for b in 0..blocks(0.5) + blocks(2.0) + blocks(1.5) {
        let ev: Vec<InstEvent> = if b == blocks(0.5) {
            vec![InstEvent { offset: 0, msg: InstMsg::NoteOn { key, vel: 0.8, id: 1 } }]
        } else if b == blocks(2.5) {
            vec![InstEvent { offset: 0, msg: InstMsg::NoteOff { key, id: 1 } }]
        } else {
            vec![]
        };
        inst.process(&ev, &mut l, &mut r, &ctx);
        for i in 0..BLOCK {
            all.push(l[i]);
            all.push(r[i]);
        }
    }
    let mono: Vec<f64> = all.chunks(2).map(|f| (f[0] as f64 + f[1] as f64) * 0.5).collect();
    let s = |secs: f32| (secs * SR) as usize;
    let rms = |x: &[f64]| (x.iter().map(|v| v * v).sum::<f64>() / x.len().max(1) as f64).sqrt();
    let db = |v: f64| 20.0 * v.max(1e-12).log10();
    println!("before the note: {:.1} dBFS rms", db(rms(&mono[..s(0.45)])));
    println!(
        "held note:       {:.1} dBFS rms, peak {:.1} dBFS",
        db(rms(&mono[s(1.0)..s(2.4)])),
        db(mono.iter().fold(0.0f64, |m, v| m.max(v.abs())))
    );
    println!("1 s after release: {:.1} dBFS rms", db(rms(&mono[s(3.5)..s(3.95)])));
    println!("left/right differ by up to {:.2e}", all.chunks(2).fold(0f32, |m, f| m.max((f[0] - f[1]).abs())));

    // a held note is periodic: what is not at a harmonic of the note is noise (or aliasing)
    let f0 = 440.0 * 2f64.powf((key as f64 - 69.0) / 12.0);
    let n = 16384;
    let x = &mono[s(1.2)..s(1.2) + n];
    println!("harmonics vs. everything else (noise, aliasing): {:.1} dB", purity(x, f0));
    // the same measure of an ideal band-limited saw: the method's own floor
    let ideal: Vec<f64> = (0..n)
        .map(|i| {
            let t = i as f64 / SR as f64;
            (1..).take_while(|h| *h as f64 * f0 < SR as f64 / 2.0).map(|h| (TAU * h as f64 * f0 * t).sin() / h as f64).sum::<f64>() * 0.1
        })
        .collect();
    println!("  (an ideal band-limited saw measures {:.1} dB)", purity(&ideal, f0));
    if let Some(out) = out {
        wave_engine::sources::write_wav(Path::new(&out), &all, SR as u32).expect("writes");
        println!("wrote {out}");
    }
}

/// Power at the harmonics of `f0` against all the rest, in dB.
fn purity(x: &[f64], f0: f64) -> f64 {
    let n = x.len();
    let (mut harm, mut rest) = (0.0, 0.0);
    let bin_hz = SR as f64 / n as f64;
    for k in 1..n / 2 {
        let (mut re, mut im) = (0.0, 0.0);
        let w = TAU * k as f64 / n as f64;
        for (i, v) in x.iter().enumerate() {
            let hann = 0.5 - 0.5 * (TAU * i as f64 / n as f64).cos();
            re += v * hann * (w * i as f64).cos();
            im -= v * hann * (w * i as f64).sin();
        }
        let p = re * re + im * im;
        let f = k as f64 * bin_hz;
        let h = (f / f0).round();
        if h >= 1.0 && (f - h * f0).abs() <= 3.0 * bin_hz {
            harm += p;
        } else {
            rest += p;
        }
    }
    10.0 * (harm / rest.max(1e-30)).log10()
}
