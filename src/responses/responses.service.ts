import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
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
  ) {}

  async create(createResponseDto: CreateResponseDto): Promise<Response> {
    return await this.responsesRepository.manager.transaction(
      async (manager) => {
        return await this.buildAndSaveResponse(createResponseDto, manager);
      },
    );
  }

  async createMany(
    createResponseDtos: CreateResponseDto[],
  ): Promise<Response[]> {
    if (createResponseDtos.length === 0) {
      throw new BadRequestException('At least one response must be provided');
    }

    return await this.responsesRepository.manager.transaction(
      async (manager) => {
        const responses: Response[] = [];

        for (const createResponseDto of createResponseDtos) {
          const response = await this.buildAndSaveResponse(
            createResponseDto,
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
    manager: EntityManager,
  ): Promise<Response> {
    const {
      surveyId,
      questionId,
      optionId,
      textValue,
      numericValue,
      booleanValue,
    } = createResponseDto;

    if (
      optionId === undefined &&
      textValue === undefined &&
      numericValue === undefined &&
      booleanValue === undefined
    ) {
      throw new BadRequestException(
        'At least one response value must be provided',
      );
    }

    const survey = await manager.getRepository(Survey).findOne({
      where: { surveyId },
    });

    if (!survey) {
      throw new NotFoundException('Survey not found');
    }

    const question = await manager.getRepository(Question).findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    let option: OptionQuestion | null = null;

    if (optionId) {
      option = await manager.getRepository(OptionQuestion).findOne({
        where: { optionId },
        relations: { question: true },
      });

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
      survey,
      question,
      option: option ?? undefined,
      textValue,
      numericValue,
      booleanValue,
    });

    return await manager.getRepository(Response).save(response);
  }
}
