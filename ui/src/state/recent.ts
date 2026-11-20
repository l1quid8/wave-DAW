// File → Open recent: the projects opened or saved lately (the app keeps the list in its
// settings, newest first). Refreshed at start and after every open or save.
import { createSignal } from 'solid-js';
import { be } from '../api/backend';
import type { RecentProject } from '../api/types';

const [recent, setRecent] = createSignal<RecentProject[]>([]);
export { recent };

export async function refreshRecent() {
  try { setRecent(await be().recentProjects()); } catch { /* the list is a convenience: keep the last one shown */ }
}

/** Takes one project off the list, or (no path) every one. */
export async function forgetRecent(path?: string) {
  try { await be().recentForget(path); } finally { await refreshRecent(); }
}

/** Labels for the menu: a name shared by two entries gets its folder added, so they can be told apart. */
export function recentLabels(list: readonly RecentProject[]): string[] {
  const count = new Map<string, number>();
  for (const r of list) count.set(r.name.toLowerCase(), (count.get(r.name.toLowerCase()) ?? 0) + 1);
  return list.map(r => {
    if ((count.get(r.name.toLowerCase()) ?? 0) < 2) return r.name;
    const folder = r.dir.split(/[\\/]/).filter(Boolean).pop() ?? r.dir;
    return `${r.name} · ${folder}`;
  });
}
