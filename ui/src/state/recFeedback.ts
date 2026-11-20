// After a recording: say what landed where, select it, and offer to delete it or show its takes
// (#109/#110). The engine lands a take a moment after Stop, so the project is compared with what
// it held when the recording began, on each change, until something new shows up.
import { createEffect, createRoot, on } from 'solid-js';
import { t } from '../lib/i18n';
import { recLanded, recSnapshot, type RecLanded, type RecSnapshot } from '../lib/recLanded';
import { removeTake } from '../lib/comp';
import { commit } from './edit';
import { compById, deleteTake, toggleTakes } from './comp';
import { notify } from './notice';
import { plain, S } from './store';
import { setU, U } from './ui';

/** How long after a recording ends its result may still arrive from the engine. */
const LAND_MS = 4000;

createRoot(() => {
  let before: RecSnapshot | null = null, waiting: { snap: RecSnapshot; until: number } | null = null;
  const recording = () => S.transport.rec && (U.playing || U.patPlaying);
  createEffect(on(recording, r => {
    if (r) { before = recSnapshot(S.project); waiting = null; return; }
    if (before) { waiting = { snap: before, until: performance.now() + LAND_MS }; before = null; check(); }
  }, { defer: true }));
  createEffect(on(() => S.revision, () => check(), { defer: true }));
  function check() {
    if (!waiting) return;
    if (performance.now() > waiting.until) { waiting = null; return; }
    const got = recLanded(waiting.snap, S.project);
    if (!got) return;
    waiting = null;
    announce(got);
  }
});

function trackName(i: number | undefined) { return (i != null && S.project.tracks[i]?.name) || '?'; }

function announce(got: RecLanded) {
  const p = S.project;
  if (got.kind === 'clips') {
    const cs = p.clips.filter(c => got.ids.includes(c.id));
    setU('sel', got.ids);
    const c = cs[0];
    const name = c.kind === 'audio' ? p.sources.find(s => s.id === c.ref)?.name
      : c.kind === 'pat' ? p.patterns.find(x => x.id === c.ref)?.name
      : p.comps?.find(x => x.id === c.ref)?.name;
    const takes = c.kind === 'comp' ? p.comps?.find(x => x.id === c.ref)?.takes.length ?? 0 : 0;
    notify(t(takes > 1 ? 'd.rec.landedTakes' : 'd.rec.landed', { name: name ?? '?', track: trackName(c.track), n: takes }), [
      ...(takes > 1 ? [{ label: t('d.rec.showTakes'), act: () => toggleTakes(c.track, true) }] : []),
      { label: t('d.rec.delete'), danger: true, act: () => {
        const ids = got.ids.filter(id => S.project.clips.some(x => x.id === id));
        const pats = got.patterns.filter(id => S.project.patterns.some(x => x.id === id));
        if (!ids.length) return;
        commit([{ op: 'removeClips', ids }, ...pats.map(id => ({ op: 'removePattern' as const, id }))], t('d.rec.deleteOp'));
      } },
    ]);
  } else if (got.kind === 'takes') {
    const comp = compById(got.comp); if (!comp) return;
    const clip = p.clips.find(c => c.kind === 'comp' && c.ref === comp.id);
    const names = comp.takes.filter(x => got.takes.includes(x.id)).map(x => x.name).join(', ');
    notify(t('d.rec.newTakes', { names, track: trackName(clip?.track) }), [
      ...(clip ? [{ label: t('d.rec.showTakes'), act: () => toggleTakes(clip.track, true) }] : []),
      { label: t('d.rec.delete'), danger: true, act: () => {
        const cur = compById(got.comp); if (!cur) return;
        const gone = got.takes.filter(id => cur.takes.some(x => x.id === id));
        if (gone.length === cur.takes.length) return deleteTake(cur, gone[0]); // every take: the comp goes
        const left = gone.reduce((x, id) => removeTake(x, id), plain(cur));
        commit([{ op: 'putComp', comp: left }], t('d.rec.deleteOp'));
      } },
    ]);
  } else {
    const pt = p.patterns.find(x => x.id === got.pattern); if (!pt) return;
    notify(t('d.rec.notes', { n: got.count, name: pt.name }), [
      { label: t('d.rec.delete'), danger: true, act: () => {
        const cur = S.project.patterns.find(x => x.id === got.pattern);
        // only while the recorded notes are still the last ones (nothing edited since)
        if (!cur || cur.notes.length !== got.from + got.count) return;
        commit([{ op: 'putPattern', pattern: { ...plain(cur), notes: plain(cur.notes.slice(0, got.from)) } }], t('d.rec.deleteOp'));
      } },
    ]);
  }
}
