import { t, type PushSubscriptionBody } from '@identity/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import { installPlatform, isStandalone } from './install';

/**
 * Push notifications on this device (Web Push through the PWA's service worker,
 * which shows them: public/push-sw.js).
 *
 * - unsupported:   this browser cannot receive them
 * - needs-install: iPhone / iPad: only the app installed on the home screen can
 * - denied:        the member blocked them (only the phone settings can undo it)
 * - off / on
 */
export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

interface PushStatus {
  state: PushState;
  /** The browser has not asked the member yet: the banner may offer it. */
  askable: boolean;
}

let status: PushStatus = { state: 'checking', askable: false };
const listeners = new Set<() => void>();
const set = (next: PushStatus) => {
  status = next;
  listeners.forEach((listener) => listener());
};

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The service worker, once active. There is none in development (`npm run dev`). */
async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function toBody(subscription: PushSubscription): PushSubscriptionBody {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } };
}

async function refresh(): Promise<void> {
  if (!supported()) {
    set({ state: installPlatform() === 'ios' && !isStandalone() ? 'needs-install' : 'unsupported', askable: false });
    return;
  }
  if (Notification.permission === 'denied') {
    set({ state: 'denied', askable: false });
    return;
  }
  const registration = await workerRegistration();
  if (!registration) {
    set({ state: 'unsupported', askable: false });
    return;
  }
  const subscription = await registration.pushManager.getSubscription();
  const on = subscription !== null && Notification.permission === 'granted';
  set({ state: on ? 'on' : 'off', askable: Notification.permission === 'default' });
}

/** Subscribes this device (permission already granted) and registers it with the server. */
async function subscribeDevice(): Promise<void> {
  const registration = await workerRegistration();
  if (!registration) throw new Error(t('Notifications are not available in this browser.'));
  const { publicKey } = await api.push.key();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  await api.push.subscribe(toBody(subscription));
}

/** Asks the member (call it straight from a tap: browsers require it) and turns notifications on. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    await refresh();
    throw new Error(
      permission === 'denied'
        ? t('Notifications are blocked. Allow them in the settings of your phone or browser.')
        : t('Notifications were not turned on.'),
    );
  }
  try {
    await subscribeDevice();
  } finally {
    await refresh();
  }
}

export async function disablePush(): Promise<void> {
  const registration = await workerRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.push.unsubscribe(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
  }
  await refresh();
}

/**
 * After signing in: registers this device again for the signed-in account (it
 * may have been used by another one, or the server keys changed).
 */
export async function syncPush(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') {
    await refresh();
    return;
  }
  try {
    await subscribeDevice();
  } catch {
    // Offline or push service unavailable: the next start tries again.
  } finally {
    await refresh();
  }
}

/** Before signing out: this device stops receiving the account's notifications. */
export async function forgetPushDevice(): Promise<void> {
  if (!supported()) return;
  const registration = await workerRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await api.push.unsubscribe(subscription.endpoint).catch(() => {});
}

// The member may change the permission in the phone settings while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && status.state !== 'checking') void refresh();
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePushStatus(): PushStatus {
  useEffect(() => {
    if (status.state === 'checking') void refresh();
  }, []);
  return useSyncExternalStore(subscribe, () => status);
}
