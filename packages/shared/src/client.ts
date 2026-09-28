/**
 * Typed client for the Identity API, shared by the web app and the future
 * React Native app. It only relies on `fetch` and `FormData`, which both
 * platforms provide.
 */
import type {
  AdminMember,
  AdminMembersQuery,
  AdminOverview,
  AdminPayment,
  AdminPaymentsQuery,
  Announcement,
  AnnouncementCreateBody,
  Attendee,
  AuthResponse,
  ChangePasswordBody,
  ErrorResponse,
  LocationUpdateBody,
  LoginBody,
  MapMeetup,
  MapMember,
  Meetup,
  MeetupCreateBody,
  MeetupListQuery,
  MeetupUpdateBody,
  Membership,
  MyLocation,
  NotificationList,
  PassToken,
  PassVerification,
  PasswordReset,
  Payment,
  Place,
  RecordPaymentBody,
  RegisterBody,
  ReviewPaymentBody,
  UpdateMeBody,
  UpdateMemberBody,
  User,
} from './api';
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
    init: { body?: unknown; query?: Query; form?: FormData } = {},
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

    let body: BodyInit | undefined;
    if (init.form) {
      body = init.form;
    } else if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    let response: Response;
    try {
      response = await doFetch(url, { method, headers, body });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.');
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
        payload?.error?.message ?? (response.statusText || 'Request failed'),
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
      location: () => get<MyLocation>('/me/location'),
      setLocationSharing: (enabled: boolean) => json<MyLocation>('PUT', '/me/location-sharing', { body: { enabled } }),
      updateLocation: (body: LocationUpdateBody) => json<MyLocation>('PUT', '/me/location', { body }),
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

    map: {
      members: () => get<Items<MapMember>>('/map/members'),
      meetups: () => get<Items<MapMeetup>>('/map/meetups'),
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
      member: (memberId: string) => get<Membership>(`/admin/members/${id(memberId)}`),
      updateMember: (memberId: string, body: UpdateMemberBody) =>
        json<AdminMember>('PATCH', `/admin/members/${id(memberId)}`, { body }),
      recordPayment: (memberId: string, body: RecordPaymentBody) =>
        json<Payment>('POST', `/admin/members/${id(memberId)}/payments`, { body }),
      resetPassword: (memberId: string) =>
        json<PasswordReset>('POST', `/admin/members/${id(memberId)}/reset-password`),
      settings: () => get<ClubSettings>('/admin/settings'),
      updateSettings: (body: ClubSettingsUpdate) => json<ClubSettings>('PATCH', '/admin/settings', { body }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
