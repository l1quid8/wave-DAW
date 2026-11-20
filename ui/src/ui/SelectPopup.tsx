// Every <select> in the app opens this list instead of the OS one: the native popup is a white
// Windows list box that ignores the theme (and WebKitGTK's is worse). The <select> itself stays —
// its value, change event, focus, disabled state and arrow-key stepping are unchanged — only its
// popup is replaced, so every select (and every new one) gets it without a wrapper component.
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { CHECK_GLYPH } from './menuIcons';
import { step, typeAhead, type Opt, type Row } from '../lib/selectList';

interface Open { el: HTMLSelectElement; rows: Row[]; x: number; y: number; w: number; maxH: number; up: boolean }

const [open, setOpen] = createSignal<Open | null>(null);
const [hot, setHotSig] = createSignal(-1);
let listEl: HTMLDivElement | undefined;
/** Highlight a row and keep it in view (keyboard moves past the list's edge). */
function setHot(i: number) {
  setHotSig(i);
  queueMicrotask(() => listEl?.querySelector('.mi.hot')?.scrollIntoView({ block: 'nearest' }));
}

/** The select's options as rows, optgroup labels included (read live: options are reactive JSX). */
export function selectRows(el: HTMLSelectElement): Row[] {
  const rows: Row[] = [];
  for (const c of Array.from(el.children)) {
    if (c instanceof HTMLOptGroupElement) {
      rows.push({ kind: 'grp', label: c.label });
      for (const o of Array.from(c.children)) if (o instanceof HTMLOptionElement) rows.push(optRow(o, c.disabled));
    } else if (c instanceof HTMLOptionElement) rows.push(optRow(c, false));
  }
  return rows;
}
const optRow = (o: HTMLOptionElement, groupOff: boolean): Opt => ({ kind: 'opt', label: o.label || o.text, value: o.value, disabled: o.disabled || groupOff });

const usable = (el: Element | null): el is HTMLSelectElement =>
  el instanceof HTMLSelectElement && !el.disabled && !el.multiple && el.size <= 1;

function openFor(el: HTMLSelectElement) {
  const rows = selectRows(el);
  if (!rows.some(r => r.kind === 'opt')) return;
  const r = el.getBoundingClientRect(), vh = window.innerHeight;
  const below = vh - r.bottom - 8, above = r.top - 8;
  // below unless it would need to scroll there and has more room above (native lists do the same)
  const want = rows.length * 26 + 10;
  const up = below < Math.min(want, 240) && above > below;
  el.focus({ preventScroll: true });
  setOpen({ el, rows, x: r.left, y: up ? r.top - 3 : r.bottom + 3, w: r.width, maxH: Math.max(120, up ? above : below), up });
  setHot(rows.findIndex(x => x.kind === 'opt' && x.value === el.value));
}

export function closeSelectPopup(refocus = true) {
  const o = open();
  if (!o) return;
  setOpen(null);
  if (refocus) o.el.focus({ preventScroll: true });
}

function pick(i: number) {
  const o = open(), r = o?.rows[i];
  if (!o || !r || r.kind !== 'opt' || r.disabled) return;
  closeSelectPopup();
  if (o.el.value === r.value) return;
  o.el.value = r.value;
  // the same events a native pick fires: Solid's onChange / onInput handlers run unchanged
  o.el.dispatchEvent(new Event('input', { bubbles: true }));
  o.el.dispatchEvent(new Event('change', { bubbles: true }));
}

let typed = '', typedAt = 0;
function onKey(e: KeyboardEvent) {
  const o = open();
  if (!o) return;
  const rows = o.rows, h = hot();
  const take = () => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  switch (e.key) {
    case 'ArrowDown': take(); setHot(step(rows, h, 1)); return;
    case 'ArrowUp': take(); if (e.altKey) closeSelectPopup(); else setHot(step(rows, h, -1)); return;
    case 'PageDown': take(); setHot(step(rows, Math.min(rows.length, h + 10), -1)); return;
    case 'PageUp': take(); setHot(step(rows, Math.max(-1, h - 10), 1)); return;
    case 'Home': take(); setHot(step(rows, -1, 1)); return;
    case 'End': take(); setHot(step(rows, rows.length, -1)); return;
    case 'Enter': case ' ': take(); pick(h); return;
    // Esc closes the list only: the dialog or window behind it stays open
    case 'Escape': take(); closeSelectPopup(); return;
    case 'Tab': closeSelectPopup(); return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    take();
    const now = performance.now();
    typed = (now - typedAt > 700 ? '' : typed) + e.key.toLowerCase();
    typedAt = now;
    const j = typeAhead(rows, h, typed);
    if (j >= 0) setHot(j);
    return;
  }
  take(); // nothing else reaches the app's shortcuts while the list is open
}

/** Intercept the native popup of every select (call once at startup). */
export function installSelectPopups() {
  document.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const el = e.target instanceof Element ? e.target.closest('select') : null;
    if (!usable(el)) return;
    e.preventDefault(); // no native popup (Chromium / WebView2 / WebKit open it on mousedown)
    if (open()?.el === el) closeSelectPopup(); else openFor(el);
  }, true);
  document.addEventListener('keydown', e => {
    if (open()) return onKey(e);
    const el = e.target;
    if (!usable(el as Element)) return;
    // the keys that open a native list; plain arrows keep stepping the value in place
    if (e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      openFor(el as HTMLSelectElement);
    }
  }, true);
}

/** The open list (mounted once, at the app root). */
export function SelectPopup() {
  const close = () => closeSelectPopup(false);
  onMount(() => {
    // the select moved away under the list: close rather than float detached
    const onScroll = (e: Event) => { if (open() && !(e.target instanceof Node && listEl?.contains(e.target))) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    onCleanup(() => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); window.removeEventListener('blur', close); });
  });
  return (
    <Show when={open()}>{o => {
      setHot(hot());
      return (
        <>
          <div class="backdrop selpop-veil" onPointerDown={e => { e.preventDefault(); closeSelectPopup(); }} onContextMenu={e => e.preventDefault()} />
          <div ref={el => { listEl = el; }} class="menu selpop" role="listbox" style={{
            left: Math.max(4, Math.min(o().x, window.innerWidth - Math.max(o().w, 120) - 4)) + 'px',
            ...(o().up ? { bottom: window.innerHeight - o().y + 'px' } : { top: o().y + 'px' }),
            'min-width': o().w + 'px', 'max-height': o().maxH + 'px',
          }} onPointerDown={e => e.preventDefault()}>
            <For each={o().rows}>{(r, i) => r.kind === 'grp'
              ? <div class="msec">{r.label}</div>
              : (
                <button class="mi" role="option" tabIndex={-1} aria-selected={r.value === o().el.value} aria-disabled={r.disabled}
                  classList={{ hot: hot() === i(), dis: r.disabled, cur: r.value === o().el.value }}
                  onPointerMove={() => { if (!r.disabled && hot() !== i()) setHotSig(i()); }}
                  onClick={() => pick(i())}>
                  <span class="row" style={{ gap: '8px' }}>
                    <span class="mico"><Show when={r.value === o().el.value}><svg viewBox={CHECK_GLYPH.vb} width="12" height="12" fill="currentColor"><path d={CHECK_GLYPH.d} /></svg></Show></span>
                    <span class="ell">{r.label}</span>
                  </span>
                </button>
              )}</For>
          </div>
        </>
      );
    }}</Show>
  );
}
