import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConsentDocument } from 'src/consents/entities/consent-document.entity';
import { ConsentRecord } from 'src/consents/entities/consent-record.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { InstrumentsService } from 'src/instruments/instruments.service';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { SubmitPublicSurveyDto } from './dto/submit-public-survey.dto';

/**
 * Spec 79 — canal público. Un instrumento marcado `isPublic` (y activo) se
 * sirve sin autenticación en `/encuesta/{instrumentId}` y acepta un único
 * envío atómico por respuesta: instrumento + consentimiento + respuestas en
 * una sola transacción, sin `farmer` ni `user`. Ver "Puntos delicados del
 * diseño" en spec/79_instrumentos_publicos_url_compartible.md.
 */
@Injectable()
export class PublicSurveysService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(Survey)
    private readonly surveysRepository: Repository<Survey>,
    private readonly instrumentsService: InstrumentsService,
  ) {}

  /** El instrumento se sirve solo si sigue activo y público en este momento. */
  private isServable(
    instrument: Pick<Instrument, 'isActive' | 'isPublic'>,
  ): boolean {
    return instrument.isActive && instrument.isPublic;
  }

  async getPublicInstrument(instrumentId: string) {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId },
    });

    if (!instrument) {
      throw new NotFoundException({
        reason: 'not_found',
        message: 'El enlace no es válido o la encuesta no existe.',
      });
    }

    if (!this.isServable(instrument)) {
      throw new NotFoundException({
        reason: 'closed',
        message: 'Esta encuesta ya no está recibiendo respuestas.',
      });
    }

    const rendered =
      await this.instrumentsService.findOneForRender(instrumentId);

    const consentDocument = await this.surveysRepository.manager
      .getRepository(ConsentDocument)
      .findOne({
        where: { status: 'published' },
        order: { publishedAt: 'DESC' },
      });

    if (!consentDocument) {
      // Sin documento de consentimiento publicado no se puede recolectar
      // datos personales por este canal (ver spec 79, sección "Habeas
      // data"). Se reporta como no disponible, no como un 500: es un
      // estado de configuración del proyecto, no un error del cliente.
      throw new NotFoundException({
        reason: 'not_found',
        message: 'Esta encuesta no está disponible en este momento.',
      });
    }

    return {
      ...rendered,
      consentDocument: {
        consentDocumentId: consentDocument.consentDocumentId,
        version: consentDocument.version,
        title: consentDocument.title,
        body: consentDocument.body,
        dataProcessingClause: consentDocument.dataProcessingClause,
        multimediaClause: consentDocument.multimediaClause,
        rightsClause: consentDocument.rightsClause,
        responsibleEntity: consentDocument.responsibleEntity,
        contactEmail: consentDocument.contactEmail,
      },
    };
  }

  async submit(dto: SubmitPublicSurveyDto): Promise<{ surveyId: string }> {
    if (!dto.consent.acceptedDataProcessing) {
      throw new BadRequestException(
        'La autorización de tratamiento de datos es obligatoria para enviar la encuesta.',
      );
    }

    return this.surveysRepository.manager.transaction(async (manager) => {
      const instrument = await manager.getRepository(Instrument).findOne({
        where: { instrumentId: dto.instrumentId },
      });

      if (!instrument) {
        throw new NotFoundException('Instrument not found');
      }

      // Criterio 9 — el enlace pudo cerrarse entre la carga del formulario
      // y el envío. Se rechaza sin crear nada (toda la función corre dentro
      // de esta transacción).
      if (!this.isServable(instrument)) {
        throw new ForbiddenException(
          'Esta encuesta ya no está recibiendo respuestas.',
        );
      }

      const questionIds = [...new Set(dto.responses.map((r) => r.questionId))];
      const questions = await manager.getRepository(Question).find({
        where: { questionId: In(questionIds) },
        relations: { type: true, section: { instrument: true } },
      });
      const questionsById = new Map(questions.map((q) => [q.questionId, q]));

      for (const questionId of questionIds) {
        const question = questionsById.get(questionId);
        if (!question) {
          throw new NotFoundException('Question not found');
        }
        if (question.section.instrument.instrumentId !== dto.instrumentId) {
          throw new BadRequestException(
            'Una de las preguntas no pertenece a este instrumento.',
          );
        }
      }

      const optionIds = [
        ...new Set(
          dto.responses
            .map((r) => r.optionId)
            .filter((optionId): optionId is string => !!optionId),
        ),
      ];
      const options = optionIds.length
        ? await manager.getRepository(OptionQuestion).find({
            where: { optionId: In(optionIds) },
            relations: { question: true },
          })
        : [];
      const optionsById = new Map(options.map((o) => [o.optionId, o]));

      const consentDocument = dto.consent.consentDocumentId
        ? await manager.getRepository(ConsentDocument).findOne({
            where: { consentDocumentId: dto.consent.consentDocumentId },
          })
        : await manager.getRepository(ConsentDocument).findOne({
            where: { status: 'published' },
            order: { publishedAt: 'DESC' },
          });

      if (!consentDocument) {
        throw new NotFoundException(
          'No hay un documento de consentimiento publicado',
        );
      }

      const survey = manager.getRepository(Survey).create({
        origin: 'public',
        reviewStatus: 'pending',
        sincronized: true,
        instruments: [instrument],
      });
      const savedSurvey = await manager.getRepository(Survey).save(survey);

      for (const item of dto.responses) {
        const question = questionsById.get(item.questionId)!;

        if (
          item.optionId === undefined &&
          item.textValue === undefined &&
          item.numericValue === undefined &&
          item.booleanValue === undefined
        ) {
          throw new BadRequestException(
            'At least one response value must be provided',
          );
        }

        let option: OptionQuestion | null = null;
        if (item.optionId) {
          option = optionsById.get(item.optionId) ?? null;
          if (!option) {
            throw new NotFoundException('Option not found');
          }
          if (option.question.questionId !== question.questionId) {
            throw new BadRequestException(
              'Option does not belong to the provided question',
            );
          }
        }

        const response = manager.getRepository(Response).create({
          survey: savedSurvey,
          question,
          option: option ?? undefined,
          textValue: item.textValue,
          numericValue: item.numericValue,
          booleanValue: item.booleanValue,
        });
        await manager.getRepository(Response).save(response);
      }

      const consentRecord = manager.getRepository(ConsentRecord).create({
        survey: savedSurvey,
        consentDocument,
        acceptedDataProcessing: dto.consent.acceptedDataProcessing,
        acceptedPhoto: dto.consent.acceptedPhoto ?? false,
        acceptedAudio: dto.consent.acceptedAudio ?? false,
        acceptedVideo: dto.consent.acceptedVideo ?? false,
        acceptedFollowUpContact: dto.consent.acceptedFollowUpContact ?? false,
        acceptedAt: new Date(),
        syncedAt: new Date(),
      });
      await manager.getRepository(ConsentRecord).save(consentRecord);

      return { surveyId: savedSurvey.surveyId };
    });
  }
}
