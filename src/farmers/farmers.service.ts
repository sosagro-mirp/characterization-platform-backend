import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Farmer } from './entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';

const FARMER_RELATIONS = ['farm', 'farm.town', 'farm.crops'];

@Injectable()
export class FarmersService {
  constructor(
    @InjectRepository(Farmer)
    private readonly farmersRepository: Repository<Farmer>,
    @InjectRepository(Farm)
    private readonly farmsRepository: Repository<Farm>,
    @InjectRepository(Town)
    private readonly townsRepository: Repository<Town>,
  ) {}

  async create(dto: CreateFarmerDto): Promise<Farmer> {
    let town: Town | undefined;
    if (dto.townId) {
      const found = await this.townsRepository.findOne({
        where: { townId: dto.townId },
      });
      if (!found) throw new NotFoundException('Town not found');
      town = found;
    }

    let farm: Farm | undefined;
    if (dto.farmName) {
      farm = await this.farmsRepository.save(
        this.farmsRepository.create({
          name: dto.farmName,
          town,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          altitude: dto.altitude ?? null,
        }),
      );
    }

    const farmer = await this.farmersRepository.save(
      this.farmersRepository.create({
        name: dto.name,
        documentId: dto.documentId,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
        educationLevel: dto.educationLevel ?? null,
        experienceYears: dto.experienceYears ?? null,
        familySize: dto.familySize ?? null,
        isMainIncome: dto.isMainIncome ?? null,
        participationInTraining: dto.participationInTraining ?? null,
        farm,
      }),
    );

    return this.findOne(farmer.id);
  }

  async search(query: string) {
    return this.farmersRepository.find({
      select: {
        id: true,
        name: true,
        documentId: true,
        phone: true,
        farm: { farmId: true, name: true, town: { townId: true, name: true } },
      },
      relations: ['farm', 'farm.town'],
      where: [
        { name: ILike(`%${query}%`) },
        { documentId: ILike(`%${query}%`) },
      ],
      take: 10,
    });
  }

  async findAll(): Promise<Farmer[]> {
    return this.farmersRepository.find({ relations: FARMER_RELATIONS, take: 500 });
  }

  async findOne(id: string): Promise<Farmer> {
    const farmer = await this.farmersRepository.findOne({
      where: { id },
      relations: [...FARMER_RELATIONS, 'cooperative'],
    });
    if (!farmer) throw new NotFoundException('Farmer not found');
    return farmer;
  }

  async update(id: string, dto: UpdateFarmerDto): Promise<Farmer> {
    const farmer = await this.findOne(id);
    Object.assign(farmer, dto);
    await this.farmersRepository.save(farmer);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const farmer = await this.findOne(id);
    await this.farmersRepository.remove(farmer);
  }
}
