import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { CreateSectionDto } from './dto/create-section.dto';
import { Section } from './entities/section.entity';

@Injectable()
export class SectionsService {
  constructor(
    @InjectRepository(Section)
    private readonly sectionsRepository: Repository<Section>,
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
  ) {}

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
}
