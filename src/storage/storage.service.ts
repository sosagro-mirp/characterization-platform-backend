import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Máximo de claves que admite `DeleteObjects` por llamada (límite de S3/R2). */
const DELETE_BATCH_SIZE = 1000;

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly defaultExpiresIn: number;
  private readonly downloadExpiresIn: number;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>('R2_ACCOUNT_ID');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.bucket = this.configService.getOrThrow<string>('R2_BUCKET_NAME');
    this.publicBaseUrl =
      this.configService.getOrThrow<string>('R2_PUBLIC_BASE_URL');
    this.defaultExpiresIn = parseInt(
      this.configService.get<string>('R2_PRESIGNED_URL_EXPIRES_SECONDS') ??
        '300',
      10,
    );
    this.downloadExpiresIn = parseInt(
      this.configService.get<string>('R2_DOWNLOAD_URL_EXPIRES_SECONDS') ??
        '300',
      10,
    );
  }

  async generatePresignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = this.defaultExpiresIn,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * URL de lectura firmada y de vida corta (spec 85). La vigencia la rige
   * `R2_DOWNLOAD_URL_EXPIRES_SECONDS`, distinta de la de subida. Devuelve solo
   * la URL: el `expiresAt` lo calcula quien la pide.
   */
  async generatePresignedDownloadUrl(
    key: string,
    options: { mimeType?: string; filename?: string; expiresIn?: number } = {},
  ): Promise<string> {
    const { mimeType, filename, expiresIn = this.downloadExpiresIn } = options;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: mimeType,
      ResponseContentDisposition: filename
        ? this.buildContentDisposition(filename)
        : undefined,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Borra objetos de R2 por lotes de 1000. Nunca lanza: devuelve las claves
   * que NO se pudieron borrar (por error parcial o de red) para que el
   * llamador las encole. Ningún fallo de R2 debe revertir ni bloquear el
   * borrado en base de datos (spec 85, D4).
   */
  async deleteObjects(keys: string[]): Promise<string[]> {
    const failed: string[] = [];

    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      try {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: batch.map((Key) => ({ Key })),
              Quiet: false,
            },
          }),
        );
        for (const error of result?.Errors ?? []) {
          if (error.Key) failed.push(error.Key);
        }
      } catch {
        failed.push(...batch);
      }
    }

    return failed;
  }

  private buildContentDisposition(filename: string): string {
    // Fallback ASCII para clientes viejos + `filename*` (RFC 5987) con el
    // nombre original en UTF-8.
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
}
