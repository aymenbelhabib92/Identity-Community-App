import { initials } from '@identity/shared';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/cx';
import { usePhoto } from '../../lib/photos';
import s from './ui.module.css';

export type Tone = 'red' | 'blue' | 'orange' | 'green' | 'gray' | 'purple';
export type TileColor = 'blue' | 'green' | 'orange' | 'red' | 'gray' | 'purple';

const TONE: Record<Tone, string> = {
  red: s.toneRed!,
  blue: s.toneBlue!,
  orange: s.toneOrange!,
  green: s.toneGreen!,
  gray: s.toneGray!,
  purple: s.tonePurple!,
};

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'plain';

interface ButtonStyleProps {
  variant?: Variant;
  size?: 'normal' | 'small';
  icon?: ReactNode;
}

function buttonClass({ variant = 'primary', size = 'normal' }: ButtonStyleProps, className?: string) {
  return cx(s.button, s[variant], size === 'small' && s.small, className);
}

export function Button({
  variant,
  size,
  icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spinner} aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  state,
  variant,
  size,
  icon,
  className,
  children,
}: ButtonStyleProps & { to: string; state?: unknown; className?: string; children: ReactNode }) {
  return (
    <Link to={to} state={state} className={buttonClass({ variant, size }, className)}>
      {icon}
      {children}
    </Link>
  );
}

/** Round 44 px button used in headers (bell, +). */
export function RoundButton({
  label,
  dot,
  to,
  onClick,
  children,
}: {
  label: string;
  dot?: boolean;
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const content = (
    <>
      {children}
      {dot && <span className={s.dot} aria-hidden />}
    </>
  );
  return to ? (
    <Link to={to} className={s.roundButton} aria-label={label}>
      {content}
    </Link>
  ) : (
    <button type="button" className={s.roundButton} aria-label={label} onClick={onClick}>
      {content}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx(s.segmented, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={cx(s.segment, option.value === value && s.segmentActive)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={s.toggle}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Badge({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx(s.badge, TONE[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function Pill({ tone, icon, children }: { tone: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx(s.pill, TONE[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function IconTile({ color, large, children }: { color: TileColor; large?: boolean; children: ReactNode }) {
  return (
    <span className={cx(s.tile, large && s.tileLarge, s[color])} aria-hidden>
      {children}
    </span>
  );
}

/** A member's photo, or their initials; `online` adds a green dot. */
export function Avatar({
  name,
  photo,
  size = 44,
  online,
  className,
}: {
  name: string;
  /** Photo id (see lib/photos). */
  photo?: string | null;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const url = usePhoto(photo);
  return (
    <span
      className={cx(s.avatar, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {url ? <img src={url} alt="" /> : initials(name)}
      {online && <span className={s.online} />}
    </span>
  );
}
