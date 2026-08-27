import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { ConsentRecord } from './entities/consent-record.entity';
import { ConsentDocumentsService } from './consent-documents.service';
import { CreateConsentRecordDto } from './dto/create-consent-record.dto';
import { CampaignSession } from '../campaign-sessions/entities/campaign-session.entity';
import { Farmer } from '../farmers/entities/farmer.entity';
import { User } from '../users/entities/user.entity';

/** FK-only reference: evita una consulta extra solo para poner el id en la relación. */
function userRef(userId: string): User {
  return { userId } as User;
}

export type ConsentVigencyStatus =
  | 'valid'
  | 'outdated_version'
  | 'revoked'
  | 'none';

export interface ConsentVigency {
  status: ConsentVigencyStatus;
  acceptedVersion: string | null;
  activeVersion: string | null;
  record: ConsentRecord | null;
}

@Injectable()
export class ConsentRecordsService {
  constructor(
    @InjectRepository(ConsentRecord)
    private readonly consentRecordsRepository: Repository<ConsentRecord>,
    private readonly consentDocumentsService: ConsentDocumentsService,
  ) {}

  // Criterio 12 — sin la autorización obligatoria de tratamiento de datos no
  // se persiste nada. Criterio 9 — idempotente por (sessionId,
  // consentDocumentId): un reintento de la cola de sincronización no duplica.
  async create(
    dto: CreateConsentRecordDto,
    userId?: string,
  ): Promise<{ created: boolean; record: ConsentRecord }> {
    if (!dto.acceptedDataProcessing) {
      throw new UnprocessableEntityException(
        'acceptedDataProcessing es obligatorio para registrar un consentimiento',
      );
    }

    const document = dto.consentDocumentId
      ? await this.consentDocumentsService.findOne(dto.consentDocumentId)
      : await this.consentDocumentsService.findActive();

    if (!document) {
      throw new NotFoundException(
        'No hay un documento de consentimiento publicado',
      );
    }

    const existing = await this.consentRecordsRepository.findOne({
      where: {
        session: { sessionId: dto.sessionId },
        consentDocument: { consentDocumentId: document.consentDocumentId },
      },
    });

    if (existing) {
      return { created: false, record: existing };
    }

    const record = this.consentRecordsRepository.create({
      session: { sessionId: dto.sessionId } as CampaignSession,
      consentDocument: document,
      acceptedDataProcessing: dto.acceptedDataProcessing,
      acceptedPhoto: dto.acceptedPhoto ?? false,
      acceptedAudio: dto.acceptedAudio ?? false,
      acceptedVideo: dto.acceptedVideo ?? false,
      acceptedFollowUpContact: dto.acceptedFollowUpContact ?? false,
      respondentName: dto.respondentName ?? null,
      respondentDocumentId: dto.respondentDocumentId ?? null,
      onBehalfOfProducer: dto.onBehalfOfProducer ?? false,
      recordedBy: userId ? userRef(userId) : null,
      // Se conserva la fecha de aceptación tal como llega — en el flujo
      // offline de la app móvil es el momento real en que el encuestado
      // aceptó, no el momento en que la cola logró sincronizar.
      acceptedAt: new Date(dto.acceptedAt),
      syncedAt: new Date(),
    });

    const saved = await this.consentRecordsRepository.save(record);
    return { created: true, record: saved };
  }

  findAll(filters?: {
    farmerId?: string;
    sessionId?: string;
    consentDocumentId?: string;
  }): Promise<ConsentRecord[]> {
    const where: Record<string, unknown> = {};
    if (filters?.farmerId) where.farmer = { id: filters.farmerId };
    if (filters?.sessionId) where.session = { sessionId: filters.sessionId };
    if (filters?.consentDocumentId) {
      where.consentDocument = { consentDocumentId: filters.consentDocumentId };
    }
    return this.consentRecordsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  findBySession(sessionId: string): Promise<ConsentRecord | null> {
    return this.consentRecordsRepository.findOne({
      where: { session: { sessionId } },
    });
  }

  // Vigencia: constancia sin revocar, con acceptedDataProcessing = true y
  // anclada a la versión actualmente publicada. Ver "Vigencia" en
  // spec/78_consentimiento_informado_tratamiento_datos.md.
  async getFarmerStatus(farmerId: string): Promise<ConsentVigency> {
    const activeDocument = await this.consentDocumentsService.findActive();

    const record = await this.consentRecordsRepository.findOne({
      where: { farmer: { id: farmerId } },
      order: { createdAt: 'DESC' },
    });

    if (!record) {
      return {
        status: 'none',
        acceptedVersion: null,
        activeVersion: activeDocument?.version ?? null,
        record: null,
      };
    }

    if (record.revokedAt) {
      return {
        status: 'revoked',
        acceptedVersion: record.consentDocument?.version ?? null,
        activeVersion: activeDocument?.version ?? null,
        record,
      };
    }

    if (
      !activeDocument ||
      record.consentDocument?.consentDocumentId !==
        activeDocument.consentDocumentId
    ) {
      return {
        status: 'outdated_version',
        acceptedVersion: record.consentDocument?.version ?? null,
        activeVersion: activeDocument?.version ?? null,
        record,
      };
    }

    if (!record.acceptedDataProcessing) {
      return {
        status: 'none',
        acceptedVersion: record.consentDocument?.version ?? null,
        activeVersion: activeDocument.version,
        record,
      };
    }

    return {
      status: 'valid',
      acceptedVersion: record.consentDocument.version,
      activeVersion: activeDocument.version,
      record,
    };
  }

  // Criterio 13 — motivo obligatorio; marca fecha, motivo y autor.
  async revoke(
    consentRecordId: string,
    reason: string,
    userId?: string,
  ): Promise<void> {
    if (!reason || !reason.trim()) {
      throw new UnprocessableEntityException(
        'El motivo de revocación es obligatorio',
      );
    }

    const record = await this.consentRecordsRepository.findOne({
      where: { consentRecordId },
    });
    if (!record) {
      throw new NotFoundException('Consent record not found');
    }

    await this.consentRecordsRepository.update(
      { consentRecordId },
      {
        revokedAt: new Date(),
        revokedReason: reason,
        revokedBy: userId ? userRef(userId) : null,
      },
    );
  }

  // Criterio 6 — invocado desde SurveysService.extractFarmer justo después de
  // resolver el Farmer, para vincular la(s) constancia(s) huérfana(s)
  // (farmer IS NULL) que quedaron ancladas solo por session_id.
  async linkOrphansToFarmer(
    sessionId: string,
    farmerId: string,
  ): Promise<void> {
    await this.consentRecordsRepository.update(
      {
        session: { sessionId },
        farmer: IsNull(),
      } as FindOptionsWhere<ConsentRecord>,
      { farmer: { id: farmerId } as Farmer },
    );
  }
}
