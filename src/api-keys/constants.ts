/*
Scopes that can be granted to an API key. There is deliberately no "delete"
scope — API keys can never perform DELETE requests, regardless of the scopes
assigned to them (see ApiKeyScopeGuard).
*/

export const API_KEY_SCOPES = {
  READ: 'read',
  WRITE: 'write',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

export const VALID_API_KEY_SCOPES: ApiKeyScope[] = Object.values(
  API_KEY_SCOPES,
) as ApiKeyScope[];
