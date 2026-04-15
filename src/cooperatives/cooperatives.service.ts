import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from 'src/departments/entities/department.entity';
import { CreateCooperativeDto } from './dto/create-cooperative.dto';
import { UpdateCooperativeDto } from './dto/update-cooperative.dto';
import { Cooperative } from './entities/cooperative.entity';

@Injectable()
export class CooperativesService {
  constructor(
    @InjectRepository(Cooperative)
    private readonly cooperativesRepository: Repository<Cooperative>,
    @InjectRepository(Department)
    private readonly departmentsRepository: Repository<Department>,
  ) {}

  async create(
    createCooperativeDto: CreateCooperativeDto,
  ): Promise<Cooperative> {
    const { departmentId, ...cooperativeData } = createCooperativeDto;

    const department = await this.departmentsRepository.findOne({
      where: { departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const cooperative = this.cooperativesRepository.create({
      ...cooperativeData,
      department,
    });

    return await this.cooperativesRepository.save(cooperative);
  }

  async findAll(): Promise<Cooperative[]> {
    return await this.cooperativesRepository.find({
      relations: { department: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Cooperative> {
    const cooperative = await this.cooperativesRepository.findOne({
      where: { cooperativeId: id },
      relations: { department: true },
    });

    if (!cooperative) {
      throw new NotFoundException('Cooperative not found');
    }

    return cooperative;
  }

  async update(
    id: string,
    updateCooperativeDto: UpdateCooperativeDto,
  ): Promise<Cooperative> {
    const cooperative = await this.findOne(id);

    if (updateCooperativeDto.departmentId) {
      const department = await this.departmentsRepository.findOne({
        where: { departmentId: updateCooperativeDto.departmentId },
      });

      if (!department) {
        throw new NotFoundException('Department not found');
      }

      cooperative.department = department;
    }

    Object.assign(cooperative, {
      name: updateCooperativeDto.name ?? cooperative.name,
    });

    return await this.cooperativesRepository.save(cooperative);
  }

  async remove(id: string): Promise<void> {
    const cooperative = await this.findOne(id);
    await this.cooperativesRepository.remove(cooperative);
  }
}
