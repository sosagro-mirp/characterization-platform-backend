import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { User } from 'src/users/entities/user.entity';
import { Town } from 'src/towns/entities/town.entity';
import { In, IsNull, Repository } from 'typeorm';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { Instrument } from './entities/instrument.entity';

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(ActorType)
    private readonly actorTypesRepository: Repository<ActorType>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Town)
    private readonly townsRepository: Repository<Town>,
  ) {}

  async create(createInstrumentDto: CreateInstrumentDto, userId?: string): Promise<Instrument> {
    const { actorTypeIds, ...rest } = createInstrumentDto;

    let actorTypes: ActorType[] = [];
    if (actorTypeIds && actorTypeIds.length > 0) {
      actorTypes = await this.actorTypesRepository.find({
        where: { actorTypeId: In(actorTypeIds) },
      });

      if (actorTypes.length !== actorTypeIds.length) {
        throw new NotFoundException('One or more actor types were not found');
      }
    }

    let user: User | undefined;
    if (userId) {
      user = await this.usersRepository.findOne({ where: { userId } }) ?? undefined;
    }

    const instrument = this.instrumentsRepository.create({
      ...rest,
      actorTypes,
      createdBy: user,
      updatedBy: user,
    });

    return await this.instrumentsRepository.save(instrument);
  }

  async findAll(excludeSystem = false): Promise<Instrument[]> {
    return await this.instrumentsRepository.find({
      where: excludeSystem ? { code: IsNull() } : undefined,
      relations: { actorTypes: true },
    });
  }

  /** Fase 2 (Spec 30): catálogo público para el dashboard — solo instrumentos activos. */
  async findAllPublic(): Promise<Pick<Instrument, 'instrumentId' | 'name' | 'code'>[]> {
    return await this.instrumentsRepository.find({
      where: { isActive: true },
      select: ['instrumentId', 'name', 'code'],
      order: { name: 'ASC' },
    });
  }

  async findByActorType(actorTypeId: string): Promise<Instrument[]> {
    return await this.instrumentsRepository
      .createQueryBuilder('instrument')
      .innerJoin('instrument.actorTypes', 'actorType')
      .leftJoinAndSelect('instrument.actorTypes', 'at')
      .where('actorType.actorTypeId = :actorTypeId', { actorTypeId })
      .andWhere('instrument.isActive = true')
      .orderBy('instrument.name', 'ASC')
      .getMany();
  }

  async findByCode(code: string): Promise<{ instrumentId: string; name: string }> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { code },
      select: ['instrumentId', 'name'],
    });
    if (!instrument) throw new NotFoundException(`Instrument with code '${code}' not found`);
    return { instrumentId: instrument.instrumentId, name: instrument.name };
  }

  async findOne(id: string): Promise<Instrument> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: id },
      relations: { actorTypes: true },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    return instrument;
  }

  async update(id: string, updateInstrumentDto: UpdateInstrumentDto, userId?: string): Promise<Instrument> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: id },
      relations: { actorTypes: true },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    const { actorTypeIds, ...rest } = updateInstrumentDto;

    Object.assign(instrument, rest);

    if (actorTypeIds !== undefined) {
      if (actorTypeIds.length > 0) {
        const actorTypes = await this.actorTypesRepository.find({
          where: { actorTypeId: In(actorTypeIds) },
        });
        if (actorTypes.length !== actorTypeIds.length) {
          throw new NotFoundException('One or more actor types were not found');
        }
        instrument.actorTypes = actorTypes;
      } else {
        instrument.actorTypes = [];
      }
    }

    if (userId) {
      const user = await this.usersRepository.findOne({ where: { userId } });
      if (user) instrument.updatedBy = user;
    }

    return await this.instrumentsRepository.save(instrument);
  }

  async remove(id: string): Promise<void> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: id },
      relations: { surveys: true },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    if (instrument.surveys && instrument.surveys.length > 0) {
      throw new BadRequestException(
        'Cannot delete an instrument that has associated surveys. Deactivate it instead.',
      );
    }

    await this.instrumentsRepository.remove(instrument);
  }

  async findOneForRender(id: string) {
    const instrument = await this.instrumentsRepository
      .createQueryBuilder('instrument')
      .leftJoinAndSelect('instrument.sections', 'section')
      .leftJoinAndSelect('section.questions', 'question')
      .leftJoinAndSelect('question.type', 'type')
      .leftJoinAndSelect('question.options', 'option')
      .leftJoinAndSelect('question.conditionQuestion', 'conditionQuestion')
      .where('instrument.instrumentId = :id', { id })
      .orderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .addOrderBy('option.createdAt', 'ASC')
      .getOne();

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    // Recolectar townIds únicos de las preguntas farm.town para resolverlos en una sola query
    const townIds = new Set<string>();
    for (const section of instrument.sections ?? []) {
      for (const question of section.questions ?? []) {
        if (question.systemField === 'farm.town') {
          for (const option of question.options ?? []) {
            if (option.metadataId) townIds.add(option.metadataId);
          }
        }
      }
    }

    // Mapa townId → departmentId (query única si hay towns referenciados)
    const townToDepartment = new Map<string, string>();
    if (townIds.size > 0) {
      const towns = await this.townsRepository.find({
        where: { townId: In([...townIds]) },
        relations: ['department'],
      });
      for (const town of towns) {
        if (town.department) {
          townToDepartment.set(town.townId, town.department.departmentId);
        }
      }
    }

    return {
      instrumentId: instrument.instrumentId,
      name: instrument.name,
      version: instrument.version,
      publishDate: instrument.publishDate,
      isActive: instrument.isActive,
      code: instrument.code ?? null,
      sections: (instrument.sections ?? []).map((section) => ({
        sectionId: section.sectionId,
        name: section.name,
        order: section.order,
        questions: (section.questions ?? []).map((question) => ({
          questionId: question.questionId,
          text: question.text,
          isRequired: question.isRequired,
          isSelectionCriteria: question.isSelectionCriteria,
          isKeyQuestion: question.isKeyQuestion,
          order: question.order,
          systemField: question.systemField ?? null,
          type: question.type
            ? {
                typeId: question.type.typeId,
                name: question.type.name,
              }
            : null,
          options: (
            question.type?.name === 'likert'
              // Likert scales must render in a consistent direction (worst -> best);
              // relying on createdAt (seed insertion order) let some questions come
              // back reversed relative to others. `value` already encodes the
              // intended scale position for every likert option, so it's a safe sort key.
              ? [...(question.options ?? [])].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
              : (question.options ?? [])
          ).map((option) => {
            let departmentId: string | null = null;
            if (question.systemField === 'farm.department') {
              departmentId = option.metadataId ?? null;
            } else if (question.systemField === 'farm.town') {
              departmentId = (option.metadataId && townToDepartment.get(option.metadataId)) || null;
            }
            return {
              optionId: option.optionId,
              text: option.text,
              value: option.value ?? null,
              isOther: option.isOther,
              metadataId: option.metadataId ?? null,
              departmentId,
            };
          }),
          conditionQuestionId: question.conditionQuestion?.questionId ?? null,
          conditionValue: question.conditionValue ?? null,
        })),
      })),
    };
  }
}
