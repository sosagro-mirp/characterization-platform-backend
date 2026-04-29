export const ROLES = {
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
