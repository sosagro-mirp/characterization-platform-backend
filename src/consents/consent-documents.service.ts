import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsentDocument } from './entities/consent-document.entity';
import { CreateConsentDocumentDto } from './dto/create-consent-document.dto';
import { UpdateConsentDocumentDto } from './dto/update-consent-document.dto';
import { User } from '../users/entities/user.entity';

/** FK-only reference: evita una consulta extra a `users` solo para poner el id en la relación. */
function userRef(userId: string): User {
  return { userId } as User;
}

@Injectable()
export class ConsentDocumentsService {
  constructor(
    @InjectRepository(ConsentDocument)
    private readonly consentDocumentsRepository: Repository<ConsentDocument>,
  ) {}

  async create(
    dto: CreateConsentDocumentDto,
    userId?: string,
  ): Promise<ConsentDocument> {
    const document = this.consentDocumentsRepository.create({
      ...dto,
      status: 'draft',
      createdBy: userId ? userRef(userId) : undefined,
      updatedBy: userId ? userRef(userId) : undefined,
    });
    return this.consentDocumentsRepository.save(document);
  }

  findAll(): Promise<ConsentDocument[]> {
    return this.consentDocumentsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(consentDocumentId: string): Promise<ConsentDocument> {
    const document = await this.consentDocumentsRepository.findOne({
      where: { consentDocumentId },
    });
    if (!document) {
      throw new NotFoundException('Consent document not found');
    }
    return document;
  }

  /**
   * Único punto de lectura de "la versión vigente" del consentimiento. Lo
   * consumen: la pantalla web/móvil de consentimiento, la página pública
   * /privacidad y ConsentRecordsService al resolver vigencia.
   */
  async findActive(): Promise<ConsentDocument | null> {
    return this.consentDocumentsRepository.findOne({
      where: { status: 'published' },
      order: { publishedAt: 'DESC' },
    });
  }

  // Criterio 11 — editar una versión no-draft se rechaza con 409.
  async update(
    consentDocumentId: string,
    dto: UpdateConsentDocumentDto,
    userId?: string,
  ): Promise<ConsentDocument> {
    const document = await this.findOne(consentDocumentId);
    if (document.status !== 'draft') {
      throw new ConflictException(
        `No se puede editar un documento de consentimiento en estado "${document.status}". Solo los documentos en borrador son editables.`,
      );
    }
    Object.assign(document, dto);
    if (userId) {
      document.updatedBy = userRef(userId);
    }
    return this.consentDocumentsRepository.save(document);
  }

  // Criterio 10 — publicar archiva la versión publicada anterior en la misma
  // transacción; nunca quedan dos documentos publicados a la vez.
  async publish(
    consentDocumentId: string,
    userId?: string,
  ): Promise<ConsentDocument> {
    const document = await this.findOne(consentDocumentId);
    if (document.status === 'archived') {
      throw new ConflictException(
        'No se puede publicar un documento de consentimiento archivado.',
      );
    }
    if (document.status === 'published') {
      return document;
    }

    const publishedAt = new Date();

    await this.consentDocumentsRepository.manager.transaction(
      async (manager) => {
        const currentlyPublished = await manager.findOne(ConsentDocument, {
          where: { status: 'published' },
        });
        if (currentlyPublished) {
          await manager.update(
            ConsentDocument,
            { consentDocumentId: currentlyPublished.consentDocumentId },
            { status: 'archived' },
          );
        }

        await manager.update(
          ConsentDocument,
          { consentDocumentId },
          {
            status: 'published',
            publishedAt,
            updatedBy: userId ? userRef(userId) : undefined,
          },
        );
      },
    );

    // No se re-consulta con this.findOne(): dentro de la transacción arriba se
    // pudo haber archivado la fila que este objeto en memoria todavía refleja
    // como "draft" — se construye el resultado a partir de lo que se acaba de
    // persistir, sin un round-trip extra a la base de datos.
    return { ...document, status: 'published', publishedAt };
  }
}
