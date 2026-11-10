import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LegacyCampaignUsageInterceptor,
  legacyCampaignUsageEntry,
} from './legacy-campaign-usage.interceptor';
import { SurveysController } from '../surveys/surveys.controller';

// Spec 104 — telemetría del uso heredado de campañas (compuertas A→B y B→C).
describe('LegacyCampaignUsageInterceptor', () => {
  it('registra legacyCampaignUsage y marca la respuesta con Deprecation', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl: '/api/surveys/check-duplicate?farmerId=x',
          user: { userId: 'u-1' },
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await new Promise((resolve) =>
      new LegacyCampaignUsageInterceptor().intercept(context, next).subscribe({
        complete: () => resolve(undefined),
      }),
    );

    expect(setHeader).toHaveBeenCalledWith('Deprecation', 'true');
    const entry: unknown = JSON.parse(log.mock.calls[0][0] as string);
    expect(entry).toEqual({
      legacyCampaignUsage: true,
      method: 'GET',
      route: '/api/surveys/check-duplicate',
      userId: 'u-1',
    });
    log.mockRestore();
  });

  it.each(['checkDuplicate', 'skipStep'])(
    'SurveysController.%s está bajo el interceptor',
    (method) => {
      const handler = (
        SurveysController.prototype as unknown as Record<string, unknown>
      )[method];
      const interceptors = Reflect.getMetadata(
        '__interceptors__',
        handler as object,
      ) as unknown[];
      expect(interceptors).toContain(LegacyCampaignUsageInterceptor);
    },
  );

  it('POST /surveys con campaignSessionId registra el uso heredado', () => {
    expect(
      JSON.parse(
        legacyCampaignUsageEntry({
          method: 'POST',
          route: '/api/surveys',
          userId: 'u-2',
        }),
      ),
    ).toEqual({
      legacyCampaignUsage: true,
      method: 'POST',
      route: '/api/surveys',
      userId: 'u-2',
    });
    const service = readFileSync(
      resolve(__dirname, '../surveys/surveys.service.ts'),
      'utf8',
    );
    const start = service.indexOf('if (createSurveyDto.campaignSessionId)');
    expect(service.slice(start, start + 1200)).toContain(
      'legacyCampaignUsageEntry(',
    );
  });
});
