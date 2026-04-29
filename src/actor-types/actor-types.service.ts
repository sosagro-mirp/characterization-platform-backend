import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateActorTypeDto } from './dto/create-actor-type.dto';
import { UpdateActorTypeDto } from './dto/update-actor-type.dto';
import { ActorType } from './entities/actor-type.entity';

@Injectable()
export class ActorTypesService {
  constructor(
    @InjectRepository(ActorType)
    private readonly actorTypesRepository: Repository<ActorType>,
  ) {}

  async create(createActorTypeDto: CreateActorTypeDto): Promise<ActorType> {
    const actorType = this.actorTypesRepository.create(createActorTypeDto);

    return await this.actorTypesRepository.save(actorType);
  }

  async findAll(): Promise<ActorType[]> {
    return await this.actorTypesRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ActorType> {
    const actorType = await this.actorTypesRepository.findOne({
      where: { actorTypeId: id },
    });

    if (!actorType) {
      throw new NotFoundException('Actor type not found');
    }

    return actorType;
  }

  async update(
    id: string,
    updateActorTypeDto: UpdateActorTypeDto,
  ): Promise<ActorType> {
    const actorType = await this.findOne(id);

    Object.assign(actorType, updateActorTypeDto);

    return await this.actorTypesRepository.save(actorType);
  }

  async remove(id: string): Promise<void> {
    const actorType = await this.findOne(id);
    await this.actorTypesRepository.remove(actorType);
  }
}
