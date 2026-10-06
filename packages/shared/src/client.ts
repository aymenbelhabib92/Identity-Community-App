/**
 * Typed client for the Identity API, shared by the web app and the future
 * React Native app. It only relies on `fetch` and `FormData`, which both
 * platforms provide.
 */
import type {
  AdminMember,
  AdminMembership,
  AdminMembersQuery,
  AdminOverview,
  AdminPayment,
  AdminPaymentsQuery,
  Announcement,
  AnnouncementCreateBody,
  Attendee,
  AuthResponse,
  BanBody,
  ChangePasswordBody,
  ChatListQuery,
  ChatMessage,
  ChatMessageList,
  ChatPostBody,
  ChatReader,
  ChatUnread,
  ClubPlace,
  ClubPlaceBody,
  ClubPlaceUpdate,
  ErrorResponse,
  LocationUpdateBody,
  LoginBody,
  MapMeetup,
  MapMember,
  Meetup,
  MeetupCreateBody,
  MeetupListQuery,
  MeetupUpdateBody,
  MemberProfile,
  MemberRef,
  Membership,
  MyLocation,
  NotificationList,
  PassToken,
  PassVerification,
  PasswordReset,
  Payment,
  Place,
  PushKey,
  PushSubscriptionBody,
  PushTestResult,
  RecordPaymentBody,
  RedZone,
  RedZoneBody,
  RedZoneUpdate,
  RegisterBody,
  ReviewPaymentBody,
  UpdateMeBody,
  UpdateMemberBody,
  User,
} from './api';
import { t } from './i18n';
import type { ClubInfo, ClubSettings, ClubSettingsUpdate } from './settings';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field messages of a VALIDATION error, keyed by field name. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.code === 'VALIDATION' && Array.isArray(this.details)) {
      for (const issue of this.details as { path?: unknown[]; message?: string }[]) {
        const field = issue.path?.[0];
        if (typeof field === 'string' && issue.message && !out[field]) out[field] = issue.message;
      }
    }
    return out;
  }
}

export interface ApiClientOptions {
  /** e.g. "/api/v1" on the web, "https://club.example.com/api/v1" on mobile. */
  baseUrl: string;
  getToken?: () => string | null | undefined;
  /** Sent as Accept-Language: error messages and labels come back in this language. */
  getLanguage?: () => string | null | undefined;
  /**
   * An identifier of this installation of the app, sent as X-Device-Id: the
   * devices of a member banned for life cannot sign in or register again.
   */
  getDeviceId?: () => string | null | undefined;
  /** Called when an authenticated request is rejected (expired or revoked token). */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;
type Ok = { ok: true };
type Items<T> = { items: T[] };

const id = (value: string) => encodeURIComponent(value);

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function send(
    method: string,
    path: string,
    init: { body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal } = {},
  ): Promise<Response> {
    let url = baseUrl + path;
    if (init.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const language = options.getLanguage?.();
    if (language) headers['Accept-Language'] = language;
    const device = options.getDeviceId?.();
    if (device) headers['X-Device-Id'] = device;

    let body: BodyInit | undefined;
    if (init.form) {
      body = init.form;
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    let response: Response;
    try {
      response = await doFetch(url, { method, headers, body, signal: init.signal });
    } catch (err) {
      if (init.signal?.aborted) throw err;
      throw new ApiError(0, 'NETWORK', t('Cannot reach the server. Check your connection.'));
    }

    if (!response.ok) {
      let payload: Partial<ErrorResponse> | undefined;
      try {
        payload = (await response.json()) as Partial<ErrorResponse>;
      } catch {
        payload = undefined;
      }
      if (response.status === 401 && token) options.onUnauthorized?.();
      throw new ApiError(
        response.status,
        payload?.error?.code ?? `HTTP_${response.status}`,
        payload?.error?.message ?? (response.statusText || t('Request failed')),
        payload?.error?.details,
      );
    }
    return response;
  }

  async function json<T>(method: string, path: string, init?: { body?: unknown; query?: Query; form?: FormData }) {
    const response = await send(method, path, init);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const get = <T>(path: string, query?: Query) => json<T>('GET', path, { query });
  const blob = async (path: string) => (await send('GET', path)).blob();

  return {
    auth: {
      register: (body: RegisterBody) => json<AuthResponse>('POST', '/auth/register', { body }),
      login: (body: LoginBody) => json<AuthResponse>('POST', '/auth/login', { body }),
      /** Revokes every token issued so far, on all devices. */
      logoutEverywhere: () => json<Ok>('POST', '/auth/logout-all'),
    },

    me: {
      get: () => get<User>('/me'),
      update: (body: UpdateMeBody) => json<User>('PATCH', '/me', { body }),
      /** Signs out other devices; returns a fresh token for this one. */
      changePassword: (body: ChangePasswordBody) => json<AuthResponse>('POST', '/me/password', { body }),
      /** Multipart form with a `file` part (JPG, PNG or WEBP). Replaces the current photo. */
      setAvatar: (form: FormData) => json<User>('PUT', '/me/avatar', { form }),
      removeAvatar: () => json<User>('DELETE', '/me/avatar'),
      /** Multipart form with a `file` part: the wide photo at the top of the profile. */
      setCover: (form: FormData) => json<User>('PUT', '/me/cover', { form }),
      removeCover: () => json<User>('DELETE', '/me/cover'),
      /** Multipart form with a `file` part. Up to CAR_PHOTOS_MAX photos. */
      addCarPhoto: (form: FormData) => json<User>('POST', '/me/car-photos', { form }),
      removeCarPhoto: (photoId: string) => json<User>('DELETE', `/me/car-photos/${id(photoId)}`),
      location: () => get<MyLocation>('/me/location'),
      setLocationSharing: (enabled: boolean) => json<MyLocation>('PUT', '/me/location-sharing', { body: { enabled } }),
      updateLocation: (body: LocationUpdateBody) => json<MyLocation>('PUT', '/me/location', { body }),
    },

    photos: {
      /** A member's profile or car photo. */
      get: (photoId: string) => blob(`/photos/${id(photoId)}`),
    },

    members: {
      /** Another member's profile (active members only). */
      get: (memberId: string) => get<MemberProfile>(`/members/${id(memberId)}`),
    },

    club: {
      /** Public: fees shown on the join screen. */
      info: () => get<ClubInfo>('/club/info'),
      settings: () => get<ClubSettings>('/club/settings'),
    },

    membership: {
      get: () => get<Membership>('/membership'),
      /** Multipart form: kind, method, periods?, note?, file? (see `paymentFormSchema`). */
      submitPayment: (form: FormData) => json<Payment>('POST', '/payments', { form }),
      cancelPayment: (paymentId: string) => json<Ok>('DELETE', `/payments/${id(paymentId)}`),
      proof: (paymentId: string) => blob(`/payments/${id(paymentId)}/proof`),
    },

    meetups: {
      list: (query?: MeetupListQuery) => get<Items<Meetup>>('/meetups', query),
      get: (meetupId: string) => get<Meetup>(`/meetups/${id(meetupId)}`),
      create: (body: MeetupCreateBody) => json<Meetup>('POST', '/meetups', { body }),
      update: (meetupId: string, body: MeetupUpdateBody) => json<Meetup>('PATCH', `/meetups/${id(meetupId)}`, { body }),
      cancel: (meetupId: string) => json<Meetup>('POST', `/meetups/${id(meetupId)}/cancel`),
      rsvp: (meetupId: string) => json<Meetup>('PUT', `/meetups/${id(meetupId)}/rsvp`),
      cancelRsvp: (meetupId: string) => json<Meetup>('DELETE', `/meetups/${id(meetupId)}/rsvp`),
      attendees: (meetupId: string) => get<Items<Attendee>>(`/meetups/${id(meetupId)}/attendees`),
    },

    announcements: {
      list: (limit?: number) => get<Items<Announcement>>('/announcements', { limit }),
      create: (body: AnnouncementCreateBody) => json<Announcement>('POST', '/announcements', { body }),
      remove: (announcementId: string) => json<Ok>('DELETE', `/announcements/${id(announcementId)}`),
    },

    notifications: {
      list: () => get<NotificationList>('/notifications'),
      markAllRead: () => json<Ok>('POST', '/notifications/read-all'),
    },

    chat: {
      messages: (query?: ChatListQuery) => get<ChatMessageList>('/chat/messages', query),
      send: (body: ChatPostBody) => json<ChatMessage>('POST', '/chat/messages', { body }),
      remove: (messageId: string) => json<ChatMessage>('DELETE', `/chat/messages/${id(messageId)}`),
      /** Marks everything as read (the Chat tab badge). */
      read: () => json<ChatUnread>('POST', '/chat/read'),
      unread: () => get<ChatUnread>('/chat/unread'),
      /** Members who can be mentioned with @Name. */
      members: () => get<Items<MemberRef>>('/chat/members'),
      /** How far each member has read the chat ("Seen by"). */
      readers: () => get<Items<ChatReader>>('/chat/readers'),
      /**
       * Live messages as Server-Sent Events (`message`, `deleted`, `read`) for as long as
       * the response body is read. Abort `signal` to close it.
       */
      stream: (signal: AbortSignal) => send('GET', '/chat/stream', { signal }),
    },

    push: {
      key: () => get<PushKey>('/push/key'),
      /** Registers this device for push notifications (moves it to this account if needed). */
      subscribe: (body: PushSubscriptionBody) => json<Ok>('PUT', '/push/subscription', { body }),
      unsubscribe: (endpoint: string) => json<Ok>('DELETE', '/push/subscription', { body: { endpoint } }),
      /** Sends a test notification to every device of the signed-in member. */
      test: () => json<PushTestResult>('POST', '/push/test'),
    },

    map: {
      members: () => get<Items<MapMember>>('/map/members'),
      meetups: () => get<Items<MapMeetup>>('/map/meetups'),
      places: () => get<Items<ClubPlace>>('/map/places'),
      /** Where members' positions are never shown. */
      zones: () => get<Items<RedZone>>('/map/zones'),
    },

    geo: {
      search: (q: string) => get<Items<Place>>('/geo/search', { q }),
    },

    pass: {
      token: () => get<PassToken>('/pass/token'),
      verify: (token: string) => json<PassVerification>('POST', '/pass/verify', { body: { token } }),
    },

    admin: {
      overview: () => get<AdminOverview>('/admin/overview'),
      payments: (query?: AdminPaymentsQuery) => get<Items<AdminPayment>>('/admin/payments', query),
      reviewPayment: (paymentId: string, body: ReviewPaymentBody) =>
        json<AdminPayment>('POST', `/admin/payments/${id(paymentId)}/review`, { body }),
      members: (query?: AdminMembersQuery) => get<Items<AdminMember>>('/admin/members', query),
      member: (memberId: string) => get<AdminMembership>(`/admin/members/${id(memberId)}`),
      updateMember: (memberId: string, body: UpdateMemberBody) =>
        json<AdminMember>('PATCH', `/admin/members/${id(memberId)}`, { body }),
      recordPayment: (memberId: string, body: RecordPaymentBody) =>
        json<Payment>('POST', `/admin/members/${id(memberId)}/payments`, { body }),
      resetPassword: (memberId: string) =>
        json<PasswordReset>('POST', `/admin/members/${id(memberId)}/reset-password`),
      /** 3, 7, then 15 days (see BAN_DAYS), or for life with `permanent`. */
      ban: (memberId: string, body: BanBody) => json<AdminMember>('POST', `/admin/members/${id(memberId)}/ban`, { body }),
      unban: (memberId: string) => json<AdminMember>('POST', `/admin/members/${id(memberId)}/unban`),
      createPlace: (body: ClubPlaceBody) => json<ClubPlace>('POST', '/admin/places', { body }),
      updatePlace: (placeId: string, body: ClubPlaceUpdate) =>
        json<ClubPlace>('PATCH', `/admin/places/${id(placeId)}`, { body }),
      removePlace: (placeId: string) => json<Ok>('DELETE', `/admin/places/${id(placeId)}`),
      createZone: (body: RedZoneBody) => json<RedZone>('POST', '/admin/zones', { body }),
      updateZone: (zoneId: string, body: RedZoneUpdate) => json<RedZone>('PATCH', `/admin/zones/${id(zoneId)}`, { body }),
      removeZone: (zoneId: string) => json<Ok>('DELETE', `/admin/zones/${id(zoneId)}`),
      settings: () => get<ClubSettings>('/admin/settings'),
      updateSettings: (body: ClubSettingsUpdate) => json<ClubSettings>('PATCH', '/admin/settings', { body }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
