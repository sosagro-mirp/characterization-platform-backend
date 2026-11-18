import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { isPublicRequest } from '../decorators/public.decorator';
import type { RoleName } from '../constants';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = isPublicRequest(this.reflector, context);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RoleName[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user?.role || !required.includes(user.role as RoleName)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
