const DEVICE_KEY = 'identity.device';

function randomId(): string {
  // getRandomValues also works over plain HTTP (crypto.randomUUID needs HTTPS).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

let deviceId: string | null = null;

/**
 * This installation of the app: a random identifier created once and kept on the
 * device (sent as X-Device-Id). The server refuses sign-ins and new accounts from
 * the devices of a member banned for life. A web app cannot read a hardware
 * identifier, so clearing the app's data gives a new one.
 */
export function getDeviceId(): string {
  if (deviceId) return deviceId;
  try {
    deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = randomId();
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch {
    // Storage blocked: an identifier for this visit only.
    deviceId ??= randomId();
  }
  return deviceId;
}
