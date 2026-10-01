import type { HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import s from './brand.module.css';

/** A surface with the dark "crushed glass" texture of the club's cards. It stays dark in the light theme. */
export function Shards({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(s.shards, 'theme-dark', className)} {...rest} />;
}
