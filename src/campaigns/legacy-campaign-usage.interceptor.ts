import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

// Spec 104 — telemetría del uso heredado de campañas: registra la ruta, el
// método y el usuario, y marca la respuesta con `Deprecation: true`. Alimenta
// las compuertas A→B y B→C.
@Injectable()
export class LegacyCampaignUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger('legacyCampaignUsage');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { userId?: string } }>();
    const res = http.getResponse<Response>();
    res.setHeader('Deprecation', 'true');
    this.logger.log(
      JSON.stringify({
        legacyCampaignUsage: true,
        method: req.method,
        route: req.originalUrl?.split('?')[0],
        userId: req.user?.userId ?? null,
      }),
    );
    return next.handle();
  }
}
