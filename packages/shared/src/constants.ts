/**
 * Plain values of the API contract (enums, labels, limits). Kept apart from the
 * zod schemas so apps that only need these do not bundle zod.
 */

export const PAYMENT_KINDS = ['entry_fee', 'dues'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_METHODS = ['proof', 'in_person'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'] as const;
export const PROOF_MAX_BYTES = 8 * 1024 * 1024;

/** Profile and car photos. Clients resize them before upload (see the web app's lib/photos). */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CAR_PHOTOS_MAX = 4;

/** A member counts as online when the app talked to the server within this delay. */
export const ONLINE_WINDOW_MINUTES = 5;

/**
 * Push notifications for the club chat, chosen by each member:
 * - off:      none
 * - mentions: when someone mentions them (@Name) or replies to them
 * - all:      every message too, grouped (at most one every CHAT_PUSH_INTERVAL_MINUTES)
 */
export const CHAT_NOTIFICATION_MODES = ['off', 'mentions', 'all'] as const;
export type ChatNotificationMode = (typeof CHAT_NOTIFICATION_MODES)[number];
export const CHAT_PUSH_INTERVAL_MINUTES = 3;
export const CHAT_MESSAGE_MAX_LENGTH = 1_000;

export const MEMBER_FILTERS = ['all', 'pending', 'active', 'due', 'expired', 'suspended', 'banned', 'staff'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/** Places the club shows on the map (added by admins). Labels are English source texts. */
export const CLUB_PLACE_CATEGORIES = ['spot', 'garage', 'partner', 'wash', 'other'] as const;
export type ClubPlaceCategory = (typeof CLUB_PLACE_CATEGORIES)[number];
export const CLUB_PLACE_CATEGORY_LABELS: Record<ClubPlaceCategory, string> = {
  spot: 'Meeting spot',
  garage: 'Garage',
  partner: 'Partner',
  wash: 'Car wash',
  other: 'Other',
};

/**
 * Red zones: circles where members' positions are never shown (residential
 * streets, sensitive places). Radius in metres.
 */
export const RED_ZONE_RADIUS = { min: 50, max: 5_000, default: 300 } as const;

export const MEETUP_VISIBILITIES = ['public', 'secret', 'staff'] as const;
export type MeetupVisibility = (typeof MEETUP_VISIBILITIES)[number];

export const MEETUP_VISIBILITY_LABELS: Record<MeetupVisibility, string> = {
  public: 'Public',
  secret: 'Secret',
  staff: 'Organizers',
};

export const MEETUP_AUDIENCE_LABELS: Record<MeetupVisibility, string> = {
  public: 'Everyone',
  secret: 'Active members',
  staff: 'Organizers & staff',
};

/**
 * - visible:       the meeting point is shown
 * - locked:        secret meetup, before the reveal time
 * - rsvp_required: secret meetup after the reveal time, but this member has not confirmed
 * - not_set:       no meeting point yet
 */
export const LOCATION_STATUSES = ['visible', 'locked', 'rsvp_required', 'not_set'] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const MEETUP_STATUSES = ['upcoming', 'ongoing', 'past', 'cancelled'] as const;
export type MeetupStatus = (typeof MEETUP_STATUSES)[number];

/** A meetup counts as ongoing (still listed as upcoming) for this long after it starts. */
export const MEETUP_ONGOING_HOURS = 6;

export const ANNOUNCEMENT_AUDIENCES = ['all', 'staff'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
