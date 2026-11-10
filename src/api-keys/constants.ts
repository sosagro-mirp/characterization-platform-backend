/*
Scopes that can be granted to an API key.

`delete` is deliberately separate from `write` and is never implied by it: a
key only performs DELETE requests if it was created with that scope
explicitly. Until spec 84 there was no delete scope at all — API keys could
never issue a DELETE — because the agent-facing MCP had no business removing
anything. Spec 84 added a narrow exception: the depuration of instrument
structure (questions, options and sections) that has no responses attached.
The backend still answers 409 for anything that does, so the scope widens who
may ask, not what the API is willing to destroy. Keys that predate this change
carry only read/write and keep behaving exactly as before.
*/

export const API_KEY_SCOPES = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

export const VALID_API_KEY_SCOPES: ApiKeyScope[] = Object.values(
  API_KEY_SCOPES,
) as ApiKeyScope[];
