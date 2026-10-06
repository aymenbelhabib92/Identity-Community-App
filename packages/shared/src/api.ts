/**
 * The API contract. The server validates requests and serialises responses with
 * these schemas (and publishes them as OpenAPI at /api/docs); clients derive
 * their types from them. Lists are wrapped in `{ items }` so pagination can be
 * added without breaking clients.
 */
import { z } from 'zod';
import {
  ANNOUNCEMENT_AUDIENCES,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_NOTIFICATION_MODES,
  CLUB_PLACE_CATEGORIES,
  LOCATION_STATUSES,
  MEETUP_STATUSES,
  MEETUP_VISIBILITIES,
  MEMBER_FILTERS,
  PAYMENT_KINDS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  RED_ZONE_RADIUS,
} from './constants';
import { LANGUAGES } from './i18n';
import { MEMBER_STATUSES, MEMBERSHIP_STATES } from './membership';
import { BIO_MAX_LENGTH } from './people';
import { PERMISSIONS, ROLES, type Permission } from './roles';

// ─── Common ──────────────────────────────────────────────────────────────────

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const timestampSchema = z.string().describe('ISO 8601 timestamp');
export const idSchema = z.uuid();
export const idParamsSchema = z.object({ id: idSchema });

export const roleSchema = z.enum(ROLES);
export const permissionSchema = z.enum(Object.keys(PERMISSIONS) as [Permission, ...Permission[]]);
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export const membershipStateSchema = z.enum(MEMBERSHIP_STATES);

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const items = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

// ─── Users & auth ────────────────────────────────────────────────────────────

export const languageSchema = z.enum(LANGUAGES);

/** Photos are fetched with `GET /photos/{id}` (signed-in members only). */
const photoRef = idSchema.nullable().describe('Photo id, see GET /photos/{id}');
const carPhotoRefs = z.array(idSchema).describe('Photo ids, main photo first');

export const userSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  phone: z.string(),
  car: z.string().nullable(),
  avatar: photoRef,
  /** Wide photo at the top of the profile (and of Home). */
  cover: photoRef,
  carPhotos: carPhotoRefs,
  /** Short presentation (BIO_MAX_LENGTH). */
  bio: z.string().nullable(),
  /** Instagram name, without "@". */
  instagram: z.string().nullable(),
  /** Preferred language; null until the member's app has set it. */
  language: languageSchema.nullable(),
  /** Used the app within the last few minutes (see ONLINE_WINDOW_MINUTES). */
  online: z.boolean(),
  /** Push notifications for the club chat (see CHAT_NOTIFICATION_MODES). */
  chatNotifications: z.enum(CHAT_NOTIFICATION_MODES),
  /** The ban running now (chat, map and meetups closed until `until`), or null. */
  ban: z
    .object({
      /** null: banned for life. */
      until: timestampSchema.nullable(),
      reason: z.string().nullable(),
    })
    .nullable(),
  role: roleSchema,
  status: memberStatusSchema,
  state: membershipStateSchema,
  /** Map, secret meetups and other member-only content. */
  hasAccess: z.boolean(),
  badgeNumber: z.number().int().nullable(),
  paidUntil: isoDateSchema.nullable(),
  approvedAt: timestampSchema.nullable(),
  locationSharing: z.boolean(),
  permissions: z.array(permissionSchema),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/** How members appear to each other (hosts, authors, reviewers). */
export const memberRefSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  role: roleSchema,
  avatar: photoRef,
  online: z.boolean(),
});
export type MemberRef = z.infer<typeof memberRefSchema>;

/** A member's profile as other members see it: no phone, no membership state. */
export const memberProfileSchema = memberRefSchema.extend({
  cover: photoRef,
  bio: z.string().nullable(),
  /** Instagram name, without "@". */
  instagram: z.string().nullable(),
  car: z.string().nullable(),
  carPhotos: carPhotoRefs,
  /** When the membership was first confirmed. */
  memberSince: timestampSchema.nullable(),
});
export type MemberProfile = z.infer<typeof memberProfileSchema>;

const fullNameInput = z.string().trim().min(2, 'Enter your full name').max(80);
const phoneInput = z.string().trim().min(6, 'Enter a valid phone number').max(24);
const passwordInput = z.string().min(8, 'Use at least 8 characters').max(128);
const carInput = z.string().trim().max(120);

export const registerBodySchema = z.object({
  fullName: fullNameInput,
  phone: phoneInput,
  password: passwordInput,
  car: carInput.optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  phone: phoneInput,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const authResponseSchema = z.object({ token: z.string(), user: userSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const updateMeBodySchema = z.object({
  fullName: fullNameInput.optional(),
  car: carInput.nullable().optional(),
  /** Empty or null removes it. */
  bio: z.string().trim().max(BIO_MAX_LENGTH, 'Keep it short (150 characters max)').nullable().optional(),
  /** An Instagram name ("@name" or "name") or a link to the profile; empty or null removes it. */
  instagram: z.string().trim().max(200).nullable().optional(),
  language: languageSchema.optional(),
  chatNotifications: z.enum(CHAT_NOTIFICATION_MODES).optional(),
});
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordInput,
});
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;

// ─── Membership & payments ───────────────────────────────────────────────────

export const paymentSchema = z.object({
  id: idSchema,
  kind: z.enum(PAYMENT_KINDS),
  /** "Entry fee & badge", "Q4 2026 dues" */
  label: z.string(),
  /** Millimes. */
  amount: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  periodStart: isoDateSchema.nullable(),
  periodEnd: isoDateSchema.nullable(),
  periodCount: z.number().int().nullable(),
  note: z.string().nullable(),
  reviewNote: z.string().nullable(),
  hasProof: z.boolean(),
  createdAt: timestampSchema,
  reviewedAt: timestampSchema.nullable(),
  reviewedBy: memberRefSchema.nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const duesOptionSchema = z.object({
  periods: z.number().int(),
  label: z.string(),
  amount: z.number().int(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
});
export type DuesOption = z.infer<typeof duesOptionSchema>;

export const membershipSchema = z.object({
  member: userSchema,
  fees: z.object({
    currency: z.string(),
    entryFee: z.number().int(),
    duesAmount: z.number().int(),
    duesPeriodMonths: z.number().int(),
    yearlyDues: z.number().int(),
  }),
  entryFeeStatus: z.enum(['unpaid', 'pending', 'paid']),
  /** What can be paid next (1 period, 2 periods, … up to a year). Empty until the entry fee is verified. */
  duesOptions: z.array(duesOptionSchema),
  payments: z.array(paymentSchema),
  paymentInstructions: z.string(),
});
export type Membership = z.infer<typeof membershipSchema>;

/** A member's file for the admins: their membership, plus bans so far and devices used. */
export const adminMembershipSchema = membershipSchema.extend({
  /** Lifted bans excepted: the next one lasts banDays(bans + 1). */
  bans: z.number().int(),
  devices: z.number().int(),
});
export type AdminMembership = z.infer<typeof adminMembershipSchema>;

/** Text fields of the multipart payment form (the proof is the `file` part). */
export const paymentFormSchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  periods: z.coerce.number().int().min(1).max(12).optional(),
  method: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500).optional(),
});
export type PaymentForm = z.infer<typeof paymentFormSchema>;

// ─── Admin ───────────────────────────────────────────────────────────────────

export const memberSummarySchema = z.object({
  id: idSchema,
  fullName: z.string(),
  phone: z.string(),
  avatar: photoRef,
  badgeNumber: z.number().int().nullable(),
  state: membershipStateSchema,
});

export const adminPaymentSchema = paymentSchema.extend({ member: memberSummarySchema });
export type AdminPayment = z.infer<typeof adminPaymentSchema>;
export const adminPaymentListSchema = items(adminPaymentSchema);

export const adminPaymentsQuerySchema = z.object({
  status: z.enum([...PAYMENT_STATUSES, 'all']).default('pending'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type AdminPaymentsQuery = Partial<z.infer<typeof adminPaymentsQuerySchema>>;

export const reviewPaymentBodySchema = z.object({
  decision: z.enum(['verify', 'reject']),
  note: z.string().trim().max(500).optional(),
});
export type ReviewPaymentBody = z.infer<typeof reviewPaymentBodySchema>;

/** A payment received in person, recorded (and verified) directly by the treasurer. */
export const recordPaymentBodySchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  periods: z.number().int().min(1).max(12).optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentBody = z.infer<typeof recordPaymentBodySchema>;

export const adminMembersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  filter: z.enum(MEMBER_FILTERS).default('all'),
});
export type AdminMembersQuery = Partial<z.infer<typeof adminMembersQuerySchema>>;

export const adminMemberSchema = userSchema.extend({
  pendingPayments: z.number().int(),
  /** Bans so far (lifted ones excepted): the next one lasts banDays(bans + 1). */
  bans: z.number().int(),
  /** Devices the member used the app on (see X-Device-Id). */
  devices: z.number().int(),
});
export type AdminMember = z.infer<typeof adminMemberSchema>;
export const adminMemberListSchema = items(adminMemberSchema);

export const banBodySchema = z.object({
  /** For life: signed out everywhere, sign-in refused, their devices blocked. */
  permanent: z.boolean().default(false),
  /** Shown to the member. */
  reason: z.string().trim().max(300).optional(),
});
export type BanBody = z.input<typeof banBodySchema>;

export const updateMemberBodySchema = z
  .object({
    role: roleSchema.optional(),
    status: memberStatusSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'Nothing to update');
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>;

export const passwordResetSchema = z.object({
  /** Shown once to the admin, who hands it to the member. */
  temporaryPassword: z.string(),
});
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export const adminOverviewSchema = z.object({
  totalMembers: z.number().int(),
  pendingMembers: z.number().int(),
  activeMembers: z.number().int(),
  dueMembers: z.number().int(),
  expiredMembers: z.number().int(),
  suspendedMembers: z.number().int(),
  bannedMembers: z.number().int(),
  pendingPayments: z.number().int(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ─── Meetups ─────────────────────────────────────────────────────────────────

export const meetupLocationSchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type MeetupLocation = z.infer<typeof meetupLocationSchema>;

export const meetupSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(MEETUP_VISIBILITIES),
  status: z.enum(MEETUP_STATUSES),
  startsAt: timestampSchema,
  revealAt: timestampSchema,
  revealHoursBefore: z.number().int(),
  /** Null whenever the meeting point is hidden from this member. */
  location: meetupLocationSchema.nullable(),
  locationStatus: z.enum(LOCATION_STATUSES),
  rules: z.string().nullable(),
  host: memberRefSchema.nullable(),
  goingCount: z.number().int(),
  going: z.boolean(),
  canEdit: z.boolean(),
  canRsvp: z.boolean(),
  createdAt: timestampSchema,
});
export type Meetup = z.infer<typeof meetupSchema>;
export const meetupListSchema = items(meetupSchema);

export const meetupListQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MeetupListQuery = Partial<z.infer<typeof meetupListQuerySchema>>;

const meetupFields = {
  title: z.string().trim().min(3, 'Title is too short').max(80),
  description: z.string().trim().max(2_000).nullable(),
  visibility: z.enum(MEETUP_VISIBILITIES),
  startsAt: z.iso.datetime({ offset: true }),
  revealHoursBefore: z.number().int().min(0).max(72),
  locationName: z.string().trim().max(120).nullable(),
  address: z.string().trim().max(200).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  rules: z.string().trim().max(2_000).nullable(),
};

const coordinatesTogether = {
  check: (v: { lat?: number | null; lng?: number | null }) => (v.lat == null) === (v.lng == null),
  message: { message: 'Latitude and longitude go together', path: ['lat'] },
};

export const meetupCreateSchema = z
  .object({
    title: meetupFields.title,
    visibility: meetupFields.visibility,
    startsAt: meetupFields.startsAt,
    description: meetupFields.description.optional(),
    revealHoursBefore: meetupFields.revealHoursBefore.optional(),
    locationName: meetupFields.locationName.optional(),
    address: meetupFields.address.optional(),
    lat: meetupFields.lat.optional(),
    lng: meetupFields.lng.optional(),
    rules: meetupFields.rules.optional(),
  })
  .refine(coordinatesTogether.check, coordinatesTogether.message);
export type MeetupCreateBody = z.infer<typeof meetupCreateSchema>;

export const meetupUpdateSchema = z
  .object(meetupFields)
  .partial()
  .refine(coordinatesTogether.check, coordinatesTogether.message);
export type MeetupUpdateBody = z.infer<typeof meetupUpdateSchema>;

export const attendeeSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  role: roleSchema,
  avatar: photoRef,
  online: z.boolean(),
  badgeNumber: z.number().int().nullable(),
  car: z.string().nullable(),
  rsvpAt: timestampSchema,
});
export type Attendee = z.infer<typeof attendeeSchema>;
export const attendeeListSchema = items(attendeeSchema);

// ─── Announcements ───────────────────────────────────────────────────────────

export const announcementSchema = z.object({
  id: idSchema,
  body: z.string(),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES),
  author: memberRefSchema.nullable(),
  canDelete: z.boolean(),
  createdAt: timestampSchema,
});
export type Announcement = z.infer<typeof announcementSchema>;
export const announcementListSchema = items(announcementSchema);

export const announcementCreateSchema = z.object({
  body: z.string().trim().min(3, 'Write a few words').max(1_000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default('all'),
});
export type AnnouncementCreateBody = z.input<typeof announcementCreateSchema>;

// ─── Notifications ───────────────────────────────────────────────────────────

export const notificationSchema = z.object({
  id: idSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** In-app path, e.g. "/meetups/…". */
  link: z.string().nullable(),
  read: z.boolean(),
  createdAt: timestampSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unread: z.number().int(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

// ─── Club chat ───────────────────────────────────────────────────────────────

export const chatMessageSchema = z.object({
  id: idSchema,
  author: memberRefSchema,
  /** Empty once deleted. */
  body: z.string(),
  /** Members mentioned with @Name. */
  mentions: z.array(idSchema),
  replyTo: z
    .object({
      id: idSchema,
      authorName: z.string(),
      /** Start of the message replied to; empty if it was deleted. */
      excerpt: z.string(),
    })
    .nullable(),
  deleted: z.boolean(),
  createdAt: timestampSchema,
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessageListSchema = z.object({
  /** Oldest first. */
  items: z.array(chatMessageSchema),
  /** Older messages exist (load them with `before`). */
  hasMore: z.boolean(),
});
export type ChatMessageList = z.infer<typeof chatMessageListSchema>;

export const chatListQuerySchema = z.object({
  /** Messages sent before this time (scrolling back), or after it (catching up after a reconnection). */
  before: timestampSchema.optional(),
  after: timestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatListQuery = Partial<z.infer<typeof chatListQuerySchema>>;

export const chatPostBodySchema = z.object({
  body: z.string().trim().min(1, 'Write a message').max(CHAT_MESSAGE_MAX_LENGTH),
  replyToId: idSchema.optional(),
  mentions: z.array(idSchema).max(20).optional(),
});
export type ChatPostBody = z.infer<typeof chatPostBodySchema>;

export const chatUnreadSchema = z.object({ unread: z.number().int() });
export type ChatUnread = z.infer<typeof chatUnreadSchema>;

/** Members who can be mentioned. */
export const chatMemberListSchema = items(memberRefSchema);

/**
 * How far a member has read the chat: the last time they had it open. They have
 * seen every message sent before `readAt` ("Seen by" under the messages).
 */
export const chatReaderSchema = z.object({ member: memberRefSchema, readAt: timestampSchema });
export type ChatReader = z.infer<typeof chatReaderSchema>;
export const chatReaderListSchema = items(chatReaderSchema);

// ─── Push notifications ──────────────────────────────────────────────────────

/** VAPID public key, for `pushManager.subscribe({ applicationServerKey })`. */
export const pushKeySchema = z.object({ publicKey: z.string() });
export type PushKey = z.infer<typeof pushKeySchema>;

const pushEndpoint = z.url({ protocol: /^https$/ }).max(2_000);

/** A browser's PushSubscription, as given by `subscription.toJSON()`. */
export const pushSubscriptionBodySchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(8).max(100),
  }),
});
export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBodySchema>;

export const pushUnsubscribeBodySchema = z.object({ endpoint: pushEndpoint });

export const pushTestResultSchema = z.object({
  /** Devices the test notification was handed to. */
  devices: z.number().int(),
});
export type PushTestResult = z.infer<typeof pushTestResultSchema>;

// ─── Map & location ──────────────────────────────────────────────────────────

export const locationUpdateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional(),
});
export type LocationUpdateBody = z.infer<typeof locationUpdateSchema>;

export const locationSharingBodySchema = z.object({ enabled: z.boolean() });

export const myLocationSchema = z.object({
  sharing: z.boolean(),
  /** Approximate position as other members see it. */
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  updatedAt: timestampSchema.nullable(),
  /** The member is in this red zone: their position is hidden until they leave it. */
  redZone: z.object({ id: idSchema, name: z.string() }).nullable(),
});
export type MyLocation = z.infer<typeof myLocationSchema>;

// ─── Club places & red zones ─────────────────────────────────────────────────

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

/** A place the club shows on the map: meeting spot, partner garage… */
export const clubPlaceSchema = z.object({
  id: idSchema,
  name: z.string(),
  category: z.enum(CLUB_PLACE_CATEGORIES),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type ClubPlace = z.infer<typeof clubPlaceSchema>;
export const clubPlaceListSchema = items(clubPlaceSchema);

export const clubPlaceBodySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80),
  category: z.enum(CLUB_PLACE_CATEGORIES),
  description: z.string().trim().max(500).nullable().optional(),
  lat: latSchema,
  lng: lngSchema,
});
export type ClubPlaceBody = z.infer<typeof clubPlaceBodySchema>;
export const clubPlaceUpdateSchema = clubPlaceBodySchema.partial();
export type ClubPlaceUpdate = z.infer<typeof clubPlaceUpdateSchema>;

/** A circle where members' positions are never shown; visible to every member. */
export const redZoneSchema = z.object({
  id: idSchema,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  /** Metres. */
  radius: z.number().int(),
});
export type RedZone = z.infer<typeof redZoneSchema>;
export const redZoneListSchema = items(redZoneSchema);

export const redZoneBodySchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(80),
  lat: latSchema,
  lng: lngSchema,
  radius: z.number().int().min(RED_ZONE_RADIUS.min).max(RED_ZONE_RADIUS.max),
});
export type RedZoneBody = z.infer<typeof redZoneBodySchema>;
export const redZoneUpdateSchema = redZoneBodySchema.partial();
export type RedZoneUpdate = z.infer<typeof redZoneUpdateSchema>;

export const mapMemberSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  role: roleSchema,
  avatar: photoRef,
  online: z.boolean(),
  car: z.string().nullable(),
  carPhotos: carPhotoRefs,
  lat: z.number(),
  lng: z.number(),
  updatedAt: timestampSchema,
});
export type MapMember = z.infer<typeof mapMemberSchema>;
export const mapMemberListSchema = items(mapMemberSchema);

export const mapMeetupSchema = z.object({
  id: idSchema,
  title: z.string(),
  visibility: z.enum(MEETUP_VISIBILITIES),
  startsAt: timestampSchema,
  locationName: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});
export type MapMeetup = z.infer<typeof mapMeetupSchema>;
export const mapMeetupListSchema = items(mapMeetupSchema);

export const geoSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(120) });

export const placeSchema = z.object({
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type Place = z.infer<typeof placeSchema>;
export const placeListSchema = items(placeSchema);

// ─── Pass (QR check-in) ──────────────────────────────────────────────────────

export const passTokenSchema = z.object({
  token: z.string(),
  expiresAt: timestampSchema,
});
export type PassToken = z.infer<typeof passTokenSchema>;

/** Sent in the body rather than the URL so pass tokens never end up in access logs. */
export const passVerifyBodySchema = z.object({ token: z.string().min(10).max(2_000) });

export const passVerificationSchema = z.object({
  valid: z.boolean(),
  reason: z.string().nullable(),
  member: z
    .object({
      id: idSchema,
      fullName: z.string(),
      role: roleSchema,
      avatar: photoRef,
      badgeNumber: z.number().int().nullable(),
      state: membershipStateSchema,
      paidUntil: isoDateSchema.nullable(),
      car: z.string().nullable(),
      carPhotos: carPhotoRefs,
    })
    .nullable(),
});
export type PassVerification = z.infer<typeof passVerificationSchema>;
