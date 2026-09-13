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
const DELETE_METHODS = new Set(['DELETE']);

/**
 * Restricts what an API-key-authenticated request can do. Requests
 * authenticated via JWT are untouched by this guard — it only ever looks at
 * request.apiKey, which ApiKeyAuthGuard sets exclusively for API key auth.
 *
 * Rules (spec 48, amended by spec 84): @JwtOnly() routes are always forbidden
 * for API keys; every other request requires the scope matching its verb —
 * `read` for GET/HEAD, `write` for POST/PATCH/PUT and `delete` for DELETE.
 * `write` does not imply `delete`: spec 48 forbade DELETE outright, and spec
 * 84 reopened it only for keys created explicitly with the `delete` scope, so
 * that the MCP can depurate instrument structure without responses. Any other
 * verb stays out of scope.
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

    if (
      !READ_METHODS.has(method) &&
      !WRITE_METHODS.has(method) &&
      !DELETE_METHODS.has(method)
    ) {
      // Cualquier otro verbo (PURGE, TRACE…) sigue fuera de alcance.
      throw new ForbiddenException(
        `API keys cannot perform ${method} operations`,
      );
    }

    // Spec 84 — `delete` es un scope propio que `write` NO implica: una key
    // solo borra si se creó explícitamente con él. El backend sigue
    // respondiendo 409 ante cualquier borrado con respuestas o dependientes,
    // así que esto amplía quién puede pedirlo, no qué se puede destruir.
    const requiredScope = READ_METHODS.has(method)
      ? API_KEY_SCOPES.READ
      : DELETE_METHODS.has(method)
        ? API_KEY_SCOPES.DELETE
        : API_KEY_SCOPES.WRITE;

    if (!apiKey.scopes.includes(requiredScope)) {
      throw new ForbiddenException(
        `This API key does not have the "${requiredScope}" scope`,
      );
    }

    return true;
  }
}
