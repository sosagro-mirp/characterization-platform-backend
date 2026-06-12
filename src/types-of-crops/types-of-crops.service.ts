import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOfCrop } from './entities/type-of-crop.entity';

@Injectable()
export class TypesOfCropsService {
  constructor(
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  findAll(): Promise<TypeOfCrop[]> {
    return this.cropsRepository.find();
  }
}
