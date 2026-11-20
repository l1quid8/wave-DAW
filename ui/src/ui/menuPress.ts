/**
 * Whether a press on `target` belongs to the open menu and must not dismiss it: inside a menu
 * panel or one of its submenus (both `.ctxmenu`, ui/Menu.tsx MenuList — other panels styled
 * `.menu`, like the piano-roll note properties, do not count), or on a menu bar title — a
 * title's press opens or switches that menu in one step, so it must stay pressable while a
 * menu is open (ui/Menu.tsx dismisses everything else at the document level; there is no
 * backdrop div, which would cover the bar and swallow those presses).
 */
export const pressKeepsMenu = (target: { closest(sel: string): unknown } | null | undefined): boolean =>
  !!target && (target.closest('.ctxmenu') != null || target.closest('.mbtn') != null);

/**
 * Whether `e` belongs to a pointer press, so a dismissal swallow may absorb it. A `click`
 * synthesized without one — keyboard activation (Enter / Space) and `el.click()` report
 * `detail: 0` — reaches the focused control even while a press is being swallowed; the press's
 * own pointerup / click / auxclick / contextmenu (any detail) is part of the press.
 */
export const isPointerEvent = (e: { type: string; detail: number }): boolean =>
  e.type !== 'click' || e.detail > 0;
