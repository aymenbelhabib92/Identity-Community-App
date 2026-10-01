import {
  DEFAULT_LANGUAGE,
  isLanguage,
  pickLanguage,
  registerTranslations,
  setLanguage,
  type Language,
} from '@identity/shared';
import { useSyncExternalStore } from 'react';
import { FR } from '../locales/fr';

/**
 * Preferences of this device: language and theme. They are applied before the
 * first render, kept in localStorage, and the language is also saved on the
 * member's account (see AuthProvider) so notifications are written in it.
 */

registerTranslations('fr', FR);

export const THEMES = ['dark', 'light', 'system'] as const;
export type Theme = (typeof THEMES)[number];

const LANGUAGE_KEY = 'identity.lang';
const THEME_KEY = 'identity.theme';
const THEME_COLOR = { dark: '#000000', light: '#f2f2f7' };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the choice lasts until the tab closes.
  }
}

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach((listener) => listener());

// ─── Language ────────────────────────────────────────────────────────────────

const storedLanguage = read(LANGUAGE_KEY);
/** The phone's language until the member picks one. */
let language: Language = isLanguage(storedLanguage)
  ? storedLanguage
  : (pickLanguage(navigator.language) ?? DEFAULT_LANGUAGE);

function applyLanguage(): void {
  setLanguage(language);
  document.documentElement.lang = language;
}

export const currentLanguage = () => language;

export function changeLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  write(LANGUAGE_KEY, next);
  applyLanguage();
  emit();
}

/** Re-renders when the language changes. */
export const useLanguage = () => useSyncExternalStore(subscribe, currentLanguage);

// ─── Theme ───────────────────────────────────────────────────────────────────

const storedTheme = read(THEME_KEY);
let theme: Theme = (THEMES as readonly string[]).includes(storedTheme ?? '') ? (storedTheme as Theme) : 'dark';

const systemLight = window.matchMedia('(prefers-color-scheme: light)');

/** The palette actually shown: "system" follows the phone. */
export function resolvedTheme(): 'dark' | 'light' {
  if (theme === 'system') return systemLight.matches ? 'light' : 'dark';
  return theme;
}

function applyTheme(): void {
  const resolved = resolvedTheme();
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
}

systemLight.addEventListener('change', () => {
  if (theme !== 'system') return;
  applyTheme();
  emit();
});

export const currentTheme = () => theme;

export function changeTheme(next: Theme): void {
  if (next === theme) return;
  theme = next;
  write(THEME_KEY, next);
  applyTheme();
  emit();
}

export const useTheme = () => useSyncExternalStore(subscribe, currentTheme);
export const useResolvedTheme = () => useSyncExternalStore(subscribe, resolvedTheme);

applyLanguage();
applyTheme();
