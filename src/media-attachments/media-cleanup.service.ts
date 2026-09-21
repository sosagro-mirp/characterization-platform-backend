import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { StorageService } from 'src/storage/storage.service';
import { MediaDeletionQueue } from './entities/media-deletion-queue.entity';

export interface MediaDeletionResult {
  deleted: number;
  queued: number;
}

export interface PurgePendingResult {
  deleted: number;
  failed: number;
  remaining: number;
}

/**
 * Borrado efectivo de los objetos de R2 asociados a filas de
 * `media_attachments` (spec 85, Fase 7).
 *
 * Protocolo (D4): el llamador recolecta las claves DENTRO de su transacción,
 * hace commit, y solo entonces llama a `deleteObjects`. Borrar dentro de la
 * transacción destruiría evidencia de campo de forma irrecuperable ante un
 * rollback; borrar después solo puede dejar un huérfano, que sí es
 * recuperable. Lo que falle en R2 va a `media_deletion_queue` y nunca revierte
 * ni bloquea el borrado en base de datos.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectRepository(MediaDeletionQueue)
    private readonly queueRepository: Repository<MediaDeletionQueue>,
  ) {}

  // ── recolección de claves (antes de borrar filas) ─────────────────────────

  collectBySurveys(
    manager: EntityManager,
    surveyIds: string[],
  ): Promise<string[]> {
    if (!surveyIds.length) return Promise.resolve([]);
    return this.pluckKeys(
      manager,
      `SELECT storage_key FROM media_attachments WHERE survey_id = ANY($1::uuid[])`,
      [surveyIds],
    );
  }

  collectByQuestion(
    manager: EntityManager,
    questionId: string,
  ): Promise<string[]> {
    return this.pluckKeys(
      manager,
      `SELECT storage_key FROM media_attachments WHERE question_id = $1`,
      [questionId],
    );
  }

  collectBySection(
    manager: EntityManager,
    sectionId: string,
  ): Promise<string[]> {
    return this.pluckKeys(
      manager,
      `SELECT storage_key FROM media_attachments
        WHERE question_id IN (
          SELECT question_id FROM questions WHERE section_id = $1
        )`,
      [sectionId],
    );
  }

  collectByInstrument(
    manager: EntityManager,
    instrumentId: string,
  ): Promise<string[]> {
    return this.pluckKeys(
      manager,
      `SELECT storage_key FROM media_attachments
        WHERE question_id IN (
          SELECT q.question_id FROM questions q
            JOIN sections s ON s.section_id = q.section_id
           WHERE s.instrument_id = $1
        )`,
      [instrumentId],
    );
  }

  // ── borrado tras el commit ────────────────────────────────────────────────

  /**
   * Borra los objetos en R2 y encola los que fallen. Nunca lanza: el borrado
   * en base de datos ya ocurrió y no debe verse afectado por R2.
   */
  async deleteAfterCommit(keys: string[]): Promise<MediaDeletionResult> {
    const unique = [...new Set(keys)];
    if (!unique.length) return { deleted: 0, queued: 0 };

    let failed: string[];
    try {
      failed = await this.storageService.deleteObjects(unique);
    } catch (error) {
      failed = unique;
      this.logger.error(
        `R2 deleteObjects threw for ${unique.length} keys: ${this.describe(error)}`,
      );
    }

    if (failed.length) {
      await this.enqueue(failed, 'R2 delete failed');
    }

    return { deleted: unique.length - failed.length, queued: failed.length };
  }

  /** Reprocesa la cola: `POST /media-attachments/purge-pending`. */
  async purgePending(): Promise<PurgePendingResult> {
    const pending = await this.queueRepository.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (!pending.length) return { deleted: 0, failed: 0, remaining: 0 };

    const keys = [...new Set(pending.map((row) => row.storageKey))];
    const failedKeys = new Set(await this.storageService.deleteObjects(keys));
    const now = new Date();

    let deleted = 0;
    for (const row of pending) {
      row.attempts += 1;
      if (failedKeys.has(row.storageKey)) {
        row.lastError = 'R2 delete failed';
      } else {
        row.deletedAt = now;
        row.lastError = null;
        deleted += 1;
      }
    }
    await this.queueRepository.save(pending);

    const remaining = await this.queueRepository.count({
      where: { deletedAt: IsNull() },
    });

    return { deleted, failed: pending.length - deleted, remaining };
  }

  // ── internos ──────────────────────────────────────────────────────────────

  private async pluckKeys(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<string[]> {
    const rows = await manager.query<{ storage_key: string }[]>(sql, params);
    return rows.map((row) => row.storage_key);
  }

  private async enqueue(keys: string[], reason: string): Promise<void> {
    try {
      await this.queueRepository.insert(
        keys.map((storageKey) => ({
          storageKey,
          attempts: 1,
          lastError: reason,
        })),
      );
    } catch (error) {
      // Último recurso: si ni la cola responde, la clave queda en el log para
      // limpiarla a mano. No se relanza: la base de datos ya cambió.
      this.logger.error(
        `Could not enqueue ${keys.length} orphan R2 keys (${this.describe(error)}): ${keys.join(', ')}`,
      );
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
