import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { ApiKey } from '../../api-keys/entities/api-key.entity';

export const API_KEY_HEADER = 'x-api-key';

interface RequestWithAuth extends Request {
  user?: AuthenticatedUser;
  apiKey?: ApiKey;
}

/**
 * Resolves the "X-API-Key" header, if present, into request.user +
 * request.apiKey. Runs before JwtAuthGuard so the presence of this header
 * decides the authentication method for the whole request — an invalid key
 * rejects the request outright, it never falls back to JWT (see spec 48,
 * "Regla de precedencia").
 */
@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const rawKey = request.headers[API_KEY_HEADER];
    if (!rawKey || Array.isArray(rawKey)) {
      return true; // No API key presented — defer to JwtAuthGuard.
    }

    const apiKey = await this.apiKeysService.validateKey(rawKey);
    if (!apiKey) {
      throw new UnauthorizedException('Invalid or expired API key');
    }

    request.user = {
      userId: apiKey.user.userId,
      email: apiKey.user.email,
      role: apiKey.user.role?.name ?? null,
      mustChangePassword: false,
    };
    request.apiKey = apiKey;

    this.apiKeysService.touchLastUsed(apiKey.apiKeyId);

    return true;
  }
}
