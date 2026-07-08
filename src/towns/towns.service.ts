import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { CreateTownDto } from './dto/create-town.dto';
import { UpdateTownDto } from './dto/update-town.dto';
import { Town } from './entities/town.entity';

@Injectable()
export class TownsService {
  constructor(
    @InjectRepository(Town)
    private readonly townsRepository: Repository<Town>,
    @InjectRepository(Department)
    private readonly departmentsRepository: Repository<Department>,
  ) {}

  async create(createTownDto: CreateTownDto): Promise<Town> {
    const { departmentId, ...townData } = createTownDto;

    const department = await this.departmentsRepository.findOne({
      where: { departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const town = this.townsRepository.create({
      ...townData,
      department,
    });

    return await this.townsRepository.save(town);
  }

  async findAll(): Promise<Town[]> {
    return await this.townsRepository.find({
      relations: { department: true },
      order: { name: 'ASC' },
    });
  }

  async findAllPublic(departmentId?: string): Promise<Town[]> {
    return await this.townsRepository.find({
      where: departmentId ? { department: { departmentId } } : undefined,
      relations: { department: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Town> {
    const town = await this.townsRepository.findOne({
      where: { townId: id },
      relations: { department: true },
    });

    if (!town) {
      throw new NotFoundException('Town not found');
    }

    return town;
  }

  async update(id: string, updateTownDto: UpdateTownDto): Promise<Town> {
    const town = await this.findOne(id);

    if (updateTownDto.departmentId) {
      const department = await this.departmentsRepository.findOne({
        where: { departmentId: updateTownDto.departmentId },
      });

      if (!department) {
        throw new NotFoundException('Department not found');
      }

      town.department = department;
    }

    Object.assign(town, {
      name: updateTownDto.name ?? town.name,
    });

    return await this.townsRepository.save(town);
  }

  async remove(id: string): Promise<void> {
    const town = await this.findOne(id);
    await this.townsRepository.remove(town);
  }
}
