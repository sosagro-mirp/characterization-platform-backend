import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InstrumentsService } from './instruments.service';
import { Instrument } from './entities/instrument.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Town } from 'src/towns/entities/town.entity';
import { User } from 'src/users/entities/user.entity';
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
 * ARRANCA EN ROJO. La captura del spec 26 funciona (los valores están en la
 * base), pero las lecturas nunca cargan las relaciones:
 *
 *   InstrumentsService.findOne()  → relations: { actorTypes: true }   (línea 106)
 *   InstrumentsService.findAll()  → relations: { actorTypes: true }   (línea 65)
 *   CampaignsService.findOne()    → relations: ['steps', 'steps.instrument', …]
 *
 * Sin `createdBy`/`updatedBy` en `relations`, `GET /api/instruments/:id` nunca
 * los devuelve y el panel web no tiene dónde mostrarlos. Eso bloqueó la
 * verificación de TC-048-04 desde la UI durante la ronda del spec 48.
 *
 * `change-requests.service.ts` (líneas 43, 76, 94) ya hace lo correcto y es la
 * referencia a seguir.
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

/** Campos del usuario que NO deben aparecer en la respuesta de auditoría. */
const CAMPOS_PROHIBIDOS = ['password', 'email', 'mustChangePassword', 'role'];

interface FindOptions {
  relations?: Record<string, unknown> | string[];
  select?: Record<string, unknown>;
}

function relacionaAuditoria(options: FindOptions | undefined): boolean {
  if (!options?.relations) return false;
  const { relations } = options;
  if (Array.isArray(relations)) {
    return relations.includes('createdBy') && relations.includes('updatedBy');
  }
  return Boolean(relations.createdBy) && Boolean(relations.updatedBy);
}

// ─────────────────────────────────────────────────────────────────────────────
// InstrumentsService — criterios 1-4, 6
// ─────────────────────────────────────────────────────────────────────────────

describe('InstrumentsService — exposición de auditoría (spec 53)', () => {
  let service: InstrumentsService;
  let instrumentsRepository: {
    find: jest.Mock<Promise<unknown[]>, [FindOptions]>;
    findOne: jest.Mock<Promise<unknown>, [FindOptions]>;
    createQueryBuilder: jest.Mock;
  };

  const instrumentoConAutor = {
    instrumentId: INSTRUMENT_ID,
    name: 'TEST Spec53 Auditoría',
    actorTypes: [],
    createdBy: AUTOR,
    updatedBy: null,
  };

  beforeEach(async () => {
    instrumentsRepository = {
      find: jest
        .fn<Promise<unknown[]>, [FindOptions]>()
        .mockResolvedValue([instrumentoConAutor]),
      findOne: jest
        .fn<Promise<unknown>, [FindOptions]>()
        .mockResolvedValue(instrumentoConAutor),
      createQueryBuilder: jest.fn(),
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
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
  });

  it('criterio 1: findOne carga las relaciones createdBy y updatedBy', async () => {
    await service.findOne(INSTRUMENT_ID);

    const options = instrumentsRepository.findOne.mock.calls[0][0];
    expect(relacionaAuditoria(options)).toBe(true);
  });

  it('criterio 1: findOne no pierde las relaciones que ya cargaba (no regresión)', async () => {
    await service.findOne(INSTRUMENT_ID);

    const options = instrumentsRepository.findOne.mock.calls[0][0];
    const relations = options.relations as Record<string, unknown>;
    expect(relations.actorTypes).toBeTruthy();
  });

  it('criterio 1: devuelve el autor con la forma { userId, name, lastName }', async () => {
    const instrumento = await service.findOne(INSTRUMENT_ID);

    expect(instrumento.createdBy).toEqual(AUTOR);
  });

  it('criterio 2: devuelve null cuando la fila no tiene autor (instrumento de seed)', async () => {
    instrumentsRepository.findOne.mockResolvedValue({
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

    const options = instrumentsRepository.findOne.mock.calls[0][0];
    const select = JSON.stringify(options.select ?? {});

    // La proyección debe ser explícita; ningún campo sensible del usuario debe
    // aparecer en la selección.
    expect(options.select).toBeDefined();
    for (const campo of CAMPOS_PROHIBIDOS) {
      expect(select).not.toContain(campo);
    }
  });

  it('criterio 4: findAll incluye las mismas relaciones de auditoría', async () => {
    await service.findAll();

    const options = instrumentsRepository.find.mock.calls[0][0];
    expect(relacionaAuditoria(options)).toBe(true);
  });

  it('criterio 4: findAll resuelve en una sola consulta (sin N+1)', async () => {
    await service.findAll();

    expect(instrumentsRepository.find).toHaveBeenCalledTimes(1);
    expect(instrumentsRepository.findOne).not.toHaveBeenCalled();
  });

  it('criterio 6: findOneForRender NO carga auditoría (payload de la app móvil intacto)', async () => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(instrumentoConAutor),
    };
    instrumentsRepository.createQueryBuilder.mockReturnValue(qb);

    await service.findOneForRender(INSTRUMENT_ID);

    const joins = (qb.leftJoinAndSelect.mock.calls as unknown[][]).map((c) =>
      String(c[0]),
    );
    expect(joins).not.toContain('instrument.createdBy');
    expect(joins).not.toContain('instrument.updatedBy');
  });

  it('criterio 7: findAllPublic no expone datos de auditoría', async () => {
    instrumentsRepository.find.mockResolvedValue([]);

    await service.findAllPublic();

    const options = instrumentsRepository.find.mock.calls[0][0];
    expect(relacionaAuditoria(options)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CampaignsService — criterio 5 (gap NO documentado en el backlog)
// ─────────────────────────────────────────────────────────────────────────────

describe('CampaignsService — exposición de auditoría (spec 53)', () => {
  let service: CampaignsService;
  let campaignsRepository: {
    find: jest.Mock<Promise<unknown[]>, [FindOptions]>;
    findOne: jest.Mock<Promise<unknown>, [FindOptions]>;
  };

  const campanaConAutor = {
    campaignId: CAMPAIGN_ID,
    name: 'TEST Spec53 Campaña',
    steps: [],
    createdBy: AUTOR,
    updatedBy: null,
  };

  beforeEach(async () => {
    campaignsRepository = {
      find: jest
        .fn<Promise<unknown[]>, [FindOptions]>()
        .mockResolvedValue([campanaConAutor]),
      findOne: jest
        .fn<Promise<unknown>, [FindOptions]>()
        .mockResolvedValue(campanaConAutor),
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

    const options = campaignsRepository.findOne.mock.calls[0][0];
    expect(relacionaAuditoria(options)).toBe(true);
  });

  it('criterio 5: findOne conserva las relaciones de pasos y condiciones (no regresión)', async () => {
    await service.findOne(CAMPAIGN_ID);

    const options = campaignsRepository.findOne.mock.calls[0][0];
    const relations = options.relations as string[];
    expect(relations).toEqual(
      expect.arrayContaining(['steps', 'steps.instrument']),
    );
  });

  it('criterio 5: devuelve el autor con la forma { userId, name, lastName }', async () => {
    const campana = await service.findOne(CAMPAIGN_ID);

    expect(campana.createdBy).toEqual(AUTOR);
  });

  it('criterio 5: devuelve null cuando la campaña no tiene autor', async () => {
    campaignsRepository.findOne.mockResolvedValue({
      ...campanaConAutor,
      createdBy: null,
      updatedBy: null,
    });

    const campana = await service.findOne(CAMPAIGN_ID);

    expect(campana.createdBy ?? null).toBeNull();
  });
});
