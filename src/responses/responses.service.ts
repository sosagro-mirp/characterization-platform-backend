import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import {
  MediaAttachment,
  MediaAttachmentStatus,
} from 'src/media-attachments/entities/media-attachment.entity';
import { CreateResponseDto } from './dto/create-response.dto';
import { Response } from './entities/response.entity';

@Injectable()
export class ResponsesService {
  constructor(
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
    @InjectRepository(Survey)
    private readonly surveysRepository: Repository<Survey>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(OptionQuestion)
    private readonly optionsQuestionRepository: Repository<OptionQuestion>,
    @InjectRepository(MediaAttachment)
    private readonly attachmentRepository: Repository<MediaAttachment>,
  ) {}

  async create(createResponseDto: CreateResponseDto): Promise<Response> {
    return await this.responsesRepository.manager.transaction(
      async (manager) => {
        const survey = await manager.getRepository(Survey).findOne({
          where: { surveyId: createResponseDto.surveyId },
        });

        if (!survey) {
          throw new NotFoundException('Survey not found');
        }

        const question = await manager.getRepository(Question).findOne({
          where: { questionId: createResponseDto.questionId },
          relations: { type: true },
        });

        if (!question) {
          throw new NotFoundException('Question not found');
        }

        const questionsById = new Map([[question.questionId, question]]);

        let optionsById = new Map<string, OptionQuestion>();

        if (createResponseDto.optionId) {
          const option = await manager.getRepository(OptionQuestion).findOne({
            where: { optionId: createResponseDto.optionId },
            relations: { question: true },
          });

          if (!option) {
            throw new NotFoundException('Option not found');
          }

          optionsById = new Map([[option.optionId, option]]);
        }

        return await this.buildAndSaveResponse(
          createResponseDto,
          survey,
          questionsById,
          optionsById,
          manager,
        );
      },
    );
  }

  async createMany(
    createResponseDtos: CreateResponseDto[],
  ): Promise<Response[]> {
    if (createResponseDtos.length === 0) {
      throw new BadRequestException('At least one response must be provided');
    }

    const surveyIds = [...new Set(createResponseDtos.map((d) => d.surveyId))];
    if (surveyIds.length > 1) {
      throw new BadRequestException(
        'All responses must belong to the same survey',
      );
    }

    const surveyId = surveyIds[0];

    const existingCount = await this.responsesRepository.count({
      where: { survey: { surveyId } },
    });

    if (existingCount > 0) {
      return this.responsesRepository.find({
        where: { survey: { surveyId } },
        relations: { survey: true, question: true, option: true },
      });
    }

    return await this.responsesRepository.manager.transaction(
      async (manager) => {
        const survey = await manager.getRepository(Survey).findOne({
          where: { surveyId },
        });

        if (!survey) {
          throw new NotFoundException('Survey not found');
        }

        const questionIds = [
          ...new Set(createResponseDtos.map((d) => d.questionId)),
        ];
        const optionIds = [
          ...new Set(
            createResponseDtos
              .map((d) => d.optionId)
              .filter((optionId): optionId is string => !!optionId),
          ),
        ];

        const questions = questionIds.length
          ? await manager.getRepository(Question).find({
              where: { questionId: In(questionIds) },
              relations: { type: true },
            })
          : [];
        const questionsById = new Map(
          questions.map((question) => [question.questionId, question]),
        );

        const options = optionIds.length
          ? await manager.getRepository(OptionQuestion).find({
              where: { optionId: In(optionIds) },
              relations: { question: true },
            })
          : [];
        const optionsById = new Map(
          options.map((option) => [option.optionId, option]),
        );

        const responses: Response[] = [];

        for (const createResponseDto of createResponseDtos) {
          const response = await this.buildAndSaveResponse(
            createResponseDto,
            survey,
            questionsById,
            optionsById,
            manager,
          );
          responses.push(response);
        }

        return responses;
      },
    );
  }

  private async buildAndSaveResponse(
    createResponseDto: CreateResponseDto,
    survey: Survey,
    questionsById: Map<string, Question>,
    optionsById: Map<string, OptionQuestion>,
    manager: EntityManager,
  ): Promise<Response> {
    const {
      questionId,
      optionId,
      textValue,
      numericValue,
      booleanValue,
      attachmentId,
    } = createResponseDto;

    if (
      optionId === undefined &&
      textValue === undefined &&
      numericValue === undefined &&
      booleanValue === undefined &&
      attachmentId === undefined
    ) {
      throw new BadRequestException(
        'At least one response value must be provided',
      );
    }

    const question = questionsById.get(questionId);

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (
      question.type?.name === 'numeric_with_unit' &&
      (numericValue === undefined || numericValue === null || !optionId)
    ) {
      throw new BadRequestException(
        'numeric_with_unit questions require both numericValue and optionId',
      );
    }

    let option: OptionQuestion | null = null;

    if (optionId) {
      option = optionsById.get(optionId) ?? null;

      if (!option) {
        throw new NotFoundException('Option not found');
      }

      if (option.question.questionId !== question.questionId) {
        throw new BadRequestException(
          'Option does not belong to the provided question',
        );
      }
    }

    let attachment: MediaAttachment | null = null;

    if (attachmentId) {
      attachment = await manager.getRepository(MediaAttachment).findOne({
        where: { attachmentId },
      });

      if (!attachment) {
        throw new NotFoundException('Media attachment not found');
      }

      if (attachment.status !== MediaAttachmentStatus.UPLOADED) {
        throw new BadRequestException(
          'Media attachment has not been confirmed as uploaded',
        );
      }
    }

    const response = manager.getRepository(Response).create({
      survey,
      question,
      option: option ?? undefined,
      textValue,
      numericValue,
      booleanValue,
    });

    const saved = await manager.getRepository(Response).save(response);

    if (attachment) {
      await manager
        .getRepository(MediaAttachment)
        .update({ attachmentId }, { response: saved });
    }

    return saved;
  }
}
