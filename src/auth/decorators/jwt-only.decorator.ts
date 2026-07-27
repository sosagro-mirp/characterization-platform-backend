import { SetMetadata } from '@nestjs/common';

export const IS_JWT_ONLY_KEY = 'isJwtOnly';

/**
 * Marks a route as unreachable via API key, regardless of scopes. Used on
 * the API keys management endpoints themselves so a compromised key can
 * never create, list, or revoke keys.
 */
export const JwtOnly = () => SetMetadata(IS_JWT_ONLY_KEY, true);
