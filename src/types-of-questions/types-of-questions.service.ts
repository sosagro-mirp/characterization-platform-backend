import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTypeOfQuestionDto } from './dto/create-type-of-question.dto';
import { UpdateTypeOfQuestionDto } from './dto/update-type-of-question.dto';
import { TypeOfQuestion } from './entities/type-of-question.entity';

@Injectable()
export class TypesOfQuestionsService {
  constructor(
    @InjectRepository(TypeOfQuestion)
    private readonly typesOfQuestionsRepository: Repository<TypeOfQuestion>,
  ) {}

  async create(
    createTypeOfQuestionDto: CreateTypeOfQuestionDto,
  ): Promise<TypeOfQuestion> {
    const type = this.typesOfQuestionsRepository.create(
      createTypeOfQuestionDto,
    );

    return await this.typesOfQuestionsRepository.save(type);
  }

  async findAll(): Promise<TypeOfQuestion[]> {
    return await this.typesOfQuestionsRepository.find();
  }

  async findOne(id: string): Promise<TypeOfQuestion> {
    const type = await this.typesOfQuestionsRepository.findOne({
      where: { typeId: id },
    });

    if (!type) {
      throw new NotFoundException('Type of question not found');
    }

    return type;
  }

  async update(
    id: string,
    updateTypeOfQuestionDto: UpdateTypeOfQuestionDto,
  ): Promise<TypeOfQuestion> {
    const type = await this.findOne(id);

    Object.assign(type, updateTypeOfQuestionDto);

    return await this.typesOfQuestionsRepository.save(type);
  }

  async remove(id: string): Promise<void> {
    const type = await this.findOne(id);
    await this.typesOfQuestionsRepository.remove(type);
  }
}
