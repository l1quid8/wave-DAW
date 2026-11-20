import { describe, expect, it } from 'vitest';
import {
  defaultDock, defaultHomes, dockGuides, edgeTarget, findPane, fitStrips, guideAt, homeOf, parseDock, placePane, removePane, splitShares,
  type DockLayout, type Guide,
} from './dock';

const L = (l: Partial<DockLayout>): DockLayout => ({ left: [], right: [], bottom: [], ...l });
const one = (id: 'rack' | 'roll' | 'mix', share = 1) => ({ id, share });

describe('placing panels', () => {
  it('a new strip beside the Playlist or outside the others', () => {
    const l = L({ bottom: [[one('mix')]] });
    expect(placePane(l, 'roll', { kind: 'strip', edge: 'bottom', at: 0 }).bottom).toEqual([[one('roll')], [one('mix')]]);
    expect(placePane(l, 'roll', { kind: 'strip', edge: 'bottom', at: 9 }).bottom).toEqual([[one('mix')], [one('roll')]]);
    expect(placePane(l, 'rack', { kind: 'strip', edge: 'right', at: 0 }).right).toEqual([[one('rack')]]);
  });
  it('joining a strip: side by side / stacked, taking an average share', () => {
    const l = L({ bottom: [[one('mix', 3)]] });
    expect(placePane(l, 'roll', { kind: 'join', edge: 'bottom', strip: 0, at: 0 }).bottom).toEqual([[one('roll', 3), one('mix', 3)]]);
    expect(placePane(l, 'roll', { kind: 'join', edge: 'bottom', strip: 0, at: 1 }).bottom).toEqual([[one('mix', 3), one('roll', 3)]]);
  });
  it('a docked panel moves: it leaves its old place, and a strip it empties goes', () => {
    const l = L({ left: [[one('rack')]], bottom: [[one('roll')], [one('mix')]] });
    const n = placePane(l, 'rack', { kind: 'join', edge: 'bottom', strip: 1, at: 1 });
    expect(n).toEqual(L({ bottom: [[one('roll')], [one('mix'), one('rack')]] }));
    expect(findPane(n, 'rack')).toEqual({ edge: 'bottom', strip: 1, at: 1 });
    // the input is not changed
    expect(l.left).toEqual([[one('rack')]]);
  });
  it('a join into a strip that is gone makes a new strip instead', () => {
    expect(placePane(L({}), 'mix', { kind: 'join', edge: 'left', strip: 3, at: 0 }).left).toEqual([[one('mix')]]);
  });
  it('removing keeps the rest in order', () => {
    const l = L({ right: [[one('roll'), one('mix')], [one('rack')]] });
    expect(removePane(l, 'roll').right).toEqual([[one('mix')], [one('rack')]]);
    expect(removePane(l, 'rack').right).toEqual([[one('roll'), one('mix')]]);
  });
  it('the dock button goes back to the edge and side it came from', () => {
    const l = L({ bottom: [[one('roll')], [one('mix')]] });
    const h = homeOf(l, 'mix', defaultHomes().mix);
    expect(h).toEqual({ edge: 'bottom', outer: true });
    expect(homeOf(l, 'roll', defaultHomes().roll)).toEqual({ edge: 'bottom', outer: false });
    // floated, then docked home: outside the roll again
    const f = removePane(l, 'mix');
    expect(placePane(f, 'mix', edgeTarget(f, 'mix', h.edge, h.outer)).bottom).toEqual(l.bottom);
    // a floating panel keeps its home
    expect(homeOf(f, 'mix', h)).toBe(h);
  });
  it('first launch: only the Mixer is docked, at the bottom', () => {
    expect(defaultDock()).toEqual(L({ bottom: [[one('mix')]] }));
  });
});

describe('fitStrips', () => {
  it('gives each strip what it wants when it fits, never under its minimum', () => {
    expect(fitStrips([500, 300], [480, 170], 2000, 320)).toEqual([500, 300]);
    expect(fitStrips([100], [480], 2000, 320)).toEqual([480]);
  });
  it('is the wanted size until the area is measured', () => {
    expect(fitStrips([700], [480], 0, 320)).toEqual([700]);
    expect(fitStrips([100], [480], NaN, 320)).toEqual([480]);
  });
  it('leaves the Playlist its minimum: each strip gives up the same part of what it has above its minimum', () => {
    const px = fitStrips([800, 600], [480, 300], 1400, 320);
    expect(px[0] + px[1]).toBeLessThanOrEqual(1400 - 320);
    expect(px[0]).toBeGreaterThanOrEqual(480); expect(px[1]).toBeGreaterThanOrEqual(300);
    expect((px[0] - 480) / (800 - 480)).toBeCloseTo((px[1] - 300) / (600 - 300), 1);
  });
  it('one strip: like the old single docked panel', () => {
    expect(fitStrips([1500], [480], 1000, 320)).toEqual([680]);
    expect(fitStrips([640], [480], 780, 320)).toEqual([460]);
  });
  it('never overflows when even the minimums do not fit: they give way alike, down to half', () => {
    // 1280×720 at 150 % UI scale: ~853 px wide, browser 220 and splitters
    const room = 853 - 220 - 10;
    const px = fitStrips([640, 500], [480, 420], room, 320);
    const sum = px[0] + px[1];
    expect(sum).toBeLessThanOrEqual(room);
    expect(sum).toBeGreaterThanOrEqual(Math.floor(room / 2) - 1);
    expect(px[0] / px[1]).toBeCloseTo(480 / 420, 1);
  });
  it('the roll and the mixer both docked at the bottom of a 720 px window keep the Playlist visible', () => {
    const col = 720 - 54 - 2 * 5; // under the toolbar, two splitters
    const [roll, mix] = fitStrips([320, 300], [300, 170], col, 140);
    expect(col - roll - mix).toBeGreaterThanOrEqual(140);
    expect(roll).toBeGreaterThanOrEqual(300 - 30);
  });
});

describe('splitShares', () => {
  it('moves the room between the two panels beside the splitter only', () => {
    expect(splitShares([300, 300, 200], 0, 50, [100, 100, 100])).toEqual([350, 250, 200]);
    expect(splitShares([300, 300, 200], 1, -40, [100, 100, 100])).toEqual([300, 260, 240]);
  });
  it('stops at either panel’s minimum', () => {
    expect(splitShares([300, 300], 0, 1000, [100, 120])).toEqual([480, 120]);
    expect(splitShares([300, 300], 0, -1000, [100, 120])).toEqual([100, 500]);
  });
});

describe('dock guides', () => {
  const stage = { x: 0, y: 50, w: 1600, h: 900 }, center = { x: 300, y: 50, w: 1000, h: 500 };
  const panes = [{ edge: 'bottom' as const, strip: 0, at: 0, rect: { x: 0, y: 555, w: 1600, h: 395 } }];
  // the row (Browser 0-300, Playlist 300-1300, a right strip 1300-1600) over a bottom strip, as in PatDock's Workspace
  const frame = { row: { x: 0, y: 50, w: 1600, h: 500 }, col: stage };
  const gs = dockGuides(stage, center, panes, frame);
  const find = (pred: (g: Guide) => boolean) => gs.find(pred)!;
  it('one arrow per side, each docking next to the Playlist, inside the strips there (no compasses mid-screen)', () => {
    expect(gs.map(g => g.dir)).toEqual(['left', 'right', 'down']);
    expect(find(g => g.dir === 'left').target).toEqual({ kind: 'strip', edge: 'left', at: 0 });
    expect(find(g => g.dir === 'right').target).toEqual({ kind: 'strip', edge: 'right', at: 0 });
    // the Mixer docked at the bottom stays at the bottom: a panel dropped there goes above it
    expect(find(g => g.dir === 'down').target).toEqual({ kind: 'strip', edge: 'bottom', at: 0 });
    // each at the middle of its edge
    expect(find(g => g.dir === 'left')).toMatchObject({ x: 24, y: 500 });
    expect(find(g => g.dir === 'down')).toMatchObject({ x: 800, y: 926 });
  });
  it('only a guide under the pointer counts (a drop anywhere else leaves the window floating)', () => {
    const g = gs[0];
    expect(guideAt(gs, g.x + 10, g.y - 10)).toBe(g);
    expect(guideAt(gs, 600, 200)).toBeNull();
  });
  it('previews stay inside what they split', () => {
    for (const g of gs) {
      expect(g.preview.w).toBeGreaterThan(0); expect(g.preview.h).toBeGreaterThan(0);
      expect(g.preview.x).toBeGreaterThanOrEqual(stage.x); expect(g.preview.x + g.preview.w).toBeLessThanOrEqual(stage.x + stage.w + 0.5);
    }
  });
});

describe('dock guide previews show where the panel lands (#161)', () => {
  // Browser 0-200, a left strip with two stacked panels 200-500, the Playlist 500-1600; a bottom strip of two panels side by side under it all
  const stage = { x: 0, y: 40, w: 1600, h: 860 }, row = { x: 0, y: 40, w: 1600, h: 560 }, col = stage;
  const center = { x: 500, y: 40, w: 1100, h: 560 };
  const panes = [
    { edge: 'left' as const, strip: 0, at: 0, rect: { x: 200, y: 40, w: 300, h: 280 } },
    { edge: 'left' as const, strip: 0, at: 1, rect: { x: 200, y: 320, w: 300, h: 280 } },
    { edge: 'bottom' as const, strip: 0, at: 0, rect: { x: 0, y: 604, w: 800, h: 296 } },
    { edge: 'bottom' as const, strip: 0, at: 1, rect: { x: 800, y: 604, w: 800, h: 296 } },
  ];
  const gs = dockGuides(stage, center, panes, { row, col, want: { w: 460, h: 300 } });
  const tgt = (t: object) => gs.filter(g => JSON.stringify(g.target) === JSON.stringify(t));
  it('the left guide previews a strip between the left strips and the Playlist, row high only', () => {
    const [g] = tgt({ kind: 'strip', edge: 'left', at: 0 });
    expect(g.preview.x).toBe(505); expect(g.preview.w).toBe(460); expect(g.preview.h).toBe(560);
  });
  it('the bottom guide previews a strip across the whole window, right above the strips there', () => {
    const [g] = tgt({ kind: 'strip', edge: 'bottom', at: 0 });
    expect(g.preview.x).toBe(0); expect(g.preview.w).toBe(1600);
    expect(g.preview.y + g.preview.h).toBe(599); // above the Mixer's strip and its splitter
    expect(g.preview.h).toBe(300); // the dragged panel's own docked height
  });
});

describe('parseDock', () => {
  it('drops unknown and repeated panels, bad shares and empty strips', () => {
    expect(parseDock({ left: [[{ id: 'rack', share: -1 }, { id: 'bogus' }], [], [{ id: 'rack' }]], bottom: [[{ id: 'mix', share: 2 }]] }))
      .toEqual(L({ left: [[one('rack')]], bottom: [[one('mix', 2)]] }));
  });
  it('is undefined for something that is not a layout', () => {
    expect(parseDock('left')).toBeUndefined();
    expect(parseDock([])).toBeUndefined();
    expect(parseDock({ left: 'x' })).toBeUndefined();
    expect(parseDock({})).toEqual(L({}));
  });
});
