import { t } from '@identity/shared';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

/** iOS-style bottom sheet. Closes on backdrop tap and Escape. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // Read through a ref: a new `onClose` at every render (an inline function) must not
  // run the effect below again, which would take the focus (and the phone keyboard)
  // away from the field being typed in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={s.backdrop} onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={s.sheet}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={s.grabber} aria-hidden />
        {title && (
          <div className={s.sheetHeader}>
            <h2 className={s.sheetTitle}>{title}</h2>
            <button type="button" className={s.sheetClose} onClick={onClose} aria-label={t('Close')}>
              <X aria-hidden strokeWidth={2.6} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
