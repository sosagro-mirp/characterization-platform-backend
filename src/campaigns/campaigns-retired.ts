import { GoneException } from '@nestjs/common';

// Spec 104 — las campañas se retiraron como forma de capturar datos.
export const CAMPAIGNS_RETIRED = 'CAMPAIGNS_RETIRED';

export function campaignsRetired(): GoneException {
  return new GoneException({
    statusCode: 410,
    code: CAMPAIGNS_RETIRED,
    message:
      'Las campañas fueron retiradas. Usa el flujo por productor (spec 102/103).',
  });
}
