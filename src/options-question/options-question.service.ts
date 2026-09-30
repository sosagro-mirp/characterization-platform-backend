import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { CreateOptionQuestionDto } from './dto/create-option-question.dto';
import { UpdateOptionQuestionDto } from './dto/update-option-question.dto';
import { OptionQuestion } from './entities/option-question.entity';
import { catalogsForSystemField, METADATA_CATALOGS } from './metadata-catalogs';

@Injectable()
export class OptionsQuestionService {
  constructor(
    @InjectRepository(OptionQuestion)
    private readonly optionsQuestionRepository: Repository<OptionQuestion>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
  ) {}

  async create(
    questionId: string,
    createOptionQuestionDto: CreateOptionQuestionDto,
  ): Promise<OptionQuestion> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (createOptionQuestionDto.isOther) {
      const existing = await this.optionsQuestionRepository.findOne({
        where: { question: { questionId }, isOther: true },
      });
      if (existing) {
        throw new BadRequestException(
          'This question already has an "other" option',
        );
      }
    }

    await this.assertValidMetadataId(
      question,
      createOptionQuestionDto.metadataId,
    );

    const option = this.optionsQuestionRepository.create({
      ...createOptionQuestionDto,
      text: createOptionQuestionDto.text.trim(),
      question,
    });

    return await this.optionsQuestionRepository.save(option);
  }

  async createMany(
    questionId: string,
    createOptionQuestionDtos: CreateOptionQuestionDto[],
  ): Promise<OptionQuestion[]> {
    if (createOptionQuestionDtos.length === 0) {
      throw new BadRequestException('At least one option must be provided');
    }

    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    // Se validan todos antes de guardar: un solo id inválido no deja opciones a medias.
    for (const id of new Set(
      createOptionQuestionDtos.map((dto) => dto.metadataId),
    )) {
      await this.assertValidMetadataId(question, id);
    }

    const options = this.optionsQuestionRepository.create(
      createOptionQuestionDtos.map((dto) => ({
        ...dto,
        text: dto.text.trim(),
        question,
      })),
    );

    return await this.optionsQuestionRepository.save(options);
  }

  async findAll(questionId: string): Promise<OptionQuestion[]> {
    await this.ensureQuestionExists(questionId);

    return await this.optionsQuestionRepository.find({
      where: { question: { questionId } },
      order: { createdAt: 'ASC' },
      relations: { question: true },
    });
  }

  async findOne(questionId: string, optionId: string): Promise<OptionQuestion> {
    await this.ensureQuestionExists(questionId);

    const option = await this.optionsQuestionRepository.findOne({
      where: {
        optionId,
        question: { questionId },
      },
      relations: { question: true },
    });

    if (!option) {
      throw new NotFoundException('Option not found');
    }

    return option;
  }

  async update(
    questionId: string,
    optionId: string,
    updateOptionQuestionDto: UpdateOptionQuestionDto,
  ): Promise<OptionQuestion> {
    const option = await this.findOne(questionId, optionId);

    await this.assertValidMetadataId(
      option.question,
      updateOptionQuestionDto.metadataId,
    );

    Object.assign(option, updateOptionQuestionDto);

    return await this.optionsQuestionRepository.save(option);
  }

  async remove(questionId: string, optionId: string): Promise<void> {
    const option = await this.findOne(questionId, optionId);

    // Spec 84 — "editar en sitio + archivar": una opción usada en alguna
    // respuesta no se borra. Se archiva en su lugar.
    const responseCount = await this.responsesRepository.count({
      where: { option: { optionId } },
    });
    if (responseCount > 0) {
      throw new ConflictException({
        message:
          'Esta opción tiene respuestas y no se puede borrar. Archívela en su lugar.',
        optionId,
        responseCount,
      });
    }

    await this.optionsQuestionRepository.remove(option);
  }

  /** Spec 84 — la opción deja de mostrarse; sus respuestas se conservan. */
  async archive(questionId: string, optionId: string): Promise<OptionQuestion> {
    const option = await this.findOne(questionId, optionId);
    option.archivedAt = new Date();
    return this.optionsQuestionRepository.save(option);
  }

  async unarchive(
    questionId: string,
    optionId: string,
  ): Promise<OptionQuestion> {
    const option = await this.findOne(questionId, optionId);
    option.archivedAt = null;
    return this.optionsQuestionRepository.save(option);
  }

  /**
   * Spec 93 — `metadataId` debe existir en el catálogo que corresponde al
   * `systemField` de la pregunta. `null` y `undefined` no se validan.
   */
  private async assertValidMetadataId(
    question: Pick<Question, 'systemField'>,
    metadataId: string | null | undefined,
  ): Promise<void> {
    if (!metadataId) return;

    const kinds = catalogsForSystemField(question.systemField);
    for (const kind of kinds) {
      const { table, idColumn } = METADATA_CATALOGS[kind];
      const rows: unknown[] =
        await this.optionsQuestionRepository.manager.query(
          `SELECT 1 FROM ${table} WHERE ${idColumn} = $1::uuid LIMIT 1`,
          [metadataId],
        );
      if (rows.length > 0) return;
    }

    const expected = kinds.map((k) => METADATA_CATALOGS[k].label).join(', ');
    throw new BadRequestException(
      `metadataId no existe en el catálogo esperado (${expected})`,
    );
  }

  private async ensureQuestionExists(questionId: string): Promise<void> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }
  }
}
