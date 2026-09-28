import { ChevronLeft } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/cx';
import s from './ui.module.css';

export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx(s.screen, className)}>{children}</main>;
}

/** iOS large title, with an optional accessory on the right (buttons, avatar). */
export function LargeTitle({ children, accessory }: { children: ReactNode; accessory?: ReactNode }) {
  return (
    <div className={s.titleRow}>
      <h1 className={s.largeTitle}>{children}</h1>
      {accessory}
    </div>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return <p className={s.lead}>{children}</p>;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={s.back}>
      <ChevronLeft aria-hidden strokeWidth={2.4} />
      {children}
    </Link>
  );
}

/** "Next meetup ………… See all" */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.sectionTitle}>
      <h2>{children}</h2>
      {action}
    </div>
  );
}

export function SectionAction({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={s.sectionAction}>
      {children}
    </Link>
  );
}

/** Small uppercase label above a grouped list ("FEES"). */
export function SectionHeader({ children }: { children: ReactNode }) {
  return <h2 className={s.sectionHeader}>{children}</h2>;
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return <p className={s.sectionFooter}>{children}</p>;
}

export function Card({ padded, className, ...rest }: HTMLAttributes<HTMLElement> & { padded?: boolean }) {
  return <section className={cx(s.card, padded && s.padded, className)} {...rest} />;
}

export function Stack({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <div className={s.stack} style={{ gap }}>
      {children}
    </div>
  );
}
