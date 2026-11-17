import { ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PUBLIC_UNLESS_QUERY_KEY = 'publicUnlessQuery';
/**
 * Spec 107 (P20): una ruta `@Public()` deja de serlo cuando la petición trae
 * ese parámetro de query. Todos los guards globales deciden con
 * `isPublicRequest`, así que la ruta cae bajo autenticación y roles normales.
 */
export const PublicUnlessQuery = (param: string) =>
  SetMetadata(PUBLIC_UNLESS_QUERY_KEY, param);

export function isPublicRequest(
  reflector: Reflector,
  context: ExecutionContext,
): boolean {
  const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (!isPublic) return false;
  const param = reflector.get<string | undefined>(
    PUBLIC_UNLESS_QUERY_KEY,
    context.getHandler(),
  );
  if (!param) return true;
  const value = context.switchToHttp().getRequest<Request>().query?.[param];
  return value === undefined || value === '';
}
