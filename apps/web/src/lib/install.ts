import { useEffect, useState, useSyncExternalStore } from 'react';

/** Chrome/Edge/Android event offering to install the PWA. Not in the DOM typings yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type NavigatorWithInstall = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<unknown[]>;
};

/** Remembers, in this browser, that the app was installed from it. */
const INSTALLED_KEY = 'identity.pwa-installed';

function readInstalledFlag(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeInstalledFlag(installed: boolean): void {
  try {
    if (installed) localStorage.setItem(INSTALLED_KEY, '1');
    else localStorage.removeItem(INSTALLED_KEY);
  } catch {
    // Blocked storage: we simply cannot remember it.
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedHere = readInstalledFlag();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  // Chromium only offers installation when the app is not installed: a remembered
  // "installed" flag is stale (the app was removed since).
  installedHere = false;
  writeInstalledFlag(false);
  notify();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  installedHere = true;
  writeInstalledFlag(true);
  notify();
});

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as NavigatorWithInstall).standalone === true
  );
}

/**
 * Asks the browser whether this PWA is installed on the device. Chromium answers
 * through getInstalledRelatedApps (the manifest lists the app as its own related
 * webapp); other browsers cannot tell, so the answer is "not known installed".
 */
let relatedCheck: Promise<boolean> | null = null;
function isInstalledOnDevice(): Promise<boolean> {
  relatedCheck ??= (async () => {
    const nav = navigator as NavigatorWithInstall;
    if (!nav.getInstalledRelatedApps) return false;
    try {
      return (await nav.getInstalledRelatedApps()).length > 0;
    } catch {
      return false;
    }
  })();
  return relatedCheck;
}

/** How the app gets installed on this device. */
export type InstallPlatform = 'ios' | 'android' | 'mac-safari' | 'in-app' | 'other';

export function installPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  // Instagram / Facebook in-app browsers cannot install web apps.
  if (/FBAN|FBAV|Instagram|Snapchat|TikTok|Line\//i.test(ua)) return 'in-app';
  // iPadOS reports itself as a Mac: tell it apart by its touch screen.
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOs) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  return 'other';
}

export interface InstallStatus {
  /** `null` while the device is being checked. */
  installed: boolean | null;
  platform: InstallPlatform;
  /** The browser's own install dialog, when it offers one (Chromium). Resolves to true if accepted. */
  prompt: (() => Promise<boolean>) | null;
  /** Whether this device can install the app at all (prompt or manual steps). */
  installable: boolean;
}

export function useInstallStatus(): InstallStatus {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null);
  const flagged = useSyncExternalStore(subscribe, () => installedHere);
  const [onDevice, setOnDevice] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void isInstalledOnDevice().then((result) => {
      if (active) setOnDevice(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const platform = installPlatform();
  const installed = isStandalone() || flagged || onDevice === true ? true : onDevice === null ? null : false;

  const prompt = canPrompt
    ? async () => {
        const event = deferred;
        if (!event) return false;
        await event.prompt();
        const { outcome } = await event.userChoice;
        deferred = null;
        notify();
        return outcome === 'accepted';
      }
    : null;

  return { installed, platform, prompt, installable: prompt !== null || platform !== 'other' };
}
