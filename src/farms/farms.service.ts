import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { Farm } from './entities/farm.entity';

const FARM_RELATIONS = ['crops'];

@Injectable()
export class FarmsService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  async create(dto: CreateFarmDto): Promise<Farm> {
    const {
      cropIds,
      deviceIds: _deviceIds,
      townId,
      hasStabilityElectricity,
      ...scalar
    } = dto;

    const farm = this.farmsRepository.create({
      ...scalar,
      hasElectricityAccess: hasStabilityElectricity,
      town: townId ? { townId } : undefined,
    });

    if (cropIds?.length) {
      farm.crops = await this.cropsRepository.findBy({ cropId: In(cropIds) });
    }

    // DEBT: deviceIds se acepta en el DTO pero ni create() ni update() lo
    // persisten; falta inyectar el repo de Device y asociar farms_devices.
    const saved = await this.farmsRepository.save(farm);
    return this.findOne(saved.farmId);
  }

  findAll() {
    return this.farmsRepository.find({ relations: FARM_RELATIONS });
  }

  async findOne(id: string): Promise<Farm> {
    const farm = await this.farmsRepository.findOne({
      where: { farmId: id },
      relations: FARM_RELATIONS,
    });
    if (!farm) throw new NotFoundException('Farm not found');
    return farm;
  }

  async update(id: string, dto: UpdateFarmDto): Promise<Farm> {
    const farm = await this.findOne(id);

    const { cropIds, ...scalar } = dto;
    Object.assign(farm, scalar);

    if (cropIds !== undefined) {
      farm.crops = cropIds.length
        ? await this.cropsRepository.findBy({ cropId: In(cropIds) })
        : [];
    }

    await this.farmsRepository.save(farm);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const farm = await this.findOne(id);
    await this.farmsRepository.remove(farm);
  }
}
