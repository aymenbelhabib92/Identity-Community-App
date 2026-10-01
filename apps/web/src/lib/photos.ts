import { t } from '@identity/shared';
import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * Member photos (profile and car). They are private to the club, so they are
 * fetched with the session token and shown through object URLs, kept for the
 * session: a photo never changes (a new upload gets a new id).
 */
const loading = new Map<string, Promise<string>>();
const loaded = new Map<string, string>();

function photoUrl(id: string): Promise<string> {
  let url = loading.get(id);
  if (!url) {
    url = api.photos.get(id).then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      loaded.set(id, objectUrl);
      return objectUrl;
    });
    url.catch(() => loading.delete(id));
    loading.set(id, url);
  }
  return url;
}

/** Forgets every photo (on sign-out). */
export function clearPhotos(): void {
  for (const url of loaded.values()) URL.revokeObjectURL(url);
  loaded.clear();
  loading.clear();
}

/** URL to display photo `id`, or null while it loads (or when there is none). */
export function usePhoto(id: string | null | undefined): string | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!id || loaded.has(id)) return;
    let cancelled = false;
    photoUrl(id).then(
      () => {
        if (!cancelled) setVersion((version) => version + 1);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (id && loaded.get(id)) || null;
}

/**
 * Scales a picture down to `size` pixels (cropped to a centred square for
 * profile photos) and re-encodes it as JPEG. Uploads stay small and the
 * picture's metadata — such as where it was taken — is dropped.
 */
export async function preparePhoto(file: File, { size, square = false }: { size: number; square?: boolean }): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(t('This photo cannot be read. Try another one (JPG or PNG).'));
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const width = square ? side : bitmap.width;
    const height = square ? side : bitmap.height;
    const scale = Math.min(1, size / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error(t('This photo cannot be read. Try another one (JPG or PNG).'));
    context.drawImage(bitmap, (bitmap.width - width) / 2, (bitmap.height - height) / 2, width, height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob) throw new Error(t('This photo cannot be read. Try another one (JPG or PNG).'));
    return blob;
  } finally {
    bitmap.close();
  }
}

/** The multipart body expected by the photo endpoints. */
export function photoForm(photo: Blob): FormData {
  const form = new FormData();
  form.append('file', photo, 'photo.jpg');
  return form;
}
