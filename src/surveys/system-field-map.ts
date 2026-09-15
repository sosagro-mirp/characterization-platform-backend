import { Response } from 'src/responses/entities/response.entity';

export type SystemFieldValue = string | number | boolean;

/**
 * Arma el mapa `systemField → valor` con las respuestas de una encuesta.
 *
 * Spec 84 (Fase 8, 2026-09-15) — las preguntas de selección guardan
 * `option_id` y no un valor escalar, así que antes quedaban fuera del mapa:
 * «Género del productor(a)» (`farmer.gender`) nunca llegaba a `farmers`.
 * Ahora, si la respuesta no trae valor escalar, se usa el texto de la opción.
 *
 * `farm.town` se excluye: se resuelve por el `metadataId` de la opción, no por
 * su texto.
 */
export function buildSystemFieldMap(
  responses: Response[],
): Record<string, SystemFieldValue> {
  const fieldMap: Record<string, SystemFieldValue> = {};
  for (const response of responses) {
    const sf = response.question?.systemField;
    if (!sf || sf === 'farm.town') continue;
    const value =
      response.textValue ??
      response.numericValue ??
      response.booleanValue ??
      response.option?.text;
    if (value !== undefined && value !== null) {
      fieldMap[sf] = value;
    }
  }
  return fieldMap;
}
