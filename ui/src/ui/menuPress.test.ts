import { describe, expect, it } from 'vitest';
import { isPointerEvent, pressKeepsMenu } from './menuPress';

/** A stand-in element: `cls` are its own classes, `parent` its container. */
interface Fake {
  tagName: string;
  cls: string[];
  parent: Fake | null;
  closest(sel: string): unknown;
}

function el(tagName: string, cls: string[] = [], parent: Fake | null = null): Fake {
  const self: Fake = {
    tagName, cls, parent,
    closest(sel: string): unknown {
      const want = sel.split(',').map(s => s.trim().replace(/^\./, ''));
      let cur: Fake | null = self;
      while (cur) {
        if (cur.cls.some(c => want.includes(c))) return cur;
        cur = cur.parent;
      }
      return null;
    },
  };
  return self;
}

const bar = el('DIV', ['menubar']);
const title = el('BUTTON', ['mbtn'], bar);
const play = el('BUTTON', []);
const panel = el('DIV', ['menu', 'ctxmenu']);
const sub = el('DIV', ['menu', 'ctxmenu', 'submenu'], panel);
const item = el('BUTTON', [], panel);
const props = el('DIV', ['menu', 'rollprops']); // piano-roll note properties: .menu-styled, not a context menu
const field = el('INPUT', [], props);
const clip = el('CANVAS', ['plgrid']);

describe('pressKeepsMenu', () => {
  it('keeps a press on a menu bar title: one press opens or switches menus', () => {
    expect(pressKeepsMenu(title)).toBe(true);
    // the bar itself (the gap between titles) is not a title: the menu closes, as outside it
    expect(pressKeepsMenu(bar)).toBe(false);
  });

  it('keeps a press inside the open menu and its submenus', () => {
    expect(pressKeepsMenu(panel)).toBe(true);
    expect(pressKeepsMenu(item)).toBe(true);
    expect(pressKeepsMenu(sub)).toBe(true);
  });

  it('keeps only real context-menu panels: a .menu-styled panel that is not one dismisses', () => {
    // the note-properties panel opened over the playlist while the File menu is up
    expect(pressKeepsMenu(props)).toBe(false);
    expect(pressKeepsMenu(field)).toBe(false);
  });

  it('dismisses on a press anywhere else', () => {
    expect(pressKeepsMenu(play)).toBe(false);
    expect(pressKeepsMenu(clip)).toBe(false);
  });

  it('dismisses when the press target is not an element', () => {
    expect(pressKeepsMenu(null)).toBe(false);
    expect(pressKeepsMenu(undefined)).toBe(false);
  });
});

describe('isPointerEvent — which events a dismissal swallow may absorb', () => {
  it('absorbs the dismissed press and its pointer-generated follow-ups', () => {
    expect(isPointerEvent({ type: 'pointerup', detail: 0 })).toBe(true);
    expect(isPointerEvent({ type: 'click', detail: 1 })).toBe(true);
    expect(isPointerEvent({ type: 'auxclick', detail: 1 })).toBe(true);
    expect(isPointerEvent({ type: 'contextmenu', detail: 0 })).toBe(true);
  });

  it('lets a keyboard (or programmatic) click through: detail 0 click without a press', () => {
    expect(isPointerEvent({ type: 'click', detail: 0 })).toBe(false);
  });
});
