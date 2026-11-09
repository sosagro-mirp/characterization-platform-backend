import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConsentDocument } from './entities/consent-document.entity';
import { ConsentRecord } from './entities/consent-record.entity';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentRecordsService } from './consent-records.service';
import { Farmer } from '../farmers/entities/farmer.entity';
import { Survey } from '../surveys/entities/survey.entity';

/**
 * Spec 102 — Flujo del encuestador por productor en la web (H7): ancla del
 * consentimiento sin sesión de campaña. `spec/102_encuestador_web_por_productor.md`.
 *
 * ARRANCA EN ROJO: hoy `CreateConsentRecordDto.sessionId` es obligatorio y
 * `ConsentRecordsService.create` busca la constancia existente solo por
 * (sesión, documento), así que una petición sin `sessionId` no se rechaza con
 * 400 ni se ancla al productor o a la encuesta.
 *
 * Cubre la parte unitaria de C12 (exactamente un ancla; idempotencia por ancla;
 * contrato con `sessionId` intacto). Los 404 de productor/encuesta
 * inexistentes, la herencia del productor de la encuesta (C13) y la regla de
 * constancias revocadas se prueban contra la base en
 * `test/e2e-102-encuestador-web.e2e-spec.ts`.
 *
 * El servicio puede inyectar los repositorios de `Farmer` y `Survey` para
 * validar el ancla; el módulo de prueba los provee (por defecto encuentran la
 * entidad). No se modifica `e2e-078-consentimiento-informado.spec.ts`.
 */

const DOC_V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FARMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SURVEY_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const RECORD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function publishedDoc(): Partial<ConsentDocument> {
  return {
    consentDocumentId: DOC_V1,
    version: '1.0',
    status: 'published',
    publishedAt: new Date('2026-08-01T00:00:00Z'),
  } as Partial<ConsentDocument>;
}

function baseDto(anchor: Record<string, string>) {
  return {
    ...anchor,
    acceptedDataProcessing: true,
    acceptedAt: '2026-11-07T10:00:00.000Z',
  } as never;
}

describe('Consentimiento con ancla sin sesión (spec 102)', () => {
  let service: ConsentRecordsService;
  let documentsRepository: { findOne: jest.Mock };
  let recordsRepository: {
    findOne: jest.Mock;
    create: jest.Mock<Partial<ConsentRecord>, [Partial<ConsentRecord>]>;
    save: jest.Mock;
  };
  let farmersRepository: { findOne: jest.Mock; exists: jest.Mock };
  let surveysRepository: { findOne: jest.Mock; exists: jest.Mock };

  beforeEach(async () => {
    documentsRepository = {
      findOne: jest.fn().mockResolvedValue(publishedDoc()),
    };
    recordsRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        (record: Partial<ConsentRecord>): Partial<ConsentRecord> => record,
      ),
      save: jest.fn((record: Partial<ConsentRecord>) =>
        Promise.resolve({ ...record, consentRecordId: RECORD_ID }),
      ),
    };
    farmersRepository = {
      findOne: jest.fn().mockResolvedValue({ id: FARMER_ID }),
      exists: jest.fn().mockResolvedValue(true),
    };
    surveysRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ surveyId: SURVEY_ID, farmer: null }),
      exists: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsentDocumentsService,
        ConsentRecordsService,
        {
          provide: getRepositoryToken(ConsentDocument),
          useValue: { ...documentsRepository, find: jest.fn() },
        },
        {
          provide: getRepositoryToken(ConsentRecord),
          useValue: recordsRepository,
        },
        { provide: getRepositoryToken(Farmer), useValue: farmersRepository },
        { provide: getRepositoryToken(Survey), useValue: surveysRepository },
      ],
    }).compile();

    service = module.get(ConsentRecordsService);
  });

  describe('C12 — exactamente un ancla', () => {
    it('sin sessionId, farmerId ni surveyId responde 400 y no persiste', async () => {
      await expect(service.create(baseDto({}))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(recordsRepository.save).not.toHaveBeenCalled();
    });

    it('con dos anclas responde 400 y no persiste', async () => {
      await expect(
        service.create(baseDto({ sessionId: SESSION_ID, farmerId: FARMER_ID })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(baseDto({ farmerId: FARMER_ID, surveyId: SURVEY_ID })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recordsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('C12 — ancla por productor', () => {
    it('crea la constancia vinculada al productor y sin sesión', async () => {
      const result = await service.create(baseDto({ farmerId: FARMER_ID }));
      expect(result.created).toBe(true);
      const created = recordsRepository.create.mock.calls[0][0];
      expect(created.farmer).toMatchObject({ id: FARMER_ID });
      expect(created.session ?? null).toBeNull();
    });

    it('es idempotente: si ya hay una constancia para (productor, documento), la devuelve', async () => {
      const existing = { consentRecordId: RECORD_ID, revokedAt: null };
      recordsRepository.findOne.mockResolvedValue(existing);
      const result = await service.create(baseDto({ farmerId: FARMER_ID }));
      expect(result).toEqual({ created: false, record: existing });
      expect(recordsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('C12 — ancla por encuesta', () => {
    it('crea la constancia vinculada a la encuesta y sin sesión', async () => {
      const result = await service.create(baseDto({ surveyId: SURVEY_ID }));
      expect(result.created).toBe(true);
      const created = recordsRepository.create.mock.calls[0][0];
      expect(created.survey).toMatchObject({ surveyId: SURVEY_ID });
      expect(created.session ?? null).toBeNull();
    });

    it('C13 — si la encuesta ya tiene productor, la constancia lo hereda', async () => {
      surveysRepository.findOne.mockResolvedValue({
        surveyId: SURVEY_ID,
        farmer: { id: FARMER_ID },
      });
      await service.create(baseDto({ surveyId: SURVEY_ID }));
      const created = recordsRepository.create.mock.calls[0][0];
      expect(created.farmer).toMatchObject({ id: FARMER_ID });
    });

    it('es idempotente por (encuesta, documento)', async () => {
      const existing = { consentRecordId: RECORD_ID };
      recordsRepository.findOne.mockResolvedValue(existing);
      const result = await service.create(baseDto({ surveyId: SURVEY_ID }));
      expect(result).toEqual({ created: false, record: existing });
      expect(recordsRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('C12 — el contrato con sessionId no cambia', () => {
    it('sigue creando la constancia anclada a la sesión', async () => {
      const result = await service.create(baseDto({ sessionId: SESSION_ID }));
      expect(result.created).toBe(true);
      const created = recordsRepository.create.mock.calls[0][0];
      expect(created.session).toMatchObject({ sessionId: SESSION_ID });
    });
  });
});
