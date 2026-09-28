import { distanceMeters, type LatLng } from '@identity/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { keys } from './queries';

/** Re-send the position at most every 2 minutes, or sooner after moving 250 m. */
const SEND_EVERY_MS = 120_000;
const SEND_AFTER_METERS = 250;

interface LocationContextValue {
  /** Exact device position — shown to this member only, never sent as is. */
  position: LatLng | null;
  sharing: boolean;
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission is off. Allow it in your browser or phone settings.';
    case error.POSITION_UNAVAILABLE:
      return 'Your position is unavailable right now.';
    default:
      return 'Finding your position took too long. Try again.';
  }
}

function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(geolocationMessage(err))),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    );
  });
}

/**
 * Keeps the member's shared position fresh while the app is open. The server
 * snaps it to a ~500 m grid; a web app cannot track in the background (the
 * native app will).
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sharing = Boolean(user?.locationSharing && user.hasAccess);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef<{ at: number; point: LatLng } | null>(null);

  useEffect(() => {
    if (!sharing || !('geolocation' in navigator)) {
      setPosition(null);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(point);
        setError(null);
        const last = lastSent.current;
        if (!last || Date.now() - last.at > SEND_EVERY_MS || distanceMeters(last.point, point) > SEND_AFTER_METERS) {
          lastSent.current = { at: Date.now(), point };
          api.me.updateLocation({ ...point, accuracy: pos.coords.accuracy }).catch(() => {
            lastSent.current = null;
          });
        }
      },
      (err) => setError(geolocationMessage(err)),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sharing]);

  const enable = useCallback(async () => {
    const point = await currentPosition();
    await api.me.setLocationSharing(true);
    await api.me.updateLocation(point);
    lastSent.current = { at: Date.now(), point };
    setPosition(point);
    setError(null);
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }, [queryClient]);

  const disable = useCallback(async () => {
    await api.me.setLocationSharing(false);
    lastSent.current = null;
    setPosition(null);
    await queryClient.invalidateQueries({ queryKey: keys.me });
  }, [queryClient]);

  const value = useMemo(
    () => ({ position, sharing, error, enable, disable }),
    [position, sharing, error, enable, disable],
  );
  return <LocationContext value={value}>{children}</LocationContext>;
}

export function useLocationSharing(): LocationContextValue {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocationSharing outside LocationProvider');
  return context;
}
