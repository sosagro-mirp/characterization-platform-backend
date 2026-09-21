import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  OPTION_ORIGINS,
  OptionQuestion,
} from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OTHER_TEXT_MAX_LENGTH, resolveOtherAnswer } from './other-option';

// Spec 86 — reglas del texto de «Otros» en la respuesta. El helper solo lee la
// opción «Otros» hermana con `manager.getRepository(...).findOne`, así que se
// prueba con un manager mínimo, sin base de datos.

function question(typeName: string): Question {
  return { questionId: 'q1', type: { name: typeName } } as unknown as Question;
}

function option(overrides: Partial<OptionQuestion> = {}): OptionQuestion {
  return {
    optionId: 'o-normal',
    text: 'Café',
    isOther: false,
    origin: OPTION_ORIGINS.INSTRUMENT,
    ...overrides,
  } as OptionQuestion;
}

const OTHER = option({ optionId: 'o-other', text: 'Otros', isOther: true });

function managerWith(sibling: OptionQuestion | null): EntityManager {
  const findOne = jest.fn().mockResolvedValue(sibling);
  return {
    getRepository: jest.fn().mockReturnValue({ findOne }),
  } as unknown as EntityManager;
}

describe('resolveOtherAnswer (spec 86)', () => {
  describe.each(['single_choice', 'multiple_choice'])('%s', (typeName) => {
    const q = question(typeName);

    it('guarda el texto recortado en la opción «Otros»', async () => {
      const result = await resolveOtherAnswer(
        q,
        OTHER,
        '  Arroz  ',
        managerWith(null),
      );
      expect(result).toEqual({ option: OTHER, textValue: 'Arroz' });
    });

    it('acepta «Otros» sin texto (o con solo espacios) como texto nulo', async () => {
      for (const text of [undefined, '', '   ']) {
        const result = await resolveOtherAnswer(
          q,
          OTHER,
          text,
          managerWith(null),
        );
        expect(result).toEqual({ option: OTHER, textValue: undefined });
      }
    });

    it('rechaza (400) un texto en una opción que no es «Otros»', async () => {
      await expect(
        resolveOtherAnswer(q, option(), 'indebido', managerWith(null)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acepta el límite exacto y rechaza (400) uno más', async () => {
      const atLimit = 'a'.repeat(OTHER_TEXT_MAX_LENGTH);
      await expect(
        resolveOtherAnswer(q, OTHER, atLimit, managerWith(null)),
      ).resolves.toEqual({ option: OTHER, textValue: atLimit });

      await expect(
        resolveOtherAnswer(q, OTHER, `${atLimit}a`, managerWith(null)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sin opción: sin texto pasa; con texto se rechaza (400)', async () => {
      await expect(
        resolveOtherAnswer(q, null, undefined, managerWith(null)),
      ).resolves.toEqual({ option: null, textValue: undefined });
      await expect(
        resolveOtherAnswer(q, null, 'huérfano', managerWith(null)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('opciones origin = field (clientes viejos)', () => {
    const q = question('multiple_choice');
    const legacy = option({
      optionId: 'o-field',
      text: '  Gulupa  ',
      origin: OPTION_ORIGINS.FIELD,
    });

    it('las normaliza a «Otros» con el texto de la opción', async () => {
      const result = await resolveOtherAnswer(
        q,
        legacy,
        undefined,
        managerWith(OTHER),
      );
      expect(result).toEqual({ option: OTHER, textValue: 'Gulupa' });
    });

    it('el texto propio de la respuesta gana sobre el de la opción', async () => {
      const result = await resolveOtherAnswer(
        q,
        legacy,
        'Propio',
        managerWith(OTHER),
      );
      expect(result).toEqual({ option: OTHER, textValue: 'Propio' });
    });

    it('sin «Otros» hermana y sin texto conservan la respuesta tal cual', async () => {
      const result = await resolveOtherAnswer(
        q,
        legacy,
        undefined,
        managerWith(null),
      );
      expect(result).toEqual({ option: legacy, textValue: undefined });
    });

    it('sin «Otros» hermana pero con texto se validan como cualquier opción (400)', async () => {
      await expect(
        resolveOtherAnswer(q, legacy, 'texto', managerWith(null)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('no toca las preguntas de otros tipos', async () => {
    const result = await resolveOtherAnswer(
      question('open_text'),
      null,
      '  texto libre  ',
      managerWith(null),
    );
    expect(result).toEqual({ option: null, textValue: '  texto libre  ' });
  });
});
