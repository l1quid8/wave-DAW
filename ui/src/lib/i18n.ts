import { createSignal } from 'solid-js';
import { en } from '../i18n/en';
import { pl } from '../i18n/pl';
import { names as fxNames } from '../i18n/names-fx';
import { names as synthNames } from '../i18n/names-synth';
import { shortcuts } from './platform';

export type Lang = 'en' | 'pl';
export type TranslationKey = keyof typeof en;

const [lang, setLangSignal] = createSignal<Lang>('en');
export { lang };

export function setLang(value: Lang): void {
  setLangSignal(value);
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}

// Each translation with its shortcut hints in this platform's notation (⌘S on macOS), worked out once:
// `t` runs on every render, and the rewrite is a few regex passes. Bounded by the number of keys in
// the two languages; the strings never change while the app runs.
const prepared = { en: new Map<TranslationKey, string>(), pl: new Map<TranslationKey, string>() };

function template(key: TranslationKey): string {
  const l = lang();
  const cache = prepared[l];
  let text = cache.get(key);
  if (text === undefined) cache.set(key, text = shortcuts((l === 'pl' ? pl : en)[key]));
  return text;
}

export function t(key: TranslationKey, vars: Record<string, string | number> = {}): string {
  const text = template(key);
  return text.replace(/\{([^{}]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match);
}

// Engine-owned names are translated for display only; unknown and user-given names pass through.
const names: Record<string, string> = { ...fxNames, ...synthNames };

export function tName(name: string): string {
  return lang() === 'en' && Object.prototype.hasOwnProperty.call(names, name) ? names[name] : name;
}
