import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  OPTION_ORIGINS,
  OptionQuestion,
} from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';

/**
 * Spec 86 — la opción "Otros" guarda el texto personalizado en la propia
 * respuesta (`option_id` = opción `isOther`, `text_value` = texto) en vez de
 * crear una opción nueva en el instrumento. Compartido por el canal de campo
 * (`ResponsesService`) y el canal público (`PublicSurveysService`).
 */

export const OTHER_TEXT_MAX_LENGTH = 255;

const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice']);

export interface ResolvedOtherAnswer {
  option: OptionQuestion | null;
  textValue: string | undefined;
}

/**
 * Normaliza y valida la pareja opción + texto de una respuesta a una pregunta
 * de selección:
 *   - una opción `origin = 'field'` (cliente viejo que creó la opción "Otros"
 *     dinámica, o dato legado migrado) se reemplaza por la opción "Otros" de
 *     la pregunta, con el texto de la opción como `textValue`;
 *   - `textValue` solo se admite en la opción "Otros" (400 si no);
 *   - el texto se recorta y no puede pasar de OTHER_TEXT_MAX_LENGTH (400);
 *   - "Otros" sin texto se acepta (`textValue` indefinido → NULL).
 * Las preguntas de otros tipos pasan sin cambios.
 */
export async function resolveOtherAnswer(
  question: Question,
  option: OptionQuestion | null,
  textValue: string | undefined,
  manager: EntityManager,
): Promise<ResolvedOtherAnswer> {
  if (!CHOICE_TYPES.has(question.type?.name ?? '')) {
    return { option, textValue };
  }

  let resolvedOption = option;
  let resolvedText = textValue?.trim() || undefined;

  if (option?.origin === OPTION_ORIGINS.FIELD) {
    const otherOption = await manager.getRepository(OptionQuestion).findOne({
      where: { question: { questionId: question.questionId }, isOther: true },
    });
    if (otherOption) {
      resolvedOption = otherOption;
      resolvedText = resolvedText ?? option.text.trim();
    } else if (resolvedText === undefined) {
      // Sin opción "Otros" hermana no hay a dónde normalizar: la respuesta se
      // conserva tal cual (mismo criterio que el script de datos legados).
      return { option, textValue: undefined };
    }
    // Si además trae texto propio, se valida abajo como cualquier otra
    // opción: `textValue` solo se admite en «Otros» y con el límite de largo.
  }

  if (resolvedText === undefined) {
    return { option: resolvedOption, textValue: undefined };
  }

  if (!resolvedOption?.isOther) {
    throw new BadRequestException(
      'textValue is only allowed on the "other" option of a choice question',
    );
  }

  if (resolvedText.length > OTHER_TEXT_MAX_LENGTH) {
    throw new BadRequestException(
      `The "other" text must be at most ${OTHER_TEXT_MAX_LENGTH} characters`,
    );
  }

  return { option: resolvedOption, textValue: resolvedText };
}
