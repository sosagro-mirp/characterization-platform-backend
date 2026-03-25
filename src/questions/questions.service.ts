import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { Question } from './entities/question.entity';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(Section)
    private readonly sectionsRepository: Repository<Section>,
    @InjectRepository(TypeOfQuestion)
    private readonly typesOfQuestionsRepository: Repository<TypeOfQuestion>,
  ) {}

  async create(
    sectionId: string,
    createQuestionDto: CreateQuestionDto,
  ): Promise<Question> {
    const { typeId, ...questionData } = createQuestionDto;

    const section = await this.sectionsRepository.findOne({
      where: { sectionId },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const type = await this.typesOfQuestionsRepository.findOne({
      where: { typeId },
    });

    if (!type) {
      throw new NotFoundException('Type of question not found');
    }

    const question = this.questionsRepository.create({
      ...questionData,
      section,
      type,
    });

    return await this.questionsRepository.save(question);
  }

  async findOne(questionId: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
      relations: ['type', 'options'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }
}
