import { Response } from 'src/responses/entities/response.entity';
import { convertAreaToHectares } from './unit-conversion';

export type SystemFieldValue = string | number | boolean;

export type SystemFieldWarningCode =
  | 'multi_value_truncated'
  | 'area_converted'
  | 'area_unit_unknown';

export interface SystemFieldWarning {
  code: SystemFieldWarningCode;
  field: string;
  message: string;
}

/**
 * Spec 93 (D-H2-9) — columnas de valor único (varchar 100) que el instrumento
 * puede llenar con selección múltiple: se concatenan los textos.
 */
const MULTI_VALUE_FIELDS = new Set([
  'farm.mainAccessType',
  'farm.waterSourceType',
]);
const MULTI_VALUE_SEPARATOR = '; ';
const MULTI_VALUE_MAX_LENGTH = 100;

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
 *
 * Spec 93 — `farm.area` se convierte a hectáreas según la opción de unidad, y
 * `farm.mainAccessType` / `farm.waterSourceType` concatenan las opciones
 * elegidas (ordenadas, unidas con «; », tope de 100 caracteres). Ambos casos
 * informan una advertencia, ver `buildSystemFieldMapWithWarnings`.
 */
export function buildSystemFieldMapWithWarnings(responses: Response[]): {
  fieldMap: Record<string, SystemFieldValue>;
  warnings: SystemFieldWarning[];
} {
  const fieldMap: Record<string, SystemFieldValue> = {};
  const warnings: SystemFieldWarning[] = [];
  const multiValues = new Map<string, string[]>();

  for (const response of responses) {
    const sf = response.question?.systemField;
    if (!sf || sf === 'farm.town') continue;
    const value =
      response.textValue ??
      response.numericValue ??
      response.booleanValue ??
      response.option?.text;
    if (value === undefined || value === null) continue;

    if (MULTI_VALUE_FIELDS.has(sf)) {
      const values = multiValues.get(sf) ?? [];
      const text = String(value);
      if (!values.includes(text)) values.push(text);
      multiValues.set(sf, values);
      continue;
    }

    if (
      sf === 'farm.area' &&
      typeof response.numericValue === 'number' &&
      response.option?.text
    ) {
      const area = convertAreaToHectares(
        response.numericValue,
        response.option.text,
      );
      if (area.unitUnknown) {
        warnings.push({
          code: 'area_unit_unknown',
          field: sf,
          message: `Unidad de área desconocida «${response.option.text}»: el área no se guarda.`,
        });
      } else if (area.hectares !== null) {
        fieldMap[sf] = area.hectares;
        if (area.converted) {
          warnings.push({
            code: 'area_converted',
            field: sf,
            message: `Área convertida de ${response.numericValue} ${response.option.text} a ${area.hectares} ha.`,
          });
        }
      }
      continue;
    }

    fieldMap[sf] = value;
  }

  for (const [sf, values] of multiValues) {
    const joined = values
      .sort((a, b) => a.localeCompare(b, 'es'))
      .join(MULTI_VALUE_SEPARATOR);
    if (joined.length > MULTI_VALUE_MAX_LENGTH) {
      fieldMap[sf] = joined.slice(0, MULTI_VALUE_MAX_LENGTH).trimEnd();
      warnings.push({
        code: 'multi_value_truncated',
        field: sf,
        message: `Las opciones elegidas superan ${MULTI_VALUE_MAX_LENGTH} caracteres: se guardó el texto recortado.`,
      });
    } else {
      fieldMap[sf] = joined;
    }
  }

  return { fieldMap, warnings };
}

export function buildSystemFieldMap(
  responses: Response[],
): Record<string, SystemFieldValue> {
  return buildSystemFieldMapWithWarnings(responses).fieldMap;
}
