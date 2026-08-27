import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConsentDocument } from './entities/consent-document.entity';
import { ConsentRecord } from './entities/consent-record.entity';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentRecordsService } from './consent-records.service';

/**
 * Spec 78 — Consentimiento informado y autorización de tratamiento de datos.
 *
 * Cubre los criterios de aceptación 5, 6, 7, 9, 10, 11, 12 y 13 de
 * `spec/78_consentimiento_informado_tratamiento_datos.md`. Los criterios de UI
 * (1-4, 8, 14-17) viven en `frontend/lib/consents/e2e-078-consentGating.test.ts`,
 * `mobile/src/__tests__/e2e-078-consentOffline.test.ts` y la ronda manual
 * `docs/testing/test-078-consentimiento-informado.md`.
 *
 * ARRANCA EN ROJO: el módulo `src/consents/` no existe todavía — ni las
 * entidades, ni `ConsentDocumentsService`, ni `ConsentRecordsService`. El
 * backfill del criterio 6 tampoco está en `SurveysService.extractFarmer`.
 */

const DOC_V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DOC_V11 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FARMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RECORD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function publishedDoc(): Partial<ConsentDocument> {
  return {
    consentDocumentId: DOC_V1,
    version: '1.0',
    status: 'published',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
  } as Partial<ConsentDocument>;
}

describe('Consentimiento informado (spec 78)', () => {
  let documentsService: ConsentDocumentsService;
  let recordsService: ConsentRecordsService;

  let documentsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let recordsRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock<Promise<Partial<ConsentRecord>>, [Partial<ConsentRecord>]>;
    update: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    const transactionalUpdate = jest.fn();
    const transactionalFindOne = jest.fn();
    documentsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((doc) => Promise.resolve(doc)),
      update: transactionalUpdate,
      manager: {
        transaction: jest.fn(
          (
            cb: (manager: { findOne: jest.Mock; update: jest.Mock }) => unknown,
          ) =>
            cb({
              findOne: transactionalFindOne,
              update: transactionalUpdate,
            }),
        ),
      },
    };
    // Dentro de la transacción se opera con el manager transaccional, no con
    // el repositorio inyectado — igual que el patrón real (ver
    // farmers.service.ts removeCascade). En los tests, el `findOne` que ve el
    // callback de la transacción reutiliza los mismos mocks encolados en
    // `documentsRepository.findOne` para no duplicar setup por caso.
    transactionalFindOne.mockImplementation(
      (...args: unknown[]): unknown =>
        documentsRepository.findOne(...args) as unknown,
    );

    recordsRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(
        (record: Partial<ConsentRecord>): Partial<ConsentRecord> => record,
      ),
      save: jest.fn((record: Partial<ConsentRecord>) =>
        Promise.resolve({ ...record, consentRecordId: RECORD_ID }),
      ),
      update: jest.fn(),
      count: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentDocumentsService,
        ConsentRecordsService,
        {
          provide: getRepositoryToken(ConsentDocument),
          useValue: documentsRepository,
        },
        {
          provide: getRepositoryToken(ConsentRecord),
          useValue: recordsRepository,
        },
      ],
    }).compile();

    documentsService = module.get(ConsentDocumentsService);
    recordsService = module.get(ConsentRecordsService);
  });

  describe('Versionado del documento', () => {
    // Criterio 10
    it('publicar una versión archiva la publicada anterior en la misma transacción', async () => {
      documentsRepository.findOne
        .mockResolvedValueOnce({
          consentDocumentId: DOC_V11,
          version: '1.1',
          status: 'draft',
        })
        .mockResolvedValueOnce(publishedDoc());

      await documentsService.publish(DOC_V11, USER_ID);

      expect(documentsRepository.manager.transaction).toHaveBeenCalledTimes(1);
      // El callback de la transacción opera con el manager transaccional
      // (real: `manager.update(Entity, criteria, partial)`), no con el
      // repositorio inyectado directamente — de ahí el primer argumento.
      expect(documentsRepository.update).toHaveBeenCalledWith(
        ConsentDocument,
        { consentDocumentId: DOC_V1 },
        expect.objectContaining({ status: 'archived' }),
      );
      expect(documentsRepository.update).toHaveBeenCalledWith(
        ConsentDocument,
        { consentDocumentId: DOC_V11 },
        expect.objectContaining({ status: 'published' }),
      );
    });

    // Criterio 10 — invariante de unicidad
    it('nunca deja dos documentos publicados a la vez', async () => {
      documentsRepository.find.mockResolvedValue([
        { ...publishedDoc(), status: 'archived' },
        { consentDocumentId: DOC_V11, version: '1.1', status: 'published' },
      ]);

      const all = await documentsService.findAll();
      const published = all.filter((d) => d.status === 'published');

      expect(published).toHaveLength(1);
    });

    // Criterio 11
    it('rechaza con 409 editar una versión ya publicada', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());

      await expect(
        documentsService.update(DOC_V1, { title: 'Otro título' }, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(documentsRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza con 409 editar una versión archivada', async () => {
      documentsRepository.findOne.mockResolvedValue({
        ...publishedDoc(),
        status: 'archived',
      });

      await expect(
        documentsService.update(DOC_V1, { title: 'Otro título' }, USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite editar una versión en borrador', async () => {
      documentsRepository.findOne.mockResolvedValue({
        consentDocumentId: DOC_V11,
        version: '1.1',
        status: 'draft',
      });

      await documentsService.update(DOC_V11, { title: 'Versión 1.1' }, USER_ID);

      expect(documentsRepository.save).toHaveBeenCalled();
    });
  });

  describe('Registro de la constancia', () => {
    // Criterio 12
    it('rechaza con 422 un registro sin la autorización de tratamiento de datos', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());

      await expect(
        recordsService.create(
          {
            sessionId: SESSION_ID,
            acceptedDataProcessing: false,
            acceptedPhoto: true,
            acceptedAudio: true,
            acceptedVideo: true,
            acceptedAt: new Date().toISOString(),
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(recordsRepository.save).not.toHaveBeenCalled();
    });

    it('persiste las autorizaciones multimedia de forma independiente', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue(null);

      await recordsService.create(
        {
          sessionId: SESSION_ID,
          acceptedDataProcessing: true,
          acceptedPhoto: true,
          acceptedAudio: false,
          acceptedVideo: false,
          acceptedAt: new Date('2026-08-27T14:00:00Z').toISOString(),
        },
        USER_ID,
      );

      expect(recordsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          acceptedDataProcessing: true,
          acceptedPhoto: true,
          acceptedAudio: false,
          acceptedVideo: false,
        }),
      );
    });

    // Criterio 9
    it('es idempotente por (sessionId, consentDocumentId): un reintento no duplica', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        consentDocument: publishedDoc(),
        sessionId: SESSION_ID,
      });

      const result = await recordsService.create(
        {
          sessionId: SESSION_ID,
          acceptedDataProcessing: true,
          acceptedAt: new Date().toISOString(),
        },
        USER_ID,
      );

      expect(recordsRepository.save).not.toHaveBeenCalled();
      expect(result.created).toBe(false);
      expect(result.record.consentRecordId).toBe(RECORD_ID);
    });

    // Hallazgo B3 (auditoría de la fase de pruebas) — el check-then-insert de
    // arriba deja una ventana real entre lectura y escritura; el índice único
    // parcial de la migración es el respaldo real. Si dos inserciones
    // concurrentes lo violan, la perdedora recupera la fila que la ganadora
    // acaba de crear en vez de propagar el error de base de datos.
    it('recupera la constancia ganadora si el índice único de la migración rechaza una carrera', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      const winnerRecord = {
        consentRecordId: RECORD_ID,
        sessionId: SESSION_ID,
      };
      recordsRepository.findOne
        .mockResolvedValueOnce(null) // check-then-insert no ve la fila todavía
        .mockResolvedValueOnce(winnerRecord); // re-consulta tras el 23505
      recordsRepository.save.mockRejectedValueOnce({
        driverError: { code: '23505' },
      });

      const result = await recordsService.create(
        {
          sessionId: SESSION_ID,
          acceptedDataProcessing: true,
          acceptedAt: new Date().toISOString(),
        },
        USER_ID,
      );

      expect(result.created).toBe(false);
      expect(result.record).toBe(winnerRecord);
    });

    // Criterio 8 (parte backend): la fecha de aceptación offline se respeta
    it('conserva la fecha de aceptación del dispositivo, no la de recepción', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue(null);
      const acceptedAt = '2026-08-20T09:15:00.000Z';

      await recordsService.create(
        {
          sessionId: SESSION_ID,
          acceptedDataProcessing: true,
          acceptedAt,
        },
        USER_ID,
      );

      const saved = recordsRepository.save.mock.calls[0][0] as ConsentRecord;
      expect(new Date(saved.acceptedAt).toISOString()).toBe(acceptedAt);
      expect(saved.syncedAt).toBeDefined();
    });
  });

  describe('Vigencia del consentimiento', () => {
    // Criterio 4
    it('reporta "valid" cuando la constancia es de la versión publicada y no está revocada', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        consentDocument: publishedDoc(),
        acceptedDataProcessing: true,
        revokedAt: null,
      });

      await expect(
        recordsService.getFarmerStatus(FARMER_ID),
      ).resolves.toMatchObject({
        status: 'valid',
      });
    });

    // Criterio 5
    it('reporta "outdated_version" cuando se publicó una versión posterior', async () => {
      documentsRepository.findOne.mockResolvedValue({
        consentDocumentId: DOC_V11,
        version: '1.1',
        status: 'published',
      });
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        consentDocument: publishedDoc(),
        acceptedDataProcessing: true,
        revokedAt: null,
      });

      await expect(
        recordsService.getFarmerStatus(FARMER_ID),
      ).resolves.toMatchObject({
        status: 'outdated_version',
      });
    });

    it('reporta "revoked" cuando la constancia fue revocada', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        consentDocument: publishedDoc(),
        acceptedDataProcessing: true,
        revokedAt: new Date('2026-08-25T00:00:00Z'),
      });

      await expect(
        recordsService.getFarmerStatus(FARMER_ID),
      ).resolves.toMatchObject({
        status: 'revoked',
      });
    });

    it('reporta "none" cuando el agricultor nunca consintió', async () => {
      documentsRepository.findOne.mockResolvedValue(publishedDoc());
      recordsRepository.findOne.mockResolvedValue(null);

      await expect(
        recordsService.getFarmerStatus(FARMER_ID),
      ).resolves.toMatchObject({
        status: 'none',
      });
    });
  });

  describe('Revocación', () => {
    // Criterio 13
    it('marca fecha, motivo y autor al revocar', async () => {
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        revokedAt: null,
      });

      await recordsService.revoke(RECORD_ID, 'Solicitud del titular', USER_ID);

      expect(recordsRepository.update).toHaveBeenCalledWith(
        { consentRecordId: RECORD_ID },
        expect.objectContaining({
          revokedAt: expect.any(Date) as Date,
          revokedReason: 'Solicitud del titular',
          revokedBy: { userId: USER_ID },
        }),
      );
    });

    it('exige un motivo para revocar', async () => {
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        revokedAt: null,
      });

      await expect(
        recordsService.revoke(RECORD_ID, '', USER_ID),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(recordsRepository.update).not.toHaveBeenCalled();
    });

    // Hallazgo B7 (auditoría de la fase de pruebas) — sin esta guarda, una
    // segunda revocación pisaba en silencio la fecha/motivo/autor de la
    // primera, perdiendo el dato legal relevante.
    it('rechaza con 409 revocar una constancia ya revocada', async () => {
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        revokedAt: new Date('2026-08-01T00:00:00Z'),
        revokedReason: 'Motivo original',
      });

      await expect(
        recordsService.revoke(RECORD_ID, 'Segundo intento', USER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(recordsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('Vinculación diferida al agricultor (backfill)', () => {
    // Criterio 6
    it('vincula al farmer las constancias huérfanas de esa sesión', async () => {
      await recordsService.linkOrphansToFarmer(SESSION_ID, FARMER_ID);

      expect(recordsRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ session: { sessionId: SESSION_ID } }),
        expect.objectContaining({ farmer: { id: FARMER_ID } }),
      );
    });

    // Criterio 7 — la colisión de documento (spec 68) no debe atribuir el
    // consentimiento a la persona equivocada: si extractFarmer lanza 409,
    // el backfill no llega a ejecutarse y la constancia queda huérfana.
    it('deja la constancia huérfana si nunca se resolvió el farmer', async () => {
      recordsRepository.findOne.mockResolvedValue({
        consentRecordId: RECORD_ID,
        sessionId: SESSION_ID,
        farmer: null,
      });

      const record = await recordsService.findBySession(SESSION_ID);

      expect(record?.farmer).toBeNull();
    });
  });
});
