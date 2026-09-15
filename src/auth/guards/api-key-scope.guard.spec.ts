import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_SCOPES } from '../../api-keys/constants';
import type { ApiKey } from '../../api-keys/entities/api-key.entity';
import { ApiKeyScopeGuard } from './api-key-scope.guard';

/**
 * Spec 84 — el scope `delete` es la única puerta por la que una API key puede
 * borrar, y `write` no la abre. Estas pruebas fijan esa frontera: es lo que
 * separa "el agente puede depurar instrumentos" de "el agente puede borrar
 * cualquier cosa de la API".
 */
describe('ApiKeyScopeGuard', () => {
  let guard: ApiKeyScopeGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    guard = new ApiKeyScopeGuard(reflector);
  });

  function contextFor(
    method: string,
    apiKey?: Partial<ApiKey>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, apiKey }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  const withScopes = (...scopes: string[]) => ({ scopes }) as Partial<ApiKey>;

  it('deja pasar cualquier request sin API key (autenticado por JWT)', () => {
    expect(guard.canActivate(contextFor('DELETE'))).toBe(true);
  });

  it('permite DELETE a una key con el scope delete', () => {
    const ctx = contextFor(
      'DELETE',
      withScopes(API_KEY_SCOPES.READ, API_KEY_SCOPES.DELETE),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza DELETE a una key con solo read y write — write no implica delete', () => {
    const ctx = contextFor(
      'DELETE',
      withScopes(API_KEY_SCOPES.READ, API_KEY_SCOPES.WRITE),
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(/"delete"/);
  });

  it('el scope delete no habilita escrituras por sí solo', () => {
    const ctx = contextFor('POST', withScopes(API_KEY_SCOPES.DELETE));
    expect(() => guard.canActivate(ctx)).toThrow(/"write"/);
  });

  it.each(['GET', 'HEAD'])('%s exige el scope read', (method) => {
    expect(
      guard.canActivate(contextFor(method, withScopes(API_KEY_SCOPES.READ))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(method, withScopes(API_KEY_SCOPES.WRITE))),
    ).toThrow(/"read"/);
  });

  it.each(['POST', 'PATCH', 'PUT'])('%s exige el scope write', (method) => {
    expect(
      guard.canActivate(contextFor(method, withScopes(API_KEY_SCOPES.WRITE))),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(method, withScopes(API_KEY_SCOPES.READ))),
    ).toThrow(/"write"/);
  });

  it('rechaza verbos fuera de read/write/delete aunque la key tenga todos los scopes', () => {
    const ctx = contextFor(
      'TRACE',
      withScopes(
        API_KEY_SCOPES.READ,
        API_KEY_SCOPES.WRITE,
        API_KEY_SCOPES.DELETE,
      ),
    );
    expect(() => guard.canActivate(ctx)).toThrow(/TRACE/);
  });

  it('rechaza una ruta @JwtOnly aunque la key tenga el scope correcto', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => key !== 'isPublic');
    const ctx = contextFor('GET', withScopes(API_KEY_SCOPES.READ));
    expect(() => guard.canActivate(ctx)).toThrow(/not available for API keys/i);
  });
});
