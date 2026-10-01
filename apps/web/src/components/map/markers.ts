import type { MeetupVisibility } from '@identity/shared';
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

/** Teardrop pin for a chosen place. */
export const pinIcon = cached('pin', () =>
  L.divIcon({ className: s.pin, html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 30] }),
);
