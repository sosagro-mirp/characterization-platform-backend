/**
 * Spec 85 — Endurecimiento de privacidad de multimedia (Fases 3 y 6).
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `MediaAttachmentsService.getDownloadUrl` no
 * existe, `confirmUpload` todavía persiste `publicUrl` con
 * `storageService.buildPublicUrl(...)` y el `expiresAt` de `createPresignedUrl`
 * está hardcodeado en 300 s (`media-attachments.service.ts:89`).
 *
 * Cubre:
 *   - Criterio 1 y 2 — forma de la respuesta de `getDownloadUrl`, 404 y 409.
 *   - Criterio 3 — traza de auditoría con `userId` y `attachmentId`.
 *   - Criterio 7 — `confirmUpload` deja de escribir `publicUrl` PERO sigue
 *     devolviendo la clave con valor `null`: es lo que mantiene vivo el
 *     contrato del APK `preview` de las tabletas, que tipa
 *     `ConfirmUploadResponse` con ese campo aunque descarte la respuesta.
 *
 * Contrato que asume esta suite (la implementación debe respetarlo):
 *   getDownloadUrl(
 *     attachmentId: string,
 *     user: AuthenticatedUser,
 *   ): Promise<{
 *     attachmentId: string;
 *     url: string;
 *     expiresAt: string;      // ISO-8601, derivado de R2_DOWNLOAD_URL_EXPIRES_SECONDS
 *     mimeType: string;
 *     originalFilename: string | null;
 *   }>
 *
 * El servicio se construye con `Test.createTestingModule` y no con `new`, a
 * propósito: la implementación necesitará una dependencia más
 * (`ConfigService`, para el vencimiento) y así el orden de los parámetros del
 * constructor no queda congelado por el test.
 */

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import { StorageService } from 'src/storage/storage.service';
import type { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { MediaAttachmentsService } from './media-attachments.service';
import {
  MediaAttachment,
  MediaAttachmentStatus,
} from './entities/media-attachment.entity';

// ─── constantes del escenario ───────────────────────────────────────────────

const ATTACHMENT_ID = '11111111-1111-4111-8111-111111111111';
const SURVEY_ID = '22222222-2222-4222-8222-222222222222';
const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const STORAGE_KEY = `surveys/${SURVEY_ID}/questions/${QUESTION_ID}/${ATTACHMENT_ID}.jpg`;

const DOWNLOAD_EXPIRES_SECONDS = 900;
const UPLOAD_EXPIRES_SECONDS = 420;
const NOW = new Date('2026-09-18T12:00:00.000Z');

const actor: AuthenticatedUser = {
  userId: USER_ID,
  email: 'admin@sosagro.test',
  role: 'admin',
  mustChangePassword: false,
};

function makeAttachment(
  overrides: Partial<MediaAttachment> = {},
): MediaAttachment {
  return {
    attachmentId: ATTACHMENT_ID,
    storageKey: STORAGE_KEY,
    mimeType: 'image/jpeg',
    originalFilename: 'foto-cultivo.jpg',
    status: MediaAttachmentStatus.UPLOADED,
    publicUrl: undefined,
    fileSizeBytes: 102400,
    ...overrides,
  } as MediaAttachment;
}

// ─── suite ──────────────────────────────────────────────────────────────────

/**
 * Superficie que la Fase 3 debe agregar al servicio. Se accede por esta vista
 * para que el archivo COMPILE hoy y falle en aserción ("... is not a
 * function") en vez de romper el typecheck de toda la suite. `confirmUpload`
 * se re-tipa aquí porque su `publicUrl` pasa a ser `string | null`.
 */
interface MediaAttachmentsServiceSpec85 {
  getDownloadUrl(
    attachmentId: string,
    user: AuthenticatedUser,
  ): Promise<{
    attachmentId: string;
    url: string;
    expiresAt: string;
    mimeType: string;
    originalFilename: string | null;
  }>;
  confirmUpload(
    attachmentId: string,
    dto: { actualFileSizeBytes?: number },
  ): Promise<{ attachmentId: string; publicUrl: string | null }>;
  createPresignedUrl(
    dto: {
      surveyId: string;
      questionId: string;
      mimeType: string;
      fileSizeBytes: number;
      originalFilename?: string;
    },
    userId: string,
  ): Promise<{
    attachmentId: string;
    presignedUrl: string;
    storageKey: string;
    expiresAt: string;
  }>;
}

describe('MediaAttachmentsService — spec 85', () => {
  let service: MediaAttachmentsServiceSpec85;
  let attachmentRepository: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let surveyRepository: { findOne: jest.Mock };
  let questionRepository: { findOne: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let storageService: {
    generatePresignedUploadUrl: jest.Mock;
    generatePresignedDownloadUrl: jest.Mock;
    buildPublicUrl: jest.Mock;
    deleteObjects: jest.Mock;
  };
  let logSpy: jest.SpyInstance;

  /** Última entidad pasada a `attachmentRepository.save`. */
  const ultimoGuardado = (): Record<string, unknown> | undefined => {
    const calls = attachmentRepository.save.mock
      .calls as unknown as unknown[][];
    return calls.at(-1)?.[0] as Record<string, unknown> | undefined;
  };

  const env: Record<string, string> = {
    R2_DOWNLOAD_URL_EXPIRES_SECONDS: String(DOWNLOAD_EXPIRES_SECONDS),
    R2_PRESIGNED_URL_EXPIRES_SECONDS: String(UPLOAD_EXPIRES_SECONDS),
  };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(NOW);

    attachmentRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((partial: Record<string, unknown>) => partial),
      save: jest.fn((entity: Record<string, unknown>) =>
        Promise.resolve({ attachmentId: ATTACHMENT_ID, ...entity }),
      ),
    };
    surveyRepository = {
      findOne: jest.fn().mockResolvedValue({ surveyId: SURVEY_ID }),
    };
    questionRepository = {
      findOne: jest.fn().mockResolvedValue({ questionId: QUESTION_ID }),
    };
    userRepository = {
      findOne: jest.fn().mockResolvedValue({ userId: USER_ID }),
    };
    storageService = {
      generatePresignedUploadUrl: jest
        .fn()
        .mockResolvedValue('https://r2.signed/upload'),
      generatePresignedDownloadUrl: jest
        .fn()
        .mockResolvedValue('https://r2.signed/download?X-Amz-Signature=abc'),
      buildPublicUrl: jest.fn(
        (key: string) => `https://pub-test.r2.dev/${key}`,
      ),
      deleteObjects: jest.fn().mockResolvedValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAttachmentsService,
        {
          provide: getRepositoryToken(MediaAttachment),
          useValue: attachmentRepository,
        },
        { provide: getRepositoryToken(Survey), useValue: surveyRepository },
        { provide: getRepositoryToken(Question), useValue: questionRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: StorageService, useValue: storageService },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => env[key],
            getOrThrow: (key: string) => {
              const value = env[key];
              if (value === undefined) throw new Error(`${key} missing`);
              return value;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(MediaAttachmentsService);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    jest.useRealTimers();
  });

  // ── getDownloadUrl ────────────────────────────────────────────────────────

  describe('getDownloadUrl', () => {
    it('devuelve attachmentId, url, expiresAt, mimeType y originalFilename', async () => {
      attachmentRepository.findOne.mockResolvedValue(makeAttachment());

      const result = await service.getDownloadUrl(ATTACHMENT_ID, actor);

      expect(result).toEqual({
        attachmentId: ATTACHMENT_ID,
        url: 'https://r2.signed/download?X-Amz-Signature=abc',
        expiresAt: new Date(
          NOW.getTime() + DOWNLOAD_EXPIRES_SECONDS * 1000,
        ).toISOString(),
        mimeType: 'image/jpeg',
        originalFilename: 'foto-cultivo.jpg',
      });
    });

    it('firma la clave del objeto pasando mimeType y nombre original', async () => {
      attachmentRepository.findOne.mockResolvedValue(makeAttachment());

      await service.getDownloadUrl(ATTACHMENT_ID, actor);

      expect(storageService.generatePresignedDownloadUrl).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.objectContaining({
          mimeType: 'image/jpeg',
          filename: 'foto-cultivo.jpg',
        }),
      );
    });

    it('nunca devuelve la storageKey ni la publicUrl del adjunto', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ publicUrl: `https://pub-test.r2.dev/${STORAGE_KEY}` }),
      );

      const result = (await service.getDownloadUrl(
        ATTACHMENT_ID,
        actor,
      )) as unknown as Record<string, unknown>;

      expect(result).not.toHaveProperty('storageKey');
      expect(result).not.toHaveProperty('publicUrl');
    });

    it('deriva expiresAt de R2_DOWNLOAD_URL_EXPIRES_SECONDS, no de un valor fijo', async () => {
      attachmentRepository.findOne.mockResolvedValue(makeAttachment());

      const { expiresAt } = await service.getDownloadUrl(ATTACHMENT_ID, actor);
      const deltaSegundos =
        (new Date(expiresAt).getTime() - NOW.getTime()) / 1000;

      expect(deltaSegundos).toBe(DOWNLOAD_EXPIRES_SECONDS);
      expect(deltaSegundos).not.toBe(300);
    });

    it('lanza NotFoundException si el adjunto no existe', async () => {
      attachmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDownloadUrl(ATTACHMENT_ID, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        storageService.generatePresignedDownloadUrl,
      ).not.toHaveBeenCalled();
    });

    it('lanza ConflictException si el adjunto está en pending', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.PENDING }),
      );

      await expect(
        service.getDownloadUrl(ATTACHMENT_ID, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza ConflictException si el adjunto está en failed', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.FAILED }),
      );

      await expect(
        service.getDownloadUrl(ATTACHMENT_ID, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('deja una línea de log con userId y attachmentId en cada emisión (criterio 3)', async () => {
      attachmentRepository.findOne.mockResolvedValue(makeAttachment());

      await service.getDownloadUrl(ATTACHMENT_ID, actor);

      const lineas = logSpy.mock.calls.map(([mensaje]) => String(mensaje));
      expect(
        lineas.some(
          (linea) => linea.includes(USER_ID) && linea.includes(ATTACHMENT_ID),
        ),
      ).toBe(true);
    });

    it('emite una traza por cada llamada, no solo en la primera', async () => {
      attachmentRepository.findOne.mockResolvedValue(makeAttachment());

      await service.getDownloadUrl(ATTACHMENT_ID, actor);
      await service.getDownloadUrl(ATTACHMENT_ID, actor);

      const trazas = logSpy.mock.calls
        .map(([mensaje]) => String(mensaje))
        .filter(
          (linea) => linea.includes(USER_ID) && linea.includes(ATTACHMENT_ID),
        );
      expect(trazas).toHaveLength(2);
    });

    it('no registra traza cuando el adjunto no existe', async () => {
      attachmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getDownloadUrl(ATTACHMENT_ID, actor),
      ).rejects.toBeInstanceOf(NotFoundException);

      const trazas = logSpy.mock.calls
        .map(([mensaje]) => String(mensaje))
        .filter((linea) => linea.includes(ATTACHMENT_ID));
      expect(trazas).toHaveLength(0);
    });
  });

  // ── confirmUpload ─────────────────────────────────────────────────────────

  describe('confirmUpload', () => {
    it('devuelve la clave publicUrl con valor null (contrato del APK, criterio 7)', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.PENDING }),
      );

      const result = await service.confirmUpload(ATTACHMENT_ID, {});

      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(['attachmentId', 'publicUrl']),
      );
      expect(result.publicUrl).toBeNull();
      expect(result.attachmentId).toBe(ATTACHMENT_ID);
    });

    it('no persiste publicUrl ni invoca buildPublicUrl', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.PENDING }),
      );

      await service.confirmUpload(ATTACHMENT_ID, {});

      expect(storageService.buildPublicUrl).not.toHaveBeenCalled();
      expect(ultimoGuardado()?.publicUrl ?? null).toBeNull();
    });

    it('sigue marcando el adjunto como uploaded', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.PENDING }),
      );

      await service.confirmUpload(ATTACHMENT_ID, {});

      expect(ultimoGuardado()?.status).toBe(MediaAttachmentStatus.UPLOADED);
    });

    it('sigue actualizando el tamaño real cuando el cliente lo envía', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.PENDING }),
      );

      await service.confirmUpload(ATTACHMENT_ID, { actualFileSizeBytes: 5555 });

      expect(ultimoGuardado()?.fileSizeBytes).toBe(5555);
    });

    it('es idempotente: un adjunto ya uploaded responde 200 con publicUrl null y no vuelve a guardar', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.UPLOADED }),
      );

      const result = await service.confirmUpload(ATTACHMENT_ID, {});

      expect(result).toEqual({ attachmentId: ATTACHMENT_ID, publicUrl: null });
      expect(attachmentRepository.save).not.toHaveBeenCalled();
    });

    it('sigue rechazando un adjunto marcado como failed', async () => {
      attachmentRepository.findOne.mockResolvedValue(
        makeAttachment({ status: MediaAttachmentStatus.FAILED }),
      );

      await expect(service.confirmUpload(ATTACHMENT_ID, {})).rejects.toThrow(
        /failed/i,
      );
      expect(attachmentRepository.save).not.toHaveBeenCalled();
    });

    it('sigue lanzando NotFoundException si el adjunto no existe', async () => {
      attachmentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.confirmUpload(ATTACHMENT_ID, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── createPresignedUrl ────────────────────────────────────────────────────

  describe('createPresignedUrl', () => {
    it('deriva expiresAt de R2_PRESIGNED_URL_EXPIRES_SECONDS y no del 300 hardcodeado', async () => {
      const { expiresAt } = await service.createPresignedUrl(
        {
          surveyId: SURVEY_ID,
          questionId: QUESTION_ID,
          mimeType: 'image/jpeg',
          fileSizeBytes: 102400,
          originalFilename: 'foto-cultivo.jpg',
        },
        USER_ID,
      );

      const deltaSegundos =
        (new Date(expiresAt).getTime() - NOW.getTime()) / 1000;
      expect(deltaSegundos).toBe(UPLOAD_EXPIRES_SECONDS);
    });
  });
});
