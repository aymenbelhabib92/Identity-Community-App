import type { ClubPlaceCategory, MeetupVisibility } from '@identity/shared';
import L from 'leaflet';
import s from './map.module.css';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Icons are cached so markers keep the same DOM node between renders.
const cache = new Map<string, L.DivIcon>();
function cached(key: string, create: () => L.DivIcon): L.DivIcon {
  let icon = cache.get(key);
  if (!icon) {
    icon = create();
    cache.set(key, icon);
  }
  return icon;
}

/** Round avatar: the member's photo (an object URL) or their initials ("KB"), with a green dot when online. */
export const memberIcon = (label: string, photoUrl: string | null, online: boolean) =>
  cached(`member:${photoUrl ?? label}:${online}`, () =>
    L.divIcon({
      className: online ? `${s.member} ${s.memberOnline}` : s.member!,
      html: photoUrl ? `<img src="${escapeHtml(photoUrl)}" alt="" />` : escapeHtml(label),
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    }),
  );

/** Several members close together ("+6"). */
export const clusterIcon = (count: number) =>
  cached(`cluster:${count}`, () =>
    L.divIcon({ className: s.cluster, html: `+${count}`, iconSize: [38, 38], iconAnchor: [19, 19] }),
  );

/** This device's own position. */
export const meIcon = cached('me', () =>
  L.divIcon({ className: s.me, html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
);

const CALENDAR_SVG =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

export const meetupIcon = (visibility: MeetupVisibility) =>
  cached(`meetup:${visibility}`, () =>
    L.divIcon({
      className: `${s.meetup} ${s[visibility]}`,
      html: CALENDAR_SVG,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    }),
  );

/** Lucide icon paths (24 × 24) for the club's places. */
const PLACE_ICONS: Record<ClubPlaceCategory, string> = {
  // flag
  spot: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
  // wrench
  garage:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  // coffee
  partner:
    '<path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2"/>',
  // droplets
  wash: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  // star
  other:
    '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>',
};

/** A place of the club, coloured by category. */
export const placeIcon = (category: ClubPlaceCategory) =>
  cached(`place:${category}`, () =>
    L.divIcon({
      className: `${s.place} ${s[`place_${category}`]}`,
      html: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${PLACE_ICONS[category]}</svg>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    }),
  );

/** Teardrop pin for a chosen place. */
export const pinIcon = cached('pin', () =>
  L.divIcon({ className: s.pin, html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 30] }),
);
