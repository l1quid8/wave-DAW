import type { Id, Project } from '../api/types';

/** What the project held when a recording started (to tell what the recording added). */
export interface RecSnapshot { clips: Set<Id>; takes: Map<Id, Set<Id>>; notes: Map<Id, number>; patterns: Set<Id> }

/** What a recording added: new clips (a take, a MIDI take), takes of a comp it was recorded
 *  over, or notes added to a pattern (PAT mode). */
export type RecLanded =
  | { kind: 'clips'; ids: Id[]; patterns: Id[] }
  | { kind: 'takes'; comp: Id; takes: Id[] }
  | { kind: 'notes'; pattern: Id; from: number; count: number };

export function recSnapshot(p: Project): RecSnapshot {
  return {
    clips: new Set(p.clips.map(c => c.id)),
    takes: new Map((p.comps ?? []).map(c => [c.id, new Set(c.takes.map(t => t.id))])),
    notes: new Map(p.patterns.map(x => [x.id, x.notes.length])),
    patterns: new Set(p.patterns.map(x => x.id)),
  };
}

/** What `after` holds that `before` did not, as one landing (the first kind found), or null. */
export function recLanded(before: RecSnapshot, after: Project): RecLanded | null {
  const ids = after.clips.filter(c => !before.clips.has(c.id) && (c.kind === 'audio' || c.kind === 'pat' || c.kind === 'comp')).map(c => c.id);
  if (ids.length) return { kind: 'clips', ids, patterns: after.patterns.filter(x => !before.patterns.has(x.id)).map(x => x.id) };
  for (const c of after.comps ?? []) {
    const old = before.takes.get(c.id); if (!old) continue;
    const takes = c.takes.filter(t => !old.has(t.id)).map(t => t.id);
    if (takes.length) return { kind: 'takes', comp: c.id, takes };
  }
  for (const x of after.patterns) {
    const n = before.notes.get(x.id);
    if (n != null && x.notes.length > n) return { kind: 'notes', pattern: x.id, from: n, count: x.notes.length - n };
  }
  return null;
}
