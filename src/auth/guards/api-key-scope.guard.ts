import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { API_KEY_SCOPES } from '../../api-keys/constants';
import type { ApiKey } from '../../api-keys/entities/api-key.entity';
import { IS_JWT_ONLY_KEY } from '../decorators/jwt-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface RequestWithApiKey extends Request {
  apiKey?: ApiKey;
}

const READ_METHODS = new Set(['GET', 'HEAD']);
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT']);

/**
 * Restricts what an API-key-authenticated request can do. Requests
 * authenticated via JWT are untouched by this guard — it only ever looks at
 * request.apiKey, which ApiKeyAuthGuard sets exclusively for API key auth.
 *
 * Rules (spec 48): DELETE is always forbidden for API keys regardless of
 * scope; @JwtOnly() routes are always forbidden for API keys; everything
 * else requires the matching read/write scope.
 */
@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithApiKey>();
    const apiKey = request.apiKey;
    if (!apiKey) return true; // Not an API-key-authenticated request.

    const isJwtOnly = this.reflector.getAllAndOverride<boolean>(
      IS_JWT_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isJwtOnly) {
      throw new ForbiddenException(
        'This operation is not available for API keys',
      );
    }

    const method = request.method.toUpperCase();

    if (!READ_METHODS.has(method) && !WRITE_METHODS.has(method)) {
      // Covers DELETE and any other verb — API keys never get anything
      // beyond read/write, and DELETE is explicitly out of scope.
      throw new ForbiddenException('API keys cannot perform delete operations');
    }

    const requiredScope = READ_METHODS.has(method)
      ? API_KEY_SCOPES.READ
      : API_KEY_SCOPES.WRITE;

    if (!apiKey.scopes.includes(requiredScope)) {
      throw new ForbiddenException(
        `This API key does not have the "${requiredScope}" scope`,
      );
    }

    return true;
  }
}
