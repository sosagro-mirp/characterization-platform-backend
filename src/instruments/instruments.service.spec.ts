import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InstrumentsService } from './instruments.service';
import { Instrument } from './entities/instrument.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { User } from 'src/users/entities/user.entity';
import { Town } from 'src/towns/entities/town.entity';
import { Question } from 'src/questions/entities/question.entity';

/**
 * Hotfix del 2026-08-22 — dos regresiones reales de producción introducidas
 * por el backfill de códigos del spec 43 (`BackfillInstrumentCodes`):
 *
 * 1. `findByCode('S1')`/`findByCode('S2')` (usados por `mobile/` y
 *    `frontend/` para el flujo de identificación S1/S2) empezaron a fallar:
 *    el backfill renombró esos instrumentos a `code: 'S1a'`/`'S1b'` para no
 *    chocar con el código de dashboard `'S2'` (un instrumento de contenido
 *    real, "Cultivos — Identificación de Cadenas"). Verificado en vivo
 *    contra producción: `GET /api/instruments/by-code/S1` devolvía 404, y
 *    `by-code/S2` devolvía el instrumento de dashboard equivocado.
 * 2. `findAll(excludeSystem: true)` usaba `code IS NULL` como señal de "no es
 *    instrumento de sistema" — válido cuando solo 3 instrumentos tenían
 *    `code`, roto desde que el backfill le puso `code` a los 36. El selector
 *    de instrumentos disponibles para armar una campaña habría quedado vacío.
 */
describe('InstrumentsService — hotfix códigos de sistema (2026-08-22)', () => {
  let service: InstrumentsService;
  let instrumentsRepository: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    leftJoin: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };

  beforeEach(async () => {
    instrumentsRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    instrumentsRepository.createQueryBuilder.mockReturnValue(qb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        {
          provide: getRepositoryToken(Instrument),
          useValue: instrumentsRepository,
        },
        { provide: getRepositoryToken(ActorType), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
        { provide: getRepositoryToken(Question), useValue: {} },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
  });

  describe('findByCode — alias legacy S1/S2', () => {
    it("resuelve el código legacy 'S1' contra el instrumento con code 'S1a'", async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s1a',
        name: 'S1a: Identificación del encuestado/propietario/productor',
      });

      const result = await service.findByCode('S1');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S1a' } }),
      );
      expect(result.instrumentId).toBe('inst-s1a');
    });

    it("resuelve el código legacy 'S2' contra el instrumento con code 'S1b', no el de dashboard", async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s1b',
        name: 'S1b: Identificación de la unidad productiva',
      });

      const result = await service.findByCode('S2');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S1b' } }),
      );
      expect(result.instrumentId).toBe('inst-s1b');
    });

    it('un código de dashboard real (no legacy) pasa sin alias', async () => {
      instrumentsRepository.findOne.mockResolvedValue({
        instrumentId: 'inst-s3',
        name: 'S3: Manejo del Cultivo, Suelo y Condiciones Ambientales',
      });

      await service.findByCode('S3');

      expect(instrumentsRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'S3' } }),
      );
    });

    it('lanza 404 con el código original (no el alias) si no existe', async () => {
      instrumentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByCode('S1')).rejects.toThrow(
        new NotFoundException("Instrument with code 'S1' not found"),
      );
    });
  });

  describe('findAll(excludeSystem) — filtra por lista de códigos de sistema, no por code != null', () => {
    it('con excludeSystem=true, filtra excluyendo S1a/S1b/S_DCU, no cualquier code', async () => {
      await service.findAll(true);

      expect(qb.where).toHaveBeenCalledWith(
        'instrument.code IS NULL OR instrument.code NOT IN (:...codes)',
        { codes: ['S1a', 'S1b', 'S_DCU'] },
      );
    });

    it('sin excludeSystem, no aplica ningún filtro por código', async () => {
      await service.findAll(false);

      expect(qb.where).not.toHaveBeenCalled();
    });
  });
});

/**
 * Spec 77 — duplicación de instrumentos.
 *
 * La copia real se ejecuta dentro de `manager.transaction`; simulamos ese
 * manager para poder inspeccionar qué se creó y con qué datos, sin tocar una
 * base de datos real (eso lo cubre el e2e-077).
 */
describe('InstrumentsService.duplicate — Spec 77', () => {
  let service: InstrumentsService;
  let instrumentsRepository: {
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let usersRepository: { findOne: jest.Mock };
  let qb: {
    leftJoinAndSelect: jest.Mock;
    leftJoin: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    getOne: jest.Mock;
  };
  let fakeManager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  let idCounter: number;
  const nextId = () => `generated-${++idCounter}`;

  beforeEach(async () => {
    idCounter = 0;

    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    fakeManager = {
      // `create` solo arma el objeto en memoria; `save` es el que le asigna
      // el id, igual que TypeORM.
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
        ...data,
      })),
      save: jest.fn((entity: unknown, data: Record<string, unknown>) => {
        const idField =
          entity === Instrument
            ? 'instrumentId'
            : (entity as { name: string }).name === 'Section'
              ? 'sectionId'
              : (entity as { name: string }).name === 'Question'
                ? 'questionId'
                : 'optionId';
        return { ...data, [idField]: nextId() };
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    instrumentsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager: {
        transaction: jest.fn(
          async (cb: (manager: typeof fakeManager) => Promise<string>) =>
            cb(fakeManager),
        ),
      },
    };

    usersRepository = { findOne: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        {
          provide: getRepositoryToken(Instrument),
          useValue: instrumentsRepository,
        },
        { provide: getRepositoryToken(ActorType), useValue: {} },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Town), useValue: {} },
        { provide: getRepositoryToken(Question), useValue: {} },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
  });

  it('lanza 404 si el instrumento origen no existe', async () => {
    qb.getOne.mockResolvedValueOnce(null);

    await expect(
      service.duplicate('missing-id', { name: 'Copia', version: 1 }),
    ).rejects.toThrow(new NotFoundException('Instrument not found'));

    expect(instrumentsRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('crea la copia inactiva y sin código, sin importar el original', async () => {
    qb.getOne
      .mockResolvedValueOnce({
        instrumentId: 'source-id',
        isActive: true,
        code: 'S9',
        actorTypes: [{ actorTypeId: 'actor-1' }],
        sections: [],
      })
      .mockResolvedValueOnce({ instrumentId: 'generated-1' }); // findOne() final

    await service.duplicate('source-id', {
      name: 'Copia de prueba',
      version: 3,
    });

    const createCalls = fakeManager.create.mock.calls as [
      unknown,
      Record<string, unknown>,
    ][];
    const instrumentCreateCall = createCalls.find(
      (call) => call[0] === Instrument,
    );
    expect(instrumentCreateCall?.[1]).toMatchObject({
      name: 'Copia de prueba',
      version: 3,
      isActive: false,
      code: undefined,
      actorTypes: [{ actorTypeId: 'actor-1' }],
    });
  });

  it('remapea conditionQuestionId a la pregunta copiada, no a la original', async () => {
    qb.getOne
      .mockResolvedValueOnce({
        instrumentId: 'source-id',
        isActive: false,
        code: null,
        actorTypes: [],
        sections: [
          {
            sectionId: 'section-a',
            name: 'Sección A',
            order: 1,
            questions: [
              {
                questionId: 'q-a1',
                text: 'A1',
                type: { typeId: 'type-1' },
                isRequired: true,
                isSelectionCriteria: false,
                isKeyQuestion: false,
                order: 1,
                systemField: null,
                conditionValue: null,
                conditionQuestion: null,
                options: [],
              },
            ],
          },
          {
            sectionId: 'section-b',
            name: 'Sección B',
            order: 2,
            questions: [
              {
                questionId: 'q-b1',
                text: 'B1',
                type: { typeId: 'type-1' },
                isRequired: true,
                isSelectionCriteria: false,
                isKeyQuestion: false,
                order: 1,
                systemField: null,
                conditionValue: 'si',
                conditionQuestion: { questionId: 'q-a1' },
                options: [],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ instrumentId: 'generated-1' });

    await service.duplicate('source-id', { name: 'Copia', version: 1 });

    // La única llamada a `update` debe apuntar la B1 copiada a la A1 copiada
    // (un id `generated-N`), nunca al `q-a1` original.
    expect(fakeManager.update).toHaveBeenCalledTimes(1);
    const [, copiedB1Id, updatePayload] = fakeManager.update.mock.calls[0] as [
      unknown,
      string,
      { conditionQuestion: { questionId: string }; conditionValue: string },
    ];
    expect(copiedB1Id).toMatch(/^generated-/);
    expect(updatePayload.conditionQuestion.questionId).toMatch(/^generated-/);
    expect(updatePayload.conditionQuestion.questionId).not.toBe('q-a1');
    expect(updatePayload.conditionValue).toBe('si');
  });
});
