// The window layout saved per user (`wave.layout` in localStorage, never in the project) and the
// F6/F7 key logic. Where docked panels go is `lib/dock.ts`.
// Pure: tested in layout.test.ts.
import type { Tool, UiState } from '../state/ui';
import { migrateDock, migrateSizes, parseDock, parseHomes, parseSizes } from './dock';

/** Floating window geometry (px). */
export interface Geo { x: number; y: number; w: number; h: number }

/** Width of a splitter between docked panels (`.vsplit` / `.docksplit`). */
export const SPLIT = 5;
/** The Playlist never gets narrower / lower than this while panels are docked beside / under it. */
export const PLAYLIST_MIN_W = 320, PLAYLIST_MIN_H = 140;

/**
 * F6 / F7 on a docked panel: hidden → show it (and give it the keyboard); shown but the keyboard
 * is elsewhere → give it the keyboard; shown and focused → hide it. A docked panel is never
 * "behind" anything, so the floating windows' bring-to-front step does not apply.
 */
export function dockKeyAction(open: boolean, focused: boolean): 'show' | 'focus' | 'hide' {
  if (!open) return 'show';
  return focused ? 'hide' : 'focus';
}

/** The fields a layout saved before #90 kept the docked panels in. */
const OLD_DOCK_KEYS = ['rackDock', 'rollDock', 'mixDock', 'rackDockW', 'rollDockH', 'mixH'];
const TOOLS_OK: Tool[] = ['draw', 'paint', 'erase', 'mute', 'slice', 'select'];
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
/** Which whole Library sections (STANDARD LIBRARY, KITS, FOLDERS) the user collapsed; `true` = closed. */
const SECS = ['std', 'kits', 'folders'] as const;
const parseSec = (v: unknown): Record<(typeof SECS)[number], boolean | undefined> | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return { std: bool(o.std), kits: bool(o.kits), folders: bool(o.folders) };
};
/** A saved floating window's place, or undefined when anything about it is off (it is clamped on screen when used). */
export function parseGeo(v: unknown): Geo | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const x = num(o.x, -20000, 20000), y = num(o.y, -20000, 20000), w = num(o.w, 100, 20000), h = num(o.h, 100, 20000);
  return x === undefined || y === undefined || w === undefined || h === undefined ? undefined : { x, y, w, h };
}

/** A saved layout as a patch of valid fields only. */
export function parseLayout(raw: string | null): Partial<UiState> {
  let v: Record<string, unknown>;
  try { v = JSON.parse(raw ?? '{}') ?? {}; } catch { return {}; }
  if (typeof v !== 'object' || Array.isArray(v)) return {};
  const p: Partial<UiState> = {
    tool: TOOLS_OK.includes(v.tool as Tool) ? (v.tool as Tool) : undefined,
    snap: num(v.snap, -1, 64), bw: num(v.bw, 4, 1024), follow: bool(v.follow), // 1024: keep in step with actions.BW_MAX
    // a layout saved with the mixer closed opens with it hidden
    mixMin: v.mixOpen === false || v.mixMin === true ? true : bool(v.mixMin),
    headW: num(v.headW, 120, 600), pickW: num(v.pickW, 140, 800), pickOpen: bool(v.pickOpen),
    // 'project' (Patterns and Audio in one tab, before they were split) opens on Patterns
    browserTab: v.browserTab === 'project' ? 'patterns' : v.browserTab === 'patterns' || v.browserTab === 'audio' || v.browserTab === 'library' ? v.browserTab : undefined,
    browserSec: parseSec(v.browserSec),
    rackFloat: parseGeo(v.rackFloat), rollFloat: parseGeo(v.rollFloat), rollMax: bool(v.rollMax),
    mixWin: ((g: Geo | undefined) => g && { ...g, z: 0 })(parseGeo(v.mixFloat)),
    // where the panels are docked; a layout from before panels could go anywhere is translated
    ...(v.dock !== undefined
      ? { dock: parseDock(v.dock), paneSize: parseSizes(v.paneSize), dockHome: parseHomes(v.dockHome) }
      : OLD_DOCK_KEYS.some(k => k in v) ? { dock: migrateDock(v), paneSize: migrateSizes(v) } : {}),
  };
  for (const k of Object.keys(p) as (keyof UiState)[]) if (p[k] === undefined) delete p[k];
  return p;
}
