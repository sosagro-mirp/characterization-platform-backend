import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { UsersService } from 'src/users/users.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKey } from './entities/api-key.entity';

const KEY_PREFIX_BYTES = 6;
// base64url encoding of N bytes produces ceil(N*8/6) chars. 6 bytes → 48
// bits → exactly 8 base64url chars, no padding — always this exact length.
const KEY_PREFIX_LENGTH = Math.ceil((KEY_PREFIX_BYTES * 8) / 6);
const KEY_SECRET_BYTES = 32;
export const API_KEY_FORMAT_PREFIX = 'sosagro_sk_';

interface GeneratedKey {
  prefix: string;
  secret: string;
  fullKey: string;
}

@Injectable()
export class ApiKeysService {
  private readonly pepper: string;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeysRepository: Repository<ApiKey>,
    private readonly usersService: UsersService,
    configService: ConfigService,
  ) {
    // Validado en el constructor (no perezosamente en cada request) para que
    // una configuración incompleta falle al arrancar la app, no como un 500
    // en el primer request autenticado con X-API-Key. Mismo patrón que
    // JwtStrategy con JWT_SECRET.
    const pepper = configService.get<string>('API_KEY_PEPPER');
    if (!pepper) {
      throw new Error('API_KEY_PEPPER is not configured');
    }
    this.pepper = pepper;
  }

  private hashSecret(secret: string): string {
    return crypto
      .createHash('sha256')
      .update(secret + this.pepper)
      .digest('hex');
  }

  private generateKey(): GeneratedKey {
    const prefix = crypto.randomBytes(KEY_PREFIX_BYTES).toString('base64url');
    const secret = crypto.randomBytes(KEY_SECRET_BYTES).toString('base64url');
    return {
      prefix,
      secret,
      fullKey: `${API_KEY_FORMAT_PREFIX}${prefix}_${secret}`,
    };
  }

  /**
   * Parses a raw "X-API-Key" header value. Returns null if the format is
   * invalid — callers must treat that the same as "key not found" (401,
   * no distinction) to avoid leaking which failure mode occurred.
   *
   * The prefix has a FIXED length (base64url of a fixed byte count never
   * varies in length), so it's sliced by position rather than by searching
   * for the "_" separator — the base64url alphabet itself includes "_",
   * so a prefix can legitimately contain one and a naive
   * indexOf('_')-based split would truncate it.
   */
  parseKey(rawKey: string): { prefix: string; secret: string } | null {
    if (!rawKey.startsWith(API_KEY_FORMAT_PREFIX)) return null;
    const rest = rawKey.slice(API_KEY_FORMAT_PREFIX.length);
    if (rest.length <= KEY_PREFIX_LENGTH + 1) return null;
    const prefix = rest.slice(0, KEY_PREFIX_LENGTH);
    if (rest[KEY_PREFIX_LENGTH] !== '_') return null;
    const secret = rest.slice(KEY_PREFIX_LENGTH + 1);
    if (!prefix || !secret) return null;
    return { prefix, secret };
  }

  /**
   * Resolves a raw key to its owning ApiKey + AuthenticatedUser shape, or
   * null if invalid/revoked/expired/malformed. Used exclusively by
   * ApiKeyAuthGuard — never throws, the guard decides the HTTP response.
   */
  async validateKey(rawKey: string): Promise<ApiKey | null> {
    const parsed = this.parseKey(rawKey);
    if (!parsed) return null;

    const apiKey = await this.apiKeysRepository
      .createQueryBuilder('apiKey')
      .addSelect('apiKey.keyHash')
      .leftJoinAndSelect('apiKey.user', 'user')
      .leftJoinAndSelect('user.role', 'role')
      .where('apiKey.keyPrefix = :prefix', { prefix: parsed.prefix })
      .getOne();

    if (!apiKey) return null;

    const candidateHash = Buffer.from(this.hashSecret(parsed.secret));
    const storedHash = Buffer.from(apiKey.keyHash);
    if (
      candidateHash.length !== storedHash.length ||
      !crypto.timingSafeEqual(candidateHash, storedHash)
    ) {
      return null;
    }

    if (apiKey.revokedAt) return null;
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      return null;
    }
    if (!apiKey.user) return null;

    return apiKey;
  }

  /**
   * Fire-and-forget update of lastUsedAt. Never awaited by the guard so it
   * doesn't add latency to the request it's authenticating.
   */
  touchLastUsed(apiKeyId: string): void {
    this.apiKeysRepository
      .update({ apiKeyId }, { lastUsedAt: new Date() })
      .catch(() => undefined);
  }

  async create(
    dto: CreateApiKeyDto,
    createdByUserId?: string,
  ): Promise<{ entity: ApiKey; rawKey: string }> {
    // Verificación explícita en vez de dejar que el INSERT falle por FK:
    // así un error real de base de datos no se enmascara como "usuario no
    // encontrado" (NotFoundException aquí es fiel a la causa real).
    await this.usersService.findOne(dto.userId);

    const generated = this.generateKey();

    const apiKey = this.apiKeysRepository.create({
      name: dto.name,
      scopes: dto.scopes,
      keyPrefix: generated.prefix,
      keyHash: this.hashSecret(generated.secret),
      user: { userId: dto.userId } as unknown as ApiKey['user'],
      createdBy: createdByUserId
        ? ({ userId: createdByUserId } as unknown as ApiKey['createdBy'])
        : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    const saved = await this.apiKeysRepository.save(apiKey);
    return {
      entity: await this.findOne(saved.apiKeyId),
      rawKey: generated.fullKey,
    };
  }

  findAll(): Promise<ApiKey[]> {
    return this.apiKeysRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(apiKeyId: string): Promise<ApiKey> {
    const apiKey = await this.apiKeysRepository.findOne({
      where: { apiKeyId },
      relations: ['user'],
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    return apiKey;
  }

  async revoke(apiKeyId: string): Promise<ApiKey> {
    const apiKey = await this.findOne(apiKeyId);
    if (!apiKey.revokedAt) {
      apiKey.revokedAt = new Date();
      await this.apiKeysRepository.save(apiKey);
    }
    return apiKey;
  }
}
