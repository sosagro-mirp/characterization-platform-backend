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
import {
  OPTION_ORIGINS,
  OptionQuestion,
} from './entities/option-question.entity';

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

  /**
   * Spec 86 — con `quarantine` (encuestador con un cliente viejo que todavía
   * crea la opción "Otros" dinámica) la opción nace archivada y con
   * origin='field': no aparece en el instrumento y las respuestas que la usen
   * se normalizan a la opción "Otros" (ver responses/other-option.ts).
   */
  async create(
    questionId: string,
    createOptionQuestionDto: CreateOptionQuestionDto,
    { quarantine = false }: { quarantine?: boolean } = {},
  ): Promise<OptionQuestion> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    if (quarantine) {
      const option = this.optionsQuestionRepository.create({
        text: createOptionQuestionDto.text.trim(),
        isOther: false,
        origin: OPTION_ORIGINS.FIELD,
        archivedAt: new Date(),
        question,
      });
      return await this.optionsQuestionRepository.save(option);
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

    // Spec 86 — una sola opción "Otros" por pregunta, también en lote.
    const otherCount = createOptionQuestionDtos.filter(
      (dto) => dto.isOther,
    ).length;
    if (otherCount > 0) {
      const existing = await this.optionsQuestionRepository.count({
        where: { question: { questionId }, isOther: true },
      });
      if (otherCount + existing > 1) {
        throw new BadRequestException(
          'This question already has an "other" option',
        );
      }
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

  private async ensureQuestionExists(questionId: string): Promise<void> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }
  }
}
