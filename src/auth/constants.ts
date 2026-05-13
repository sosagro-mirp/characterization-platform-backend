/*
Roles that can be assignd to users in the system.
*/

export const ROLES = {
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
  POLLSTER: 'pollster',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
