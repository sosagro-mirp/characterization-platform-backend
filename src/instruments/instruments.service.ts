import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { In, Repository } from 'typeorm';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { Instrument } from './entities/instrument.entity';

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
    @InjectRepository(ActorType)
    private readonly actorTypesRepository: Repository<ActorType>,
  ) {}

  async create(createInstrumentDto: CreateInstrumentDto): Promise<Instrument> {
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

    const instrument = this.instrumentsRepository.create({
      ...rest,
      actorTypes,
    });

    return await this.instrumentsRepository.save(instrument);
  }

  async findAll(): Promise<Instrument[]> {
    return await this.instrumentsRepository.find({
      relations: { actorTypes: true },
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

  async findOne(id: string): Promise<Instrument> {
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: id },
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    return instrument;
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

    return {
      instrumentId: instrument.instrumentId,
      name: instrument.name,
      version: instrument.version,
      publishDate: instrument.publishDate,
      isActive: instrument.isActive,
      sections: (instrument.sections ?? []).map((section) => ({
        sectionId: section.sectionId,
        name: section.name,
        order: section.order,
        questions: (section.questions ?? []).map((question) => ({
          questionId: question.questionId,
          text: question.text,
          isRequired: question.isRequired,
          order: question.order,
          type: question.type
            ? {
                typeId: question.type.typeId,
                name: question.type.name,
              }
            : null,
          options: (question.options ?? []).map((option) => ({
            optionId: option.optionId,
            text: option.text,
            value: option.value,
            isOther: option.isOther,
          })),
          conditionQuestionId: question.conditionQuestion?.questionId ?? null,
          conditionValue: question.conditionValue ?? null,
        })),
      })),
    };
  }
}
