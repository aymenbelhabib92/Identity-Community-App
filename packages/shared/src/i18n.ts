/**
 * Translations. English source strings are the keys (`t('Sign in')`), so a
 * missing translation falls back to English. Clients set one app-wide language
 * and call `t`; the server serves members in different languages at once and
 * passes the language explicitly with `translate`.
 */
import { FR } from './locales/fr';

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'Français' };
export const DEFAULT_LANGUAGE: Language = 'en';

export type Translations = Record<string, string>;
export type TranslationParams = Record<string, string | number>;

const dictionaries: Record<Language, Translations> = { en: {}, fr: { ...FR } };

/** Adds an app's own strings (the web app registers its screens' texts). */
export function registerTranslations(lang: Language, entries: Translations): void {
  Object.assign(dictionaries[lang], entries);
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Language of a browser locale or an Accept-Language header ("fr-FR,fr;q=0.9,en;q=0.8"). */
export function pickLanguage(value: string | null | undefined): Language | null {
  const tag = value?.split(',')[0]?.trim().toLowerCase().slice(0, 2);
  return isLanguage(tag) ? tag : null;
}

let current: Language = DEFAULT_LANGUAGE;

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

let onMissing: ((lang: Language, text: string) => void) | null = null;

/** Development aid: called for every text that has no translation in a language other than English. */
export function onMissingTranslation(handler: ((lang: Language, text: string) => void) | null): void {
  onMissing = handler;
}

/** `text` in `lang`, with `{name}` placeholders filled from `params`. */
export function translate(lang: Language, text: string, params?: TranslationParams): string {
  const translated = dictionaries[lang][text];
  if (translated === undefined && lang !== 'en' && onMissing) onMissing(lang, text);
  const template = translated ?? text;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => (key in params ? String(params[key]) : placeholder));
}

/** Picks the singular or plural text for `count` (French counts 0 as singular) and fills `{count}`. */
export function translatePlural(
  lang: Language,
  count: number,
  one: string,
  other: string,
  params?: TranslationParams,
): string {
  const singular = lang === 'fr' ? count < 2 : count === 1;
  return translate(lang, singular ? one : other, { count, ...params });
}

/** In the app-wide language (clients). */
export function t(text: string, params?: TranslationParams): string {
  return translate(current, text, params);
}

/** `tn(3, '{count} member', '{count} members')` in the app-wide language. */
export function tn(count: number, one: string, other: string, params?: TranslationParams): string {
  return translatePlural(current, count, one, other, params);
}
