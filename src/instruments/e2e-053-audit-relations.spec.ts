import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InstrumentsService } from './instruments.service';
import { Instrument } from './entities/instrument.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Town } from 'src/towns/entities/town.entity';
import { User } from 'src/users/entities/user.entity';
import { Question } from 'src/questions/entities/question.entity';
import { CampaignsService } from 'src/campaigns/campaigns.service';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

/**
 * Spec 53 — Visibilidad de la auditoría "creado por / actualizado por".
 *
 * Cubre los criterios de aceptación 1-7 de
 * `spec/53_visibilidad_auditoria_creado_actualizado_por.md`.
 *
 * NOTA (2026-08-21): la implementación real (commit `84eebc4`,
 * 2026-07-29) usa `createQueryBuilder` con `leftJoin` + `addSelect` en vez de
 * `.find({ relations })`, precisamente para proyectar solo
 * `userId`/`name`/`lastName` del autor sin un segundo roundtrip (evita N+1).
 * Esta suite se corrigió el 2026-08-21, al mergear la rama a `development`,
 * para reflejar esa implementación — el diseño original de esta suite (mock
 * `.find()/.findOne()` con `relations`) nunca se había corrido contra el
 * código real desde que se escribió, y no coincidía con él. El
 * comportamiento verificado es el mismo; solo cambia cómo se lo observa.
 *
 * `change-requests.service.ts` (líneas 43, 76, 94) ya hacía lo correcto y fue
 * la referencia original para el criterio de proyección explícita.
 *
 * NOTA DE SEGURIDAD: `User.password` tiene `select: false`
 * (user.entity.ts:48-50), así que no viaja aunque se cargue la relación
 * completa. Aun así este spec exige PROYECCIÓN EXPLÍCITA a userId/name/lastName
 * — la forma que el frontend ya espera en `UserAuditSummary` — para que un
 * campo futuro del usuario no se filtre por omisión.
 */

const INSTRUMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAMPAIGN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const AUTOR = {
  userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  name: 'Ana',
  lastName: 'Spec53',
};

/** Campos del usuario que NO deben aparecer en la proyección de auditoría. */
const CAMPOS_PROHIBIDOS = ['password', 'email', 'mustChangePassword', 'role'];

/** Aplana los argumentos de `addSelect(['a', 'b'])` / `addSelect('a')` a un solo array de strings. */
function columnasSeleccionadas(mockFn: jest.Mock): string[] {
  return (mockFn.mock.calls as unknown[][]).flatMap((call) => {
    const arg = call[0];
    return Array.isArray(arg) ? arg.map(String) : [String(arg)];
  });
}

interface QueryBuilderMock {
  leftJoinAndSelect: jest.Mock;
  leftJoin: jest.Mock;
  innerJoin: jest.Mock;
  addSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  getOne: jest.Mock;
  getMany: jest.Mock;
}

function crearQueryBuilderMock(
  overrides: Partial<QueryBuilderMock> = {},
): QueryBuilderMock {
  const qb: QueryBuilderMock = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    ...overrides,
  };
  return qb;
}

// ─────────────────────────────────────────────────────────────────────────────
// InstrumentsService — criterios 1-4, 6
// ─────────────────────────────────────────────────────────────────────────────

describe('InstrumentsService — exposición de auditoría (spec 53)', () => {
  let service: InstrumentsService;
  let instrumentsRepository: {
    find: jest.Mock<Promise<unknown[]>, [unknown]>;
    createQueryBuilder: jest.Mock;
  };
  let qb: QueryBuilderMock;

  const instrumentoConAutor = {
    instrumentId: INSTRUMENT_ID,
    name: 'TEST Spec53 Auditoría',
    actorTypes: [],
    createdBy: AUTOR,
    updatedBy: null,
  };

  beforeEach(async () => {
    qb = crearQueryBuilderMock({
      getOne: jest.fn().mockResolvedValue(instrumentoConAutor),
      getMany: jest.fn().mockResolvedValue([instrumentoConAutor]),
    });

    instrumentsRepository = {
      find: jest
        .fn<Promise<unknown[]>, [unknown]>()
        .mockResolvedValue([instrumentoConAutor]),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

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

  it('criterio 1: findOne carga createdBy y updatedBy vía createQueryBuilder', async () => {
    await service.findOne(INSTRUMENT_ID);

    expect(qb.leftJoin).toHaveBeenCalledWith(
      'instrument.createdBy',
      'createdBy',
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'instrument.updatedBy',
      'updatedBy',
    );
  });

  it('criterio 1: findOne no pierde la relación que ya cargaba (no regresión)', async () => {
    await service.findOne(INSTRUMENT_ID);

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
      'instrument.actorTypes',
      'actorType',
    );
  });

  it('criterio 1: devuelve el autor con la forma { userId, name, lastName }', async () => {
    const instrumento = await service.findOne(INSTRUMENT_ID);

    expect(instrumento.createdBy).toEqual(AUTOR);
  });

  it('criterio 2: devuelve null cuando la fila no tiene autor (instrumento de seed)', async () => {
    qb.getOne.mockResolvedValue({
      ...instrumentoConAutor,
      createdBy: null,
      updatedBy: null,
    });

    const instrumento = await service.findOne(INSTRUMENT_ID);

    expect(instrumento.createdBy ?? null).toBeNull();
    expect(instrumento.updatedBy ?? null).toBeNull();
  });

  it('criterio 3: proyecta solo userId, name y lastName del usuario', async () => {
    await service.findOne(INSTRUMENT_ID);

    const columnas = columnasSeleccionadas(qb.addSelect);
    expect(columnas.length).toBeGreaterThan(0);
    for (const columna of columnas) {
      for (const campo of CAMPOS_PROHIBIDOS) {
        expect(columna.toLowerCase()).not.toContain(campo.toLowerCase());
      }
    }
    expect(columnas).toEqual(
      expect.arrayContaining([
        'createdBy.userId',
        'createdBy.name',
        'createdBy.lastName',
        'updatedBy.userId',
        'updatedBy.name',
        'updatedBy.lastName',
      ]),
    );
  });

  it('criterio 4: findAll incluye las mismas relaciones de auditoría', async () => {
    await service.findAll();

    expect(qb.leftJoin).toHaveBeenCalledWith(
      'instrument.createdBy',
      'createdBy',
    );
    expect(qb.leftJoin).toHaveBeenCalledWith(
      'instrument.updatedBy',
      'updatedBy',
    );
  });

  it('criterio 4: findAll resuelve en una sola consulta (sin N+1)', async () => {
    await service.findAll();

    expect(instrumentsRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(qb.getMany).toHaveBeenCalledTimes(1);
  });

  it('criterio 6: findOneForRender NO carga auditoría (payload de la app móvil intacto)', async () => {
    const qbRender = crearQueryBuilderMock({
      getOne: jest.fn().mockResolvedValue(instrumentoConAutor),
    });
    instrumentsRepository.createQueryBuilder.mockReturnValueOnce(qbRender);

    await service.findOneForRender(INSTRUMENT_ID);

    const joins = (qbRender.leftJoinAndSelect.mock.calls as unknown[][]).map(
      (c) => String(c[0]),
    );
    expect(joins).not.toContain('instrument.createdBy');
    expect(joins).not.toContain('instrument.updatedBy');
    expect(qbRender.leftJoin).not.toHaveBeenCalledWith(
      'instrument.createdBy',
      'createdBy',
    );
  });

  it('criterio 7: findAllPublic no expone datos de auditoría', async () => {
    instrumentsRepository.find.mockResolvedValue([]);

    await service.findAllPublic();

    const options = instrumentsRepository.find.mock.calls[0][0] as {
      select?: unknown;
    };
    const select = JSON.stringify(options?.select ?? {});
    expect(select).not.toContain('createdBy');
    expect(select).not.toContain('updatedBy');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CampaignsService — criterio 5 (gap NO documentado en el backlog)
// ─────────────────────────────────────────────────────────────────────────────

describe('CampaignsService — exposición de auditoría (spec 53)', () => {
  let service: CampaignsService;
  let campaignsRepository: {
    createQueryBuilder: jest.Mock;
  };
  let qb: QueryBuilderMock;

  const campanaConAutor = {
    campaignId: CAMPAIGN_ID,
    name: 'TEST Spec53 Campaña',
    steps: [],
    createdBy: AUTOR,
    updatedBy: null,
  };

  beforeEach(async () => {
    qb = crearQueryBuilderMock({
      getOne: jest.fn().mockResolvedValue(campanaConAutor),
    });

    campaignsRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        {
          provide: getRepositoryToken(Campaign),
          useValue: campaignsRepository,
        },
        { provide: getRepositoryToken(CampaignSession), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(TypeOfCrop), useValue: {} },
      ],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
  });

  it('criterio 5: findOne carga createdBy y updatedBy', async () => {
    await service.findOne(CAMPAIGN_ID);

    expect(qb.leftJoin).toHaveBeenCalledWith('campaign.createdBy', 'createdBy');
    expect(qb.leftJoin).toHaveBeenCalledWith('campaign.updatedBy', 'updatedBy');
  });

  it('criterio 5: findOne conserva las relaciones de pasos y condiciones (no regresión)', async () => {
    await service.findOne(CAMPAIGN_ID);

    const joins = (qb.leftJoinAndSelect.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(joins).toEqual(
      expect.arrayContaining(['campaign.steps', 'steps.instrument']),
    );
  });

  it('criterio 5: devuelve el autor con la forma { userId, name, lastName }', async () => {
    const campana = await service.findOne(CAMPAIGN_ID);

    expect(campana.createdBy).toEqual(AUTOR);
  });

  it('criterio 5: devuelve null cuando la campaña no tiene autor', async () => {
    qb.getOne.mockResolvedValue({
      ...campanaConAutor,
      createdBy: null,
      updatedBy: null,
    });

    const campana = await service.findOne(CAMPAIGN_ID);

    expect(campana.createdBy ?? null).toBeNull();
  });
});
