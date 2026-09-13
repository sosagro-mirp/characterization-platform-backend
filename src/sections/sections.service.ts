import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Question } from 'src/questions/entities/question.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { Section } from './entities/section.entity';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section)
    private readonly sectionsRepository: Repository<Section>,
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(StepCondition)
    private readonly stepConditionsRepository: Repository<StepCondition>,
  ) {}

  /**
   * Spec 84 — preguntas visibles y condiciones de paso, **fuera** de esta
   * sección, que dependen de alguna pregunta de dentro. Las dependencias
   * internas no cuentan: se borran junto con la sección.
   */
  private async findExternalDependents(sectionId: string): Promise<{
    dependentQuestions: string[];
    stepConditions: number;
  }> {
    const dependentQuestions = await this.questionsRepository.find({
      where: {
        conditionQuestion: { section: { sectionId } },
        archivedAt: IsNull(),
      },
      relations: ['section'],
    });
    const stepConditions = await this.stepConditionsRepository.count({
      where: { conditionQuestion: { section: { sectionId } } },
    });
    return {
      dependentQuestions: dependentQuestions
        .filter((q) => q.section?.sectionId !== sectionId)
        .map((q) => q.questionId),
      stepConditions,
    };
  }

  async create(
    instrumentId: string,
    createSectionDto: CreateSectionDto,
  ): Promise<Section> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    const section = this.sectionsRepository.create({
      ...createSectionDto,
      instrument,
    });

    return await this.sectionsRepository.save(section);
  }

  async findAll(instrumentId: string): Promise<Section[]> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    return await this.sectionsRepository.find({
      where: { instrument: { instrumentId } },
      order: { order: 'ASC' },
    });
  }

  async findOne(instrumentId: string, sectionId: string): Promise<Section> {
    const section = await this.sectionsRepository.findOne({
      where: { sectionId, instrument: { instrumentId } },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    return section;
  }

  async update(
    instrumentId: string,
    sectionId: string,
    updateSectionDto: UpdateSectionDto,
  ): Promise<Section> {
    const section = await this.sectionsRepository.findOne({
      where: { sectionId, instrument: { instrumentId } },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    if (
      updateSectionDto.order !== undefined &&
      updateSectionDto.order !== section.order
    ) {
      const sibling = await this.sectionsRepository.findOne({
        where: { instrument: { instrumentId }, order: updateSectionDto.order },
      });
      if (sibling) {
        sibling.order = section.order;
        await this.sectionsRepository.save(sibling);
      }
    }

    Object.assign(section, updateSectionDto);
    return await this.sectionsRepository.save(section);
  }

  async remove(instrumentId: string, sectionId: string): Promise<void> {
    const section = await this.sectionsRepository.findOne({
      where: { sectionId, instrument: { instrumentId } },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    // Spec 84 — "editar en sitio + archivar": una sección con alguna
    // pregunta respondida no se borra. Archivar las preguntas que sobren y
    // borrar la sección cuando quede vacía.
    const responseCount = await this.responsesRepository.count({
      where: { question: { section: { sectionId } } },
    });
    if (responseCount > 0) {
      throw new ConflictException({
        message:
          'Esta sección tiene preguntas con respuestas y no se puede borrar.',
        sectionId,
        responseCount,
      });
    }

    // Spec 84 — borrar la sección borra en cascada sus preguntas, y las FK de
    // condición son `onDelete: 'SET NULL'`: sin esta guarda, una pregunta de
    // otra sección o un paso de campaña que dependiera de alguna de ellas se
    // quedaría en silencio sin condición, visible siempre. Mismo criterio que
    // `QuestionsService.remove`, pero mirando todas las preguntas de la
    // sección de una vez.
    const dependents = await this.findExternalDependents(sectionId);
    if (
      dependents.dependentQuestions.length > 0 ||
      dependents.stepConditions > 0
    ) {
      throw new ConflictException({
        message:
          'Otras preguntas o pasos de campaña dependen de preguntas de esta sección.',
        sectionId,
        ...dependents,
      });
    }

    const removedOrder = section.order;
    await this.sectionsRepository.remove(section);

    const remaining = await this.sectionsRepository.find({
      where: { instrument: { instrumentId }, order: Not(removedOrder) },
      order: { order: 'ASC' },
    });

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        remaining[i].order = i + 1;
      }
    }
    await this.sectionsRepository.save(remaining);
  }
}
