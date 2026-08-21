import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Farm } from 'src/farms/entities/farm.entity';
import { FarmPlot } from './entities/farm-plot.entity';
import { CreateFarmPlotDto } from './dto/create-farm-plot.dto';
import { UpdateFarmPlotDto } from './dto/update-farm-plot.dto';

@Injectable()
export class FarmPlotsService {
  constructor(
    @InjectRepository(FarmPlot)
    private readonly farmPlotsRepository: Repository<FarmPlot>,
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
  ) {}

  async create(dto: CreateFarmPlotDto): Promise<FarmPlot> {
    const farm = await this.farmsRepository.findOne({ where: { farmId: dto.farmId } });
    if (!farm) throw new NotFoundException('Farm not found');

    const plot = this.farmPlotsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      area: dto.area ?? null,
      capturedOffline: dto.capturedOffline ?? false,
      polygon: dto.polygon ?? null,
      farm,
    });

    return this.farmPlotsRepository.save(plot);
  }

  async findByFarm(farmId: string): Promise<FarmPlot[]> {
    const farm = await this.farmsRepository.findOne({ where: { farmId } });
    if (!farm) throw new NotFoundException('Farm not found');

    return this.farmPlotsRepository.find({
      where: { farm: { farmId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(farmPlotId: string): Promise<FarmPlot> {
    const plot = await this.farmPlotsRepository.findOne({
      where: { farmPlotId },
      relations: ['farm'],
    });
    if (!plot) throw new NotFoundException('FarmPlot not found');
    return plot;
  }

  async update(farmPlotId: string, dto: UpdateFarmPlotDto): Promise<FarmPlot> {
    const plot = await this.findOne(farmPlotId);

    if (dto.farmId && dto.farmId !== plot.farm.farmId) {
      const farm = await this.farmsRepository.findOne({ where: { farmId: dto.farmId } });
      if (!farm) throw new NotFoundException('Farm not found');
      plot.farm = farm;
    }

    if (dto.name !== undefined) plot.name = dto.name;
    if (dto.description !== undefined) plot.description = dto.description ?? null;
    if (dto.area !== undefined) plot.area = dto.area ?? null;
    if (dto.capturedOffline !== undefined) plot.capturedOffline = dto.capturedOffline;
    if (dto.polygon !== undefined) plot.polygon = dto.polygon ?? null;

    return this.farmPlotsRepository.save(plot);
  }

  async remove(farmPlotId: string): Promise<void> {
    const plot = await this.findOne(farmPlotId);
    await this.farmPlotsRepository.remove(plot);
  }
}
