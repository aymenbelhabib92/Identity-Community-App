import type { AdminMembersQuery, MeetupListQuery } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const keys = {
  me: ['me'] as const,
  myLocation: ['me', 'location'] as const,
  membership: ['membership'] as const,
  clubInfo: ['club', 'info'] as const,
  clubSettings: ['club', 'settings'] as const,
  meetups: ['meetups'] as const,
  meetupList: (scope: MeetupListQuery['scope']) => ['meetups', 'list', scope] as const,
  meetup: (id: string) => ['meetups', 'detail', id] as const,
  attendees: (id: string) => ['meetups', 'attendees', id] as const,
  announcements: ['announcements'] as const,
  notifications: ['notifications'] as const,
  mapMembers: ['map', 'members'] as const,
  mapMeetups: ['map', 'meetups'] as const,
  admin: ['admin'] as const,
  adminOverview: ['admin', 'overview'] as const,
  adminPayments: (status: string) => ['admin', 'payments', status] as const,
  adminMembers: (query: AdminMembersQuery) => ['admin', 'members', query] as const,
  adminMember: (id: string) => ['admin', 'member', id] as const,
};

export const useMembership = (enabled = true) =>
  useQuery({ queryKey: keys.membership, queryFn: api.membership.get, enabled });

export const useClubInfo = () =>
  useQuery({ queryKey: keys.clubInfo, queryFn: api.club.info, staleTime: 5 * 60_000 });

export const useClubSettings = () =>
  useQuery({ queryKey: keys.clubSettings, queryFn: api.club.settings, staleTime: 5 * 60_000 });

export const useMeetups = (scope: 'upcoming' | 'past') =>
  useQuery({ queryKey: keys.meetupList(scope), queryFn: () => api.meetups.list({ scope }) });

export const useMeetup = (id: string) =>
  useQuery({
    queryKey: keys.meetup(id),
    queryFn: () => api.meetups.get(id),
    // The meeting point of a secret meetup unlocks at a given time.
    refetchInterval: 60_000,
  });

export const useAnnouncements = () =>
  useQuery({ queryKey: keys.announcements, queryFn: () => api.announcements.list(10) });

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: api.notifications.list, refetchInterval: 60_000 });

export const useMapMembers = (enabled: boolean) =>
  useQuery({ queryKey: keys.mapMembers, queryFn: api.map.members, enabled, refetchInterval: 30_000 });

export const useMapMeetups = () => useQuery({ queryKey: keys.mapMeetups, queryFn: api.map.meetups });

export const useAdminOverview = (enabled = true) =>
  useQuery({ queryKey: keys.adminOverview, queryFn: api.admin.overview, enabled, refetchInterval: 60_000 });
