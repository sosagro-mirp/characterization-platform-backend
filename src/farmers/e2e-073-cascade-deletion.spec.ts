import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FarmersService } from './farmers.service';
import { FarmersController } from './farmers.controller';
import { ROLES } from '../auth/constants';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { ConsentRecordsService } from '../consents/consent-records.service';

/**
 * Spec 73 — Borrado en cascada de un agricultor desde el panel.
 *
 * Cubre los criterios de aceptación 1-8 de
 * `spec/73_borrado_en_cascada_agricultor.md` (9-12 son de UI: ver
 * `frontend/lib/farmers/e2e-073-cascadeDeletion.test.ts` y la ronda manual
 * `docs/testing/test-073-borrado-cascada-agricultor.md`).
 *
 * ARRANCA EN ROJO: `FarmersService` no tiene hoy `getDeletionPreview()` ni
 * `removeCascade()`, y `FarmersController` no expone
 * `GET :id/deletion-preview` ni `DELETE :id/cascade`.
 *
 * Las dos trampas del modelo que el spec obliga a cubrir (ver "Contexto" del
 * spec, ya pagadas en `docs/testing/limpieza-produccion-2026-08-24.sql`):
 *  A) una encuesta puede vincularse solo por `campaign_session_id`, con
 *     `surveys.farmer_id` en NULL;
 *  B) `Farmer.farm` puede estar compartida con otro agricultor (`SET NULL`,
 *     `OneToMany` en `Farm.farmers`) y no debe borrarse a ciegas.
 */

const FARMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_FARMER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FARM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SESSION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const SURVEY_DIRECT_ID = '11111111-1111-4111-8111-111111111111';
const SURVEY_VIA_SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('FarmersService — borrado en cascada (spec 73)', () => {
  let service: FarmersService;

  let farmersRepository: {
    findOne: jest.Mock;
    manager: { transaction: jest.Mock; query: jest.Mock };
  };
  let farmsRepository: { findOne: jest.Mock };
  let sessionsRepository: { find: jest.Mock };
  let surveysRepository: { find: jest.Mock };
  let documentCollisionsRepository: { count: jest.Mock };

  /** Nombre de entidad u operación que la transacción tocó, en orden. */
  let deletionOrder: string[];
  let transactionManager: { delete: jest.Mock; query: jest.Mock };

  const farmerFixture = {
    id: FARMER_ID,
    name: 'Rosalba TEST',
    documentId: '9000730001',
    farm: { farmId: FARM_ID, name: 'La Esperanza TEST' },
  };

  function entityName(entity: unknown): string {
    return typeof entity === 'function' ? entity.name : String(entity);
  }

  /** Escenario por defecto: 1 sesión, 2 encuestas (una solo por sesión), finca exclusiva. */
  function setupDefaultCounts() {
    sessionsRepository.find.mockResolvedValue([{ sessionId: SESSION_ID }]);
    surveysRepository.find.mockResolvedValue([
      { surveyId: SURVEY_DIRECT_ID },
      { surveyId: SURVEY_VIA_SESSION_ID },
    ]);
    documentCollisionsRepository.count.mockResolvedValue(0);
    farmsRepository.findOne.mockResolvedValue({
      farmId: FARM_ID,
      name: 'La Esperanza TEST',
      farmers: [{ id: FARMER_ID }],
    });
    farmersRepository.manager.query.mockImplementation((sql: string) => {
      if (/responses/i.test(sql)) return Promise.resolve([{ count: 30 }]);
      if (/farmers_technologies|farmers_obstacles/i.test(sql))
        return Promise.resolve([{ count: 0 }]);
      if (/change_requests/i.test(sql)) return Promise.resolve([{ count: 0 }]);
      return Promise.resolve([{ count: 0 }]);
    });
  }

  beforeEach(async () => {
    deletionOrder = [];

    transactionManager = {
      delete: jest.fn((entity: unknown) => {
        deletionOrder.push(entityName(entity));
        return Promise.resolve({ affected: 1 });
      }),
      query: jest.fn((sql: string) => {
        deletionOrder.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        return Promise.resolve([]);
      }),
    };

    farmersRepository = {
      findOne: jest.fn().mockResolvedValue(farmerFixture),
      manager: {
        transaction: jest.fn((cb: (m: typeof transactionManager) => unknown) =>
          Promise.resolve(cb(transactionManager)),
        ),
        query: jest.fn().mockResolvedValue([{ count: 0 }]),
      },
    };
    farmsRepository = { findOne: jest.fn().mockResolvedValue(null) };
    sessionsRepository = { find: jest.fn().mockResolvedValue([]) };
    surveysRepository = { find: jest.fn().mockResolvedValue([]) };
    documentCollisionsRepository = { count: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FarmersController],
      providers: [
        FarmersService,
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Farm), useValue: farmsRepository },
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
        // Spec 78 — FarmersController.getConsentStatus y
        // FarmersService.findAll (Fase 10) dependen de esto.
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

  // ───────────────────────────────────────────────────────────────────────────
  // Criterio 1 y 2 — inventario previo
  // ───────────────────────────────────────────────────────────────────────────

  it('criterio 1: el preview devuelve el inventario de lo que se borraría', async () => {
    setupDefaultCounts();

    const preview = await service.getDeletionPreview(FARMER_ID);

    expect(preview.farmerId).toBe(FARMER_ID);
    expect(preview.counts.campaignSessions).toBe(1);
    expect(preview.counts.surveys).toBe(2);
    expect(preview.counts.responses).toBe(30);
    expect(preview.counts).toHaveProperty('documentCollisions');
  });

  it('criterio 1: el preview no borra nada', async () => {
    setupDefaultCounts();

    await service.getDeletionPreview(FARMER_ID);

    expect(farmersRepository.manager.transaction).not.toHaveBeenCalled();
    expect(deletionOrder).toEqual([]);
  });

  it('criterio 2: cuenta las encuestas vinculadas solo por campaign_session, sin duplicar', async () => {
    setupDefaultCounts();

    const preview = await service.getDeletionPreview(FARMER_ID);

    // El repositorio mockeado ya devuelve el conjunto deduplicado (así lo
    // resuelve TypeORM con el `where` de dos ramas); lo que se verifica aquí
    // es que el servicio use ese resultado sin recontar.
    expect(preview.counts.surveys).toBe(2);
    const calls = surveysRepository.find.mock.calls as [{ where: unknown }][];
    expect(calls[0][0].where).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ farmer: { id: FARMER_ID } }),
      ]),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Criterio 3, 4, 5 — borrado
  // ───────────────────────────────────────────────────────────────────────────

  it('criterio 3: borra dentro de una única transacción', async () => {
    setupDefaultCounts();

    await service.removeCascade(FARMER_ID);

    expect(farmersRepository.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('criterio 3: borra las encuestas antes que el agricultor', async () => {
    setupDefaultCounts();

    await service.removeCascade(FARMER_ID);

    const surveysAt = deletionOrder.findIndex((e) => e === 'Survey');
    const farmerAt = deletionOrder.findIndex((e) => e === 'Farmer');

    expect(surveysAt).toBeGreaterThanOrEqual(0);
    expect(farmerAt).toBeGreaterThanOrEqual(0);
    expect(surveysAt).toBeLessThan(farmerAt);
  });

  it('criterio 3: devuelve el inventario de lo efectivamente borrado', async () => {
    setupDefaultCounts();

    const result = await service.removeCascade(FARMER_ID);

    expect(result.farmerId).toBe(FARMER_ID);
    expect(result.counts.surveys).toBe(2);
    expect(result.counts.campaignSessions).toBe(1);
  });

  it('criterio 4: borra la finca cuando es exclusiva del agricultor', async () => {
    setupDefaultCounts();

    const result = await service.removeCascade(FARMER_ID);

    expect(result.farm?.shared).toBe(false);
    expect(result.farm?.willBeDeleted).toBe(true);
    expect(result.counts.farms).toBe(1);
    expect(
      transactionManager.delete.mock.calls.some(
        ([entity]) => entityName(entity) === 'Farm',
      ),
    ).toBe(true);
  });

  it('criterio 4: conserva la finca compartida con otro agricultor', async () => {
    setupDefaultCounts();
    farmsRepository.findOne.mockResolvedValue({
      farmId: FARM_ID,
      name: 'La Esperanza TEST',
      farmers: [{ id: FARMER_ID }, { id: OTHER_FARMER_ID }],
    });

    const result = await service.removeCascade(FARMER_ID);

    expect(result.farm?.shared).toBe(true);
    expect(result.farm?.willBeDeleted).toBe(false);
    expect(result.counts.farms).toBe(0);
    expect(
      transactionManager.delete.mock.calls.some(
        ([entity]) => entityName(entity) === 'Farm',
      ),
    ).toBe(false);
  });

  it('criterio 5: si un paso falla, la transacción propaga el error y nada más se borra', async () => {
    setupDefaultCounts();
    const boom = new Error('deadlock detected');
    transactionManager.delete.mockImplementation((entity: unknown) => {
      const name = entityName(entity);
      if (name === 'Survey') return Promise.reject(boom);
      deletionOrder.push(name);
      return Promise.resolve({ affected: 1 });
    });

    await expect(service.removeCascade(FARMER_ID)).rejects.toThrow(boom);

    expect(deletionOrder).not.toContain('Farmer');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Criterio 6 — agricultor inexistente
  // ───────────────────────────────────────────────────────────────────────────

  it('criterio 6: preview de un agricultor inexistente lanza NotFoundException', async () => {
    farmersRepository.findOne.mockResolvedValue(null);

    await expect(service.getDeletionPreview(FARMER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('criterio 6: borrado de un agricultor inexistente lanza NotFoundException', async () => {
    farmersRepository.findOne.mockResolvedValue(null);

    await expect(service.removeCascade(FARMER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(farmersRepository.manager.transaction).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Criterio 7 — solo ADMIN
  // ───────────────────────────────────────────────────────────────────────────

  it('criterio 7: el preview y el borrado en cascada están restringidos a ADMIN', () => {
    const prototype = FarmersController.prototype as unknown as Record<
      string,
      unknown
    >;

    expect(typeof prototype.getDeletionPreview).toBe('function');
    expect(typeof prototype.removeCascade).toBe('function');

    const previewRoles: unknown = Reflect.getMetadata(
      'roles',
      prototype.getDeletionPreview as object,
    );
    const cascadeRoles: unknown = Reflect.getMetadata(
      'roles',
      prototype.removeCascade as object,
    );

    expect(previewRoles).toEqual([ROLES.ADMIN]);
    expect(cascadeRoles).toEqual([ROLES.ADMIN]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Criterio 8 — no regresión del spec 50
  // ───────────────────────────────────────────────────────────────────────────

  it('criterio 8: `remove()` (sin cascada) sigue existiendo, separado de `removeCascade`', () => {
    // El comportamiento 409/blockedBy de `remove()` (spec 50) ya está
    // cubierto en `e2e-050-safe-deletion.spec.ts`; aquí solo interesa que
    // `removeCascade` no lo haya reemplazado ni alterado su firma.
    expect(typeof service.remove).toBe('function');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(service.remove).not.toBe(service.removeCascade);
  });
});
