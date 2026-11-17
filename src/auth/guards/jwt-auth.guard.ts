import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { isPublicRequest } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = isPublicRequest(this.reflector, context);
    if (isPublic) {
      return true;
    }

    // ApiKeyAuthGuard already authenticated this request via X-API-Key —
    // don't attempt JWT validation on top of it.
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user) {
      return true;
    }

    return super.canActivate(context);
  }
}
