import { t } from '@identity/shared';
import { useState } from 'react';
import { cx } from '../../lib/cx';
import { usePhoto } from '../../lib/photos';
import { Sheet } from '../ui';
import s from './photos.module.css';

/** A member photo by id; a neutral placeholder while it loads. */
export function Photo({ id, alt = '', className }: { id: string; alt?: string; className?: string }) {
  const url = usePhoto(id);
  return url ? <img src={url} alt={alt} className={className} /> : <span className={cx(s.placeholder, className)} aria-hidden />;
}

/** A row of car photos (main photo first); tapping one shows it in full. */
export function CarPhotoStrip({ photos, className }: { photos: string[]; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (photos.length === 0) return null;
  return (
    <>
      <div className={cx(s.strip, className)}>
        {photos.map((id) => (
          <button key={id} type="button" className={s.stripItem} onClick={() => setOpen(id)} aria-label={t('View the photo')}>
            <Photo id={id} />
          </button>
        ))}
      </div>
      <PhotoViewer id={open} onClose={() => setOpen(null)} />
    </>
  );
}

export function PhotoViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Sheet open={id !== null} onClose={onClose} title={t('Photo')}>
      {id && <Photo id={id} className={s.full} />}
    </Sheet>
  );
}
