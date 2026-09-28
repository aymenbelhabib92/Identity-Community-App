import { useSyncExternalStore } from 'react';

/** Chrome/Edge/Android event offering to install the PWA. Not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

/** A function that shows the browser's install dialog, when the browser offers one. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => deferred !== null,
  );
  if (!available) return null;
  return async () => {
    const event = deferred;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    deferred = null;
    notify();
  };
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS has no install prompt: members add the app from Safari's share menu. */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
