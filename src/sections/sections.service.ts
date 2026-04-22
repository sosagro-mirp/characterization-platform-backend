import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
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

    if (updateSectionDto.order !== undefined && updateSectionDto.order !== section.order) {
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
