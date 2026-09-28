import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/cx';
import { IconTile, type TileColor } from './controls';
import s from './ui.module.css';

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx(s.card, className)}>{children}</section>;
}

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueClassName?: string;
  /** Plain blue icon (detail rows). */
  icon?: ReactNode;
  /** Coloured square icon (settings-style rows). */
  tile?: { icon: ReactNode; color: TileColor };
  trailing?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
}

/** A row of an iOS grouped list: icon, title/subtitle, value, chevron. */
export function ListRow({
  title,
  subtitle,
  value,
  valueClassName,
  icon,
  tile,
  trailing,
  to,
  href,
  onClick,
  chevron,
  destructive,
}: ListRowProps) {
  const interactive = Boolean(to || href || onClick);
  const className = cx(
    s.row,
    icon && s.rowWithIcon,
    tile && s.rowWithTile,
    interactive && s.interactive,
    destructive && s.destructive,
  );
  const content = (
    <>
      {icon && (
        <span className={s.rowIcon} aria-hidden>
          {icon}
        </span>
      )}
      {tile && <IconTile color={tile.color}>{tile.icon}</IconTile>}
      <span className={s.rowBody}>
        <span className={s.rowTitle} style={{ display: 'block' }}>
          {title}
        </span>
        {subtitle && (
          <span className={s.rowSubtitle} style={{ display: 'block' }}>
            {subtitle}
          </span>
        )}
      </span>
      {value !== undefined && value !== null && <span className={cx(s.rowValue, valueClassName)}>{value}</span>}
      {trailing}
      {(chevron ?? Boolean(to)) && <ChevronRight className={s.rowChevron} aria-hidden />}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={className} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
