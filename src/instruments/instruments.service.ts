import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { User } from 'src/users/entities/user.entity';
import { Town } from 'src/towns/entities/town.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { EntityManager, In, Repository } from 'typeorm';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { DuplicateInstrumentDto } from './dto/duplicate-instrument.dto';
import { Instrument } from './entities/instrument.entity';
import { SYSTEM_INSTRUMENT_CODES } from './system-instrument-codes';

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

  async create(
    createInstrumentDto: CreateInstrumentDto,
    userId?: string,
  ): Promise<Instrument> {
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
      user =
        (await this.usersRepository.findOne({ where: { userId } })) ??
        undefined;
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
    const qb = this.instrumentsRepository
      .createQueryBuilder('instrument')
      .leftJoinAndSelect('instrument.actorTypes', 'actorType')
      .leftJoin('instrument.createdBy', 'createdBy')
      .leftJoin('instrument.updatedBy', 'updatedBy')
      .addSelect(['createdBy.userId', 'createdBy.name', 'createdBy.lastName'])
      .addSelect(['updatedBy.userId', 'updatedBy.name', 'updatedBy.lastName']);

    if (excludeSystem) {
      qb.where(
        'instrument.code IS NULL OR instrument.code NOT IN (:...codes)',
        {
          codes: SYSTEM_INSTRUMENT_CODES,
        },
      );
    }

    return qb.getMany();
  }

  /** Fase 2 (Spec 30): catálogo público para el dashboard — solo instrumentos activos. */
  async findAllPublic(): Promise<
    Pick<Instrument, 'instrumentId' | 'name' | 'code'>[]
  > {
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

  // Alias legacy → código actual (2026-08-22). `mobile/` y `frontend/`
  // siguen pidiendo los códigos literales 'S1'/'S2' que el flujo de
  // identificación S1/S2 tenía antes del backfill del spec 43, que renombró
  // esos dos instrumentos a 'S1a'/'S1b' para no chocar con el código de
  // dashboard 'S2' (un instrumento de contenido real, no relacionado).
  // Nadie más llama a este endpoint con un código de dashboard, así que el
  // alias es seguro: no se resuelve al instrumento equivocado para ningún
  // otro llamador.
  private static readonly LEGACY_CODE_ALIASES: Record<string, string> = {
    S1: 'S1a',
    S2: 'S1b',
  };

  async findByCode(
    code: string,
  ): Promise<{ instrumentId: string; name: string }> {
    const resolvedCode = InstrumentsService.LEGACY_CODE_ALIASES[code] ?? code;
    const instrument = await this.instrumentsRepository.findOne({
      where: { code: resolvedCode },
      select: ['instrumentId', 'name'],
    });
    if (!instrument)
      throw new NotFoundException(`Instrument with code '${code}' not found`);
    return { instrumentId: instrument.instrumentId, name: instrument.name };
  }

  async findOne(id: string): Promise<Instrument> {
    const instrument = await this.instrumentsRepository
      .createQueryBuilder('instrument')
      .leftJoinAndSelect('instrument.actorTypes', 'actorType')
      .leftJoin('instrument.createdBy', 'createdBy')
      .leftJoin('instrument.updatedBy', 'updatedBy')
      .addSelect(['createdBy.userId', 'createdBy.name', 'createdBy.lastName'])
      .addSelect(['updatedBy.userId', 'updatedBy.name', 'updatedBy.lastName'])
      .where('instrument.instrumentId = :id', { id })
      .getOne();

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    return instrument;
  }

  async update(
    id: string,
    updateInstrumentDto: UpdateInstrumentDto,
    userId?: string,
  ): Promise<Instrument> {
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

  /**
   * Fase 1 (Spec 77): copia profunda y transaccional de un instrumento
   * completo — secciones, preguntas y opciones — junto con sus actorTypes.
   *
   * La copia SIEMPRE nace inactiva y sin `code`: heredar `code` violaría el
   * índice único de la columna y convertiría la copia en un instrumento del
   * sistema (S1a, S1b) sin que nadie lo pida. `isActive=false` evita que se
   * aplique en campo antes de revisarla.
   *
   * Las condiciones de visibilidad internas (`conditionQuestionId`) se
   * remapean a las preguntas de la copia en una segunda pasada: la pregunta
   * condición puede vivir en una sección posterior a la dependiente, así que
   * todavía no existe en el momento de insertar esta última.
   */
  async duplicate(
    id: string,
    duplicateInstrumentDto: DuplicateInstrumentDto,
    userId?: string,
  ): Promise<Instrument> {
    const source = await this.instrumentsRepository
      .createQueryBuilder('instrument')
      .leftJoinAndSelect('instrument.actorTypes', 'actorType')
      .leftJoinAndSelect('instrument.sections', 'section')
      .leftJoinAndSelect('section.questions', 'question')
      .leftJoinAndSelect('question.type', 'type')
      .leftJoinAndSelect('question.options', 'option')
      .leftJoinAndSelect('question.conditionQuestion', 'conditionQuestion')
      .where('instrument.instrumentId = :id', { id })
      .orderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .getOne();

    if (!source) {
      throw new NotFoundException('Instrument not found');
    }

    const user = userId
      ? ((await this.usersRepository.findOne({ where: { userId } })) ??
        undefined)
      : undefined;

    const newInstrumentId =
      await this.instrumentsRepository.manager.transaction(
        async (manager: EntityManager) => {
          const copy = manager.create(Instrument, {
            name: duplicateInstrumentDto.name,
            version: duplicateInstrumentDto.version,
            publishDate:
              duplicateInstrumentDto.publishDate ??
              new Date().toISOString().slice(0, 10),
            isActive: false,
            code: undefined,
            actorTypes: source.actorTypes ?? [],
            createdBy: user,
            updatedBy: user,
          });
          const savedInstrument = await manager.save(Instrument, copy);

          // originalQuestionId → copyQuestionId, para el remapeo de condiciones.
          const questionIdMap = new Map<string, string>();
          // Pendientes de remapear: copyQuestionId → { originalConditionQuestionId, conditionValue }
          const pendingConditions: {
            copyQuestionId: string;
            originalConditionQuestionId: string;
            conditionValue: string | null;
          }[] = [];

          for (const section of source.sections ?? []) {
            const sectionCopy = manager.create(Section, {
              name: section.name,
              order: section.order,
              instrument: savedInstrument,
            });
            const savedSection = await manager.save(Section, sectionCopy);

            for (const question of section.questions ?? []) {
              const questionCopy = manager.create(Question, {
                section: savedSection,
                text: question.text,
                type: question.type,
                isRequired: question.isRequired,
                isSelectionCriteria: question.isSelectionCriteria,
                isKeyQuestion: question.isKeyQuestion,
                order: question.order,
                systemField: question.systemField ?? undefined,
                conditionValue: question.conditionValue ?? undefined,
              });
              const savedQuestion = await manager.save(Question, questionCopy);
              questionIdMap.set(question.questionId, savedQuestion.questionId);

              if (question.conditionQuestion) {
                pendingConditions.push({
                  copyQuestionId: savedQuestion.questionId,
                  originalConditionQuestionId:
                    question.conditionQuestion.questionId,
                  conditionValue: question.conditionValue ?? null,
                });
              }

              for (const option of question.options ?? []) {
                const optionCopy = manager.create(OptionQuestion, {
                  question: savedQuestion,
                  text: option.text,
                  value: option.value ?? undefined,
                  isOther: option.isOther,
                  metadataId: option.metadataId ?? null,
                });
                await manager.save(OptionQuestion, optionCopy);
              }
            }
          }

          for (const pending of pendingConditions) {
            const copiedConditionQuestionId = questionIdMap.get(
              pending.originalConditionQuestionId,
            );
            if (!copiedConditionQuestionId) continue;
            await manager.update(Question, pending.copyQuestionId, {
              conditionQuestion: { questionId: copiedConditionQuestionId },
              conditionValue: pending.conditionValue ?? undefined,
            });
          }

          return savedInstrument.instrumentId;
        },
      );

    return this.findOne(newInstrumentId);
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
          options: (question.type?.name === 'likert'
            ? // Likert scales must render in a consistent direction (worst -> best);
              // relying on createdAt (seed insertion order) let some questions come
              // back reversed relative to others. `value` already encodes the
              // intended scale position for every likert option, so it's a safe sort key.
              [...(question.options ?? [])].sort(
                (a, b) => (a.value ?? 0) - (b.value ?? 0),
              )
            : (question.options ?? [])
          ).map((option) => {
            let departmentId: string | null = null;
            if (question.systemField === 'farm.department') {
              departmentId = option.metadataId ?? null;
            } else if (question.systemField === 'farm.town') {
              departmentId =
                (option.metadataId &&
                  townToDepartment.get(option.metadataId)) ||
                null;
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
