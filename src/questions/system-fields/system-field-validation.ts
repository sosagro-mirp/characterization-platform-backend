import { BadRequestException } from '@nestjs/common';
import {
  isSelectable,
  resolveSystemField,
  SystemFieldDef,
} from './system-field-registry';

export type SystemFieldErrorCode =
  | 'SYSTEM_FIELD_UNKNOWN'
  | 'SYSTEM_FIELD_TYPE_MISMATCH'
  | 'SYSTEM_FIELD_LEGACY'
  | 'SYSTEM_FIELD_DUPLICATE';

export interface SystemFieldWarningBody {
  code: 'SYSTEM_FIELD_IN_OTHER_INSTRUMENT';
  message: string;
}

/** Cuerpo de error estable: los clientes (editor web, MCP) deciden por `code`. */
export function systemFieldError(
  code: SystemFieldErrorCode,
  message: string,
): { code: SystemFieldErrorCode; message: string } {
  return { code, message };
}

/**
 * Valida un `systemField` que se va a asignar a una pregunta de tipo
 * `typeName` y devuelve su definición (cuya `key` es la canónica a guardar).
 *
 * - `unknown`: la clave no está en el catálogo (ni como alias).
 * - `legacy`: la clave está en desuso. No se exige si `unchanged` es `true`
 *   (el editor reenvía la clave que la pregunta ya tenía).
 * - `typeMismatch`: el tipo de pregunta no es compatible con el destino.
 */
export function assertAssignableSystemField(
  raw: string,
  typeName: string,
  options: { unchanged?: boolean } = {},
): SystemFieldDef {
  const def = resolveSystemField(raw);
  if (!def) {
    throw new BadRequestException(
      systemFieldError(
        'SYSTEM_FIELD_UNKNOWN',
        `«${raw}» no es un destino del catálogo. Consulte GET /system-fields.`,
      ),
    );
  }
  if (!isSelectable(def) && !options.unchanged) {
    throw new BadRequestException(
      systemFieldError(
        'SYSTEM_FIELD_LEGACY',
        `«${def.key}» está en desuso y no se puede asignar a preguntas nuevas.`,
      ),
    );
  }
  assertTypeCompatible(def, typeName);
  return def;
}

/** Solo la compatibilidad de tipo: se usa al cambiar el `typeId` de una pregunta con destino. */
export function assertTypeCompatible(
  def: SystemFieldDef,
  typeName: string,
): void {
  if (!def.questionTypes.includes(typeName)) {
    throw new BadRequestException(
      systemFieldError(
        'SYSTEM_FIELD_TYPE_MISMATCH',
        `«${def.key}» no admite preguntas de tipo ${typeName}; admite: ${def.questionTypes.join(', ')}.`,
      ),
    );
  }
}
