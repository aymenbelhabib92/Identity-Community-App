export const ROLES = ['member', 'organizer', 'treasurer', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  member: 'Member',
  organizer: 'Organizer',
  treasurer: 'Treasurer',
  admin: 'Admin',
};

/**
 * What each role may do. Roles are not a strict ladder (a treasurer reviews
 * payments but does not organise meetups), so actions are checked against this
 * matrix. "Organizer role and above" (staff) is `isStaff`.
 */
export const PERMISSIONS = {
  'meetups:create': ['organizer', 'admin'],
  'meetups:manage-any': ['admin'],
  'announcements:create': ['organizer', 'treasurer', 'admin'],
  'announcements:manage-any': ['admin'],
  'payments:review': ['treasurer', 'admin'],
  'members:view': ['organizer', 'treasurer', 'admin'],
  'members:manage': ['admin'],
  'settings:manage': ['admin'],
  'pass:verify': ['organizer', 'treasurer', 'admin'],
  /** Delete anyone's chat messages (members can always delete their own). */
  'chat:moderate': ['admin'],
  /** Club places and red zones on the map. */
  'places:manage': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Organizer role and above: sees staff-only meetups and secret meeting points. */
export function isStaff(role: Role): boolean {
  return role !== 'member';
}
