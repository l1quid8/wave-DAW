// The Channel Rack's filter groups (FL Studio's): a channel may belong to one named group; the
// rack shows every channel, one group, or the unsorted ones. A group exists while a channel is in it.
import type { Channel, Id } from '../api/types';

/** What the rack shows: every channel (`null`), the unsorted ones (`''`), or one group by name. */
export type RackFilter = string | null;

/** The groups in use, in the order their first channel appears in the rack, each with its channel count. */
export function rackGroups(chans: readonly Channel[]): { name: string; n: number }[] {
  const out = new Map<string, number>();
  for (const c of chans) if (c.group) out.set(c.group, (out.get(c.group) ?? 0) + 1);
  return [...out].map(([name, n]) => ({ name, n }));
}

/** Whether channel `c` shows under `f`. */
export const inFilter = (c: Channel, f: RackFilter) => f == null || (f === '' ? !c.group : c.group === f);

/** A filter that matches no channel any more (its last channel left the group) falls back to every channel. */
export function liveFilter(chans: readonly Channel[], f: RackFilter): RackFilter {
  if (f == null) return null;
  return chans.some(c => inFilter(c, f)) ? f : null;
}

/** A group name as typed: trimmed, at most 40 characters; empty = no group. */
export const cleanGroup = (v: string): string | undefined => {
  const g = [...v.trim()].slice(0, 40).join('');
  return g || undefined;
};

/**
 * Where a channel moved to row `to` of a filtered rack lands in the full channel list: right
 * before the shown channel that now follows it, else right after the one before it.
 * `shown`: the filtered rack's ids in order; `all`: every channel id in order.
 */
export function fullIndexFor(all: readonly Id[], shown: readonly Id[], id: Id, to: number): number {
  const order = shown.filter(x => x !== id);
  order.splice(to, 0, id);
  const rest = all.filter(x => x !== id);
  const next = order[to + 1], prev = order[to - 1];
  if (next != null) return rest.indexOf(next);
  if (prev != null) return rest.indexOf(prev) + 1;
  return rest.length;
}
