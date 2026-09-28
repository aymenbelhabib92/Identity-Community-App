import { LOGO_ASPECT, LOGO_PATHS, LOGO_VIEWBOX } from './logoPath';

/** The Identity wordmark, in `currentColor`. Give it a width or a height. */
export function Logo({ width, height, className }: { width?: number; height?: number; className?: string }) {
  const h = height ?? (width ? width / LOGO_ASPECT : 40);
  const w = width ?? h * LOGO_ASPECT;
  return (
    <svg viewBox={LOGO_VIEWBOX} width={w} height={h} className={className} role="img" aria-label="Identity">
      {LOGO_PATHS.map((d, index) => (
        <path key={index} d={d} fill="currentColor" fillRule="evenodd" />
      ))}
    </svg>
  );
}
