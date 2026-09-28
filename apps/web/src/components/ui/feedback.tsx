import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../../lib/errors';
import { cx } from '../../lib/cx';
import { Button, type Tone } from './controls';
import s from './ui.module.css';

export function Spinner({ className }: { className?: string }) {
  return <span className={cx(s.spinner, className)} role="status" aria-label="Loading" />;
}

export function Loading() {
  return (
    <div className={s.center}>
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon && <div className={s.emptyIcon}>{icon}</div>}
      {title && <p className={s.emptyTitle}>{title}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className={s.stack}>
      <div className={s.errorBox} role="alert">
        <CircleAlert aria-hidden />
        <span>{errorMessage(error)}</span>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

const NOTICE_TONE: Record<Tone, string> = {
  red: s.toneRed!,
  blue: s.toneBlue!,
  orange: s.toneOrange!,
  green: s.toneGreen!,
  gray: s.toneGray!,
};

export function Notice({ tone = 'blue', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx(s.notice, NOTICE_TONE[tone])} role="note">
      {icon}
      <div>{children}</div>
    </div>
  );
}
