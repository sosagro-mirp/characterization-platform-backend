/**
 * Spec 85 — Endurecimiento de privacidad de multimedia (Fases 3 y 7).
 *
 * ESTAS PRUEBAS NACEN EN ROJO: `StorageService.generatePresignedDownloadUrl`
 * y `StorageService.deleteObjects` todavía no existen. Hoy el servicio solo
 * sabe firmar subidas (`generatePresignedUploadUrl`), construir URLs públicas
 * (`buildPublicUrl`, que se retira en la Fase 6) y borrar de a un objeto
 * (`deleteObject`, que no se invoca desde ninguna parte del código).
 *
 * Cubre:
 *   - Criterio 1 — la URL firmada de lectura y su vencimiento efectivo.
 *   - Criterios 8-10 — borrado real de objetos en R2, por lotes y tolerante
 *     a fallos parciales (las claves que fallan alimentan
 *     `media_deletion_queue`).
 *
 * Contrato que asume esta suite (la implementación debe respetarlo):
 *   generatePresignedDownloadUrl(
 *     key: string,
 *     options?: { mimeType?: string; filename?: string; expiresIn?: number },
 *   ): Promise<string>
 *   deleteObjects(keys: string[]): Promise<string[]>  // devuelve las claves que FALLARON
 */

import { StorageService } from './storage.service';

// ─── dobles del SDK de AWS ──────────────────────────────────────────────────
// No existe convención previa en el repositorio para mockear el SDK de S3
// (`storage.service.ts` no tenía spec). Se mockean los dos módulos completos y
// cada `*Command` se reemplaza por una fábrica que conserva su `input`, que es
// lo único que las aserciones necesitan inspeccionar.

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn();
  const makeCommand = (name: string) =>
    jest.fn().mockImplementation((input: Record<string, unknown>) => ({
      __command: name,
      input,
    }));

  return {
    __esModule: true,
    __send: send,
    S3Client: jest.fn().mockImplementation(() => ({ send })),
    PutObjectCommand: makeCommand('PutObjectCommand'),
    GetObjectCommand: makeCommand('GetObjectCommand'),
    DeleteObjectCommand: makeCommand('DeleteObjectCommand'),
    DeleteObjectsCommand: makeCommand('DeleteObjectsCommand'),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  __esModule: true,
  getSignedUrl: jest.fn(),
}));

interface S3CommandInstance {
  __command: string;
  input: Record<string, unknown>;
}

interface S3ClientMock {
  __send: jest.Mock;
  GetObjectCommand: jest.Mock;
  DeleteObjectsCommand: jest.Mock;
}

const s3 = jest.requireMock('@aws-sdk/client-s3') as unknown as S3ClientMock;

const presigner = jest.requireMock(
  '@aws-sdk/s3-request-presigner',
) as unknown as { getSignedUrl: jest.Mock };

// ─── entorno ────────────────────────────────────────────────────────────────

const BUCKET = 'sosagro-media-test';
const DEFAULT_DOWNLOAD_EXPIRES = 900;

function makeConfigService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    R2_ACCOUNT_ID: 'account-test',
    R2_ACCESS_KEY_ID: 'key-test',
    R2_SECRET_ACCESS_KEY: 'secret-test',
    R2_BUCKET_NAME: BUCKET,
    R2_PUBLIC_BASE_URL: 'https://pub-test.r2.dev',
    R2_PRESIGNED_URL_EXPIRES_SECONDS: '300',
    R2_DOWNLOAD_URL_EXPIRES_SECONDS: String(DEFAULT_DOWNLOAD_EXPIRES),
    ...overrides,
  };

  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`${key} is not configured`);
      return value;
    },
  } as never;
}

const KEY =
  'surveys/11111111-1111-4111-8111-111111111111/questions/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg';

function lastCommand(mock: jest.Mock): S3CommandInstance {
  const result = mock.mock.results.at(-1);
  return result?.value as S3CommandInstance;
}

// ─── suite ──────────────────────────────────────────────────────────────────

/**
 * Superficie que la Fase 3/7 debe agregar a `StorageService`. Se accede a
 * través de esta vista para que el archivo COMPILE hoy y falle en aserción
 * ("... is not a function") en vez de romper el typecheck de toda la suite.
 * Al implementarse los métodos, el cast queda redundante pero inocuo.
 */
interface StorageServiceSpec85 {
  generatePresignedDownloadUrl(
    key: string,
    options?: { mimeType?: string; filename?: string; expiresIn?: number },
  ): Promise<string>;
  deleteObjects(keys: string[]): Promise<string[]>;
}

const spec85 = (s: StorageService): StorageServiceSpec85 =>
  s as unknown as StorageServiceSpec85;

describe('StorageService — spec 85', () => {
  let service: StorageServiceSpec85;

  beforeEach(() => {
    jest.clearAllMocks();
    presigner.getSignedUrl.mockResolvedValue('https://r2.signed/download');
    s3.__send.mockResolvedValue({ Deleted: [], Errors: [] });
    service = spec85(new StorageService(makeConfigService()));
  });

  describe('generatePresignedDownloadUrl', () => {
    it('devuelve la URL firmada que produce getSignedUrl', async () => {
      const url = await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
      });

      expect(url).toBe('https://r2.signed/download');
      expect(presigner.getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('firma un GetObjectCommand sobre el bucket y la clave dados', async () => {
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
      });

      expect(s3.GetObjectCommand).toHaveBeenCalledTimes(1);
      const command = lastCommand(s3.GetObjectCommand);
      expect(command.input).toMatchObject({ Bucket: BUCKET, Key: KEY });
    });

    it('fija ResponseContentType con el mimeType recibido', async () => {
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'audio/mpeg',
        filename: 'audio-de-campo.mp3',
      });

      const command = lastCommand(s3.GetObjectCommand);
      expect(command.input.ResponseContentType).toBe('audio/mpeg');
    });

    it('fija ResponseContentDisposition con el nombre de archivo original', async () => {
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'application/pdf',
        filename: 'cedula del productor.pdf',
      });

      const command = lastCommand(s3.GetObjectCommand);
      const disposition = String(command.input.ResponseContentDisposition);
      expect(disposition).toContain('cedula del productor.pdf');
    });

    it('respeta el expiresIn explícito', async () => {
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
        expiresIn: 60,
      });

      expect(presigner.getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 60 },
      );
    });

    it('usa R2_DOWNLOAD_URL_EXPIRES_SECONDS cuando se omite expiresIn', async () => {
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
      });

      expect(presigner.getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: DEFAULT_DOWNLOAD_EXPIRES },
      );
    });

    it('cae al default de 300 s si la variable de descarga no está configurada', async () => {
      const bare = spec85(
        new StorageService(
          makeConfigService({
            R2_DOWNLOAD_URL_EXPIRES_SECONDS: undefined as never,
          }),
        ),
      );

      await bare.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
      });

      expect(presigner.getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });

    it('no reutiliza el vencimiento de subida para las descargas', async () => {
      // `R2_PRESIGNED_URL_EXPIRES_SECONDS` (300) rige la subida;
      // `R2_DOWNLOAD_URL_EXPIRES_SECONDS` (900) rige la lectura.
      await service.generatePresignedDownloadUrl(KEY, {
        mimeType: 'image/jpeg',
        filename: 'evidencia.jpg',
      });

      const [, , options] = presigner.getSignedUrl.mock.calls.at(-1) as [
        unknown,
        unknown,
        { expiresIn: number },
      ];
      expect(options.expiresIn).not.toBe(300);
    });
  });

  describe('deleteObjects', () => {
    it('no llama a R2 con una lista vacía y devuelve cero fallos', async () => {
      const failed = await service.deleteObjects([]);

      expect(s3.__send).not.toHaveBeenCalled();
      expect(failed).toEqual([]);
    });

    it('borra con DeleteObjectsCommand en una sola llamada cuando son pocas claves', async () => {
      s3.__send.mockResolvedValue({
        Deleted: [{ Key: 'a' }, { Key: 'b' }],
        Errors: [],
      });

      const failed = await service.deleteObjects(['a', 'b']);

      expect(s3.DeleteObjectsCommand).toHaveBeenCalledTimes(1);
      expect(s3.__send).toHaveBeenCalledTimes(1);
      const command = lastCommand(s3.DeleteObjectsCommand);
      expect(command.input).toMatchObject({ Bucket: BUCKET });
      expect(command.input.Delete).toMatchObject({
        Objects: [{ Key: 'a' }, { Key: 'b' }],
      });
      expect(failed).toEqual([]);
    });

    it('parte en lotes de 1000 cuando hay más claves', async () => {
      const keys = Array.from({ length: 2300 }, (_, i) => `key-${i}`);
      s3.__send.mockResolvedValue({ Deleted: [], Errors: [] });

      await service.deleteObjects(keys);

      expect(s3.__send).toHaveBeenCalledTimes(3);
      const lotes = s3.DeleteObjectsCommand.mock.results.map(
        (r) =>
          (
            (r.value as S3CommandInstance).input.Delete as {
              Objects: unknown[];
            }
          ).Objects.length,
      );
      expect(lotes).toEqual([1000, 1000, 300]);
    });

    it('devuelve las claves que fallaron ante un fallo parcial', async () => {
      s3.__send.mockResolvedValue({
        Deleted: [{ Key: 'ok-1' }],
        Errors: [{ Key: 'falla-1', Code: 'InternalError' }],
      });

      const failed = await service.deleteObjects(['ok-1', 'falla-1']);

      expect(failed).toEqual(['falla-1']);
    });

    it('ante un error de red devuelve todas las claves del lote, sin lanzar', async () => {
      // Criterio 9: ningún fallo de R2 puede revertir ni bloquear el borrado en
      // base de datos — las claves vuelven al llamador para ir a la cola.
      s3.__send.mockRejectedValue(new Error('ECONNRESET'));

      await expect(service.deleteObjects(['a', 'b'])).resolves.toEqual([
        'a',
        'b',
      ]);
    });

    it('un lote fallido no impide que se intenten los demás', async () => {
      const keys = Array.from({ length: 1500 }, (_, i) => `key-${i}`);
      s3.__send
        .mockRejectedValueOnce(new Error('503 Slow Down'))
        .mockResolvedValueOnce({ Deleted: [], Errors: [] });

      const failed = await service.deleteObjects(keys);

      expect(s3.__send).toHaveBeenCalledTimes(2);
      expect(failed).toHaveLength(1000);
    });
  });
});
