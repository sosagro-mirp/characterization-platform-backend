import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuestionsService } from './questions.service';
import { Question } from './entities/question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';

/**
 * Spec 84 (lote C de la depuración, 2026-09-14) — quitar la condición de una
 * pregunta con `conditionQuestionId: null` no se guardaba: el servicio ponía
 * la relación y el valor en `undefined`, TypeORM omite esas propiedades al
 * guardar y la API respondía 200 con la condición intacta.
 */
describe('QuestionsService.update — quitar la condición', () => {
  let service: QuestionsService;
  let questionsRepository: { findOne: jest.Mock; save: jest.Mock };

  const SECTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const QUESTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ROOT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const conditioned = () => ({
    questionId: QUESTION_ID,
    text: 'Liste cada variedad con su porcentaje de área',
    order: 4,
    type: { typeId: 't-open', name: 'open_text' },
    options: [],
    section: { sectionId: SECTION_ID },
    conditionQuestion: { questionId: ROOT_ID },
    conditionValue: 'true',
  });

  beforeEach(async () => {
    questionsRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((q: unknown) => Promise.resolve(q)),
    };
    const repo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        {
          provide: getRepositoryToken(Question),
          useValue: questionsRepository,
        },
        { provide: getRepositoryToken(Section), useValue: repo() },
        { provide: getRepositoryToken(TypeOfQuestion), useValue: repo() },
        { provide: getRepositoryToken(OptionQuestion), useValue: repo() },
        { provide: getRepositoryToken(Response), useValue: repo() },
        { provide: getRepositoryToken(StepCondition), useValue: repo() },
      ],
    }).compile();

    service = module.get(QuestionsService);
  });

  it('guarda la relación y el valor en null (no undefined) para que TypeORM los escriba', async () => {
    const question = conditioned();
    questionsRepository.findOne
      .mockResolvedValueOnce(question)
      .mockResolvedValueOnce(question);

    await service.update(SECTION_ID, QUESTION_ID, {
      conditionQuestionId: null,
    });

    const [[saved]] = questionsRepository.save.mock.calls as [[Question]];
    expect(saved.conditionQuestion).toBeNull();
    expect(saved.conditionValue).toBeNull();
  });

  it('no toca la condición si no se envía conditionQuestionId', async () => {
    const question = conditioned();
    questionsRepository.findOne
      .mockResolvedValueOnce(question)
      .mockResolvedValueOnce(question);

    await service.update(SECTION_ID, QUESTION_ID, { text: 'Otro enunciado' });

    const [[saved]] = questionsRepository.save.mock.calls as [[Question]];
    expect(saved.conditionQuestion).toEqual({ questionId: ROOT_ID });
    expect(saved.conditionValue).toBe('true');
  });
});
