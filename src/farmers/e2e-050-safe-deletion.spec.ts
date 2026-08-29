import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { Farmer } from './entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSessionsService } from 'src/campaign-sessions/campaign-sessions.service';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { ConsentRecordsService } from '../consents/consent-records.service';

/**
 * Spec 50 — Borrado seguro de agricultores y sesiones de campaña.
 *
 * Cubre los criterios de aceptación 1-9 de
 * `spec/50_borrado_seguro_agricultores_y_sesiones.md`.
 *
 * ARRANCA EN ROJO por dos motivos distintos:
 *
 *  A) `FarmersService.remove()` (farmers.service.ts:112-115) es hoy:
 *
 *       const farmer = await this.findOne(id);
 *       await this.farmersRepository.remove(farmer);
 *
 *     Sin ningún manejo de error, y el servicio no inyecta los repositorios de
 *     `CampaignSession` ni de `Survey`. Cualquier violación de FK sube como
 *     `QueryFailedError` y NestJS la traduce a un 500 genérico. Dos FKs con
 *     `ON DELETE RESTRICT` apuntan a `farmers`:
 *       - `campaign_sessions.farmer_id` (campaign-session.entity.ts:31)
 *       - `surveys.farmer_id`           (survey.entity.ts:30-33)
 *     El backlog solo documentaba la primera; la segunda falla igual.
 *
 *  B) `CampaignSessionsService.remove()` NO EXISTE, y el controlador no expone
 *     `DELETE`. Sin él no hay forma de resolver la restricción vía API: en la
 *     ronda del spec 49 hubo que borrar la fila directamente en la base de
 *     datos, con aprobación explícita del usuario.
 *
 * ⚠️ La guarda de encuestas en el borrado de sesión NO es opcional:
 * `surveys.campaign_session_id` es CASCADE (survey.entity.ts:86-93) y
 * `responses.survey_id` también (response.entity.ts:23-25). Sin la guarda, un
 * DELETE de sesión borraría encuestas y respuestas de campo en silencio.
 */

const FARMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ─────────────────────────────────────────────────────────────────────────────
// FarmersService.remove — criterios 1-6
// ─────────────────────────────────────────────────────────────────────────────

describe('FarmersService.remove — borrado seguro (spec 50)', () => {
  let service: FarmersService;
  let farmersRepository: {
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let sessionsRepository: { count: jest.Mock };
  let surveysRepository: { count: jest.Mock };
  let documentCollisionsRepository: { count: jest.Mock };

  const farmerFixture = { id: FARMER_ID, name: 'Rosalba TEST' };

  beforeEach(async () => {
    farmersRepository = {
      findOne: jest.fn().mockResolvedValue(farmerFixture),
      remove: jest.fn().mockResolvedValue(farmerFixture),
    };
    sessionsRepository = { count: jest.fn().mockResolvedValue(0) };
    surveysRepository = { count: jest.fn().mockResolvedValue(0) };
    documentCollisionsRepository = { count: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Farm), useValue: {} },
        { provide: getRepositoryToken(Town), useValue: {} },
        {
          provide: getRepositoryToken(CampaignSession),
          useValue: sessionsRepository,
        },
        { provide: getRepositoryToken(Survey), useValue: surveysRepository },
        {
          provide: getRepositoryToken(FarmerDocumentCollision),
          useValue: documentCollisionsRepository,
        },
        {
          provide: ConsentRecordsService,
          useValue: {
            getPendingConsentMap: jest.fn().mockResolvedValue(new Map()),
          },
        },
      ],
    }).compile();

    service = module.get<FarmersService>(FarmersService);
  });

  it('criterio 1: borra un agricultor sin referencias (no regresión)', async () => {
    await expect(service.remove(FARMER_ID)).resolves.toBeUndefined();

    expect(farmersRepository.remove).toHaveBeenCalledWith(farmerFixture);
  });

  it('criterio 2: lanza ConflictException (no 500) si hay una sesión de campaña asociada', async () => {
    sessionsRepository.count.mockResolvedValue(1);

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('criterio 2: el mensaje del conflicto es el contrato acordado', async () => {
    sessionsRepository.count.mockResolvedValue(1);

    await expect(service.remove(FARMER_ID)).rejects.toThrow(
      'Farmer has related records and cannot be deleted',
    );
  });

  it('criterio 3: la respuesta enumera los recursos bloqueantes con su conteo', async () => {
    sessionsRepository.count.mockResolvedValue(2);
    surveysRepository.count.mockResolvedValue(5);

    try {
      await service.remove(FARMER_ID);
      fail('se esperaba un ConflictException');
    } catch (error) {
      const response = (error as ConflictException).getResponse() as {
        blockedBy?: { resource: string; count: number }[];
      };

      expect(response.blockedBy).toEqual(
        expect.arrayContaining([
          { resource: 'campaign_sessions', count: 2 },
          { resource: 'surveys', count: 5 },
        ]),
      );
    }
  });

  it('criterio 4: bloquea también por encuestas, no solo por sesiones', async () => {
    // Caso NO documentado en el backlog: un agricultor con encuestas
    // completadas y ninguna sesión abierta falla igual, por surveys.farmer_id.
    sessionsRepository.count.mockResolvedValue(0);
    surveysRepository.count.mockResolvedValue(3);

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('criterio 5: tras un conflicto el agricultor NO se borra', async () => {
    sessionsRepository.count.mockResolvedValue(1);

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(farmersRepository.remove).not.toHaveBeenCalled();
  });

  it('criterio 6: un agricultor inexistente sigue dando NotFoundException', async () => {
    farmersRepository.findOne.mockResolvedValue(null);

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // Regresión — hallazgo del @reviewer sobre spec 68
  // (docs/reports/auditorias/24-auditoria-backend-spec68.md): la nueva FK de
  // farmer_document_collisions.existing_farmer_id (ON DELETE RESTRICT) caía
  // antes en la red de seguridad genérica de más abajo (409 con blockedBy
  // vacío) en vez de nombrar explícitamente el recurso bloqueante.
  it('spec 68: bloquea también por colisiones de documentId registradas, con el recurso nombrado', async () => {
    documentCollisionsRepository.count.mockResolvedValue(1);

    try {
      await service.remove(FARMER_ID);
      fail('se esperaba un ConflictException');
    } catch (error) {
      const response = (error as ConflictException).getResponse() as {
        blockedBy?: { resource: string; count: number }[];
      };
      expect(response.blockedBy).toEqual(
        expect.arrayContaining([
          { resource: 'farmer_document_collisions', count: 1 },
        ]),
      );
    }
    expect(farmersRepository.remove).not.toHaveBeenCalled();
  });

  it('red de seguridad: traduce una violación de FK inesperada a ConflictException', async () => {
    // Si en el futuro se agrega una tabla que referencie `farmers` y nadie la
    // suma al conteo, el bug reaparecería como 500 sin este catch. El código
    // '23503' es `foreign_key_violation` en Postgres.
    const fkError = Object.assign(
      new Error('violates foreign key constraint'),
      {
        name: 'QueryFailedError',
        driverError: { code: '23503' },
      },
    );
    farmersRepository.remove.mockRejectedValue(fkError);

    await expect(service.remove(FARMER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CampaignSessionsService.remove — criterios 7-9
// ─────────────────────────────────────────────────────────────────────────────

describe('CampaignSessionsService.remove — borrado acotado (spec 50)', () => {
  let service: CampaignSessionsService;
  let sessionsRepository: {
    findOne: jest.Mock;
    remove: jest.Mock;
    delete: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let surveysRepository: { count: jest.Mock };

  /**
   * `remove()` corre dentro de `sessionsRepository.manager.transaction(cb)`
   * (fix del hallazgo 🟠-2 de `docs/reports/auditorias/14-auditoria-backend-spec50.md`
   * — lock pesimista para cerrar la ventana de carrera con el CASCADE). Este
   * mock simula el `EntityManager` transaccional: `createQueryBuilder(...)
   * .setLock(...).where(...).getOne()` para el lock, `getRepository(Survey)
   * .count(...)` para el conteo, y `remove(...)` para el borrado final.
   */
  const sessionFixture = { sessionId: SESSION_ID };
  let queryBuilder: {
    setLock: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  let transactionManager: {
    createQueryBuilder: jest.Mock;
    getRepository: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(sessionFixture),
    };
    surveysRepository = { count: jest.fn().mockResolvedValue(0) };
    transactionManager = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      getRepository: jest.fn(() => surveysRepository),
      remove: jest.fn().mockResolvedValue(sessionFixture),
    };

    sessionsRepository = {
      findOne: jest.fn().mockResolvedValue(sessionFixture),
      remove: jest.fn().mockResolvedValue(sessionFixture),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn((cb: (m: typeof transactionManager) => unknown) =>
          cb(transactionManager),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignSessionsService,
        {
          provide: getRepositoryToken(CampaignSession),
          useValue: sessionsRepository,
        },
        {
          provide: getRepositoryToken(Campaign),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(TypeOfCrop),
          useValue: { findBy: jest.fn() },
        },
        {
          provide: getRepositoryToken(Farmer),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Survey), useValue: surveysRepository },
      ],
    }).compile();

    service = module.get<CampaignSessionsService>(CampaignSessionsService);
  });

  it('criterio 7: borra una sesión sin encuestas asociadas', async () => {
    await expect(service.remove(SESSION_ID)).resolves.toBeUndefined();

    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(transactionManager.remove).toHaveBeenCalledWith(sessionFixture);
  });

  it('criterio 8: rechaza el borrado de una sesión con encuestas', async () => {
    surveysRepository.count.mockResolvedValue(2);

    await expect(service.remove(SESSION_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('criterio 8: el mensaje del conflicto es el contrato acordado', async () => {
    surveysRepository.count.mockResolvedValue(2);

    await expect(service.remove(SESSION_ID)).rejects.toThrow(
      'Campaign session has surveys and cannot be deleted',
    );
  });

  it('criterio 8: no borra nada cuando hay encuestas (protege el CASCADE)', async () => {
    // Sin esta guarda, el CASCADE de surveys.campaign_session_id y el de
    // responses.survey_id borrarían datos de campo en silencio.
    surveysRepository.count.mockResolvedValue(1);

    await expect(service.remove(SESSION_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionManager.remove).not.toHaveBeenCalled();
  });

  it('criterio 9: una sesión inexistente da NotFoundException', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    await expect(service.remove(SESSION_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
