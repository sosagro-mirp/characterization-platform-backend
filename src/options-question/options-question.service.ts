import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { CreateOptionQuestionDto } from './dto/create-option-question.dto';
import { UpdateOptionQuestionDto } from './dto/update-option-question.dto';
import { OptionQuestion } from './entities/option-question.entity';

@Injectable()
export class OptionsQuestionService {
  constructor(
    @InjectRepository(OptionQuestion)
    private readonly optionsQuestionRepository: Repository<OptionQuestion>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
  ) {}

  async create(
    questionId: string,
    createOptionQuestionDto: CreateOptionQuestionDto,
  ): Promise<OptionQuestion> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const option = this.optionsQuestionRepository.create({
      ...createOptionQuestionDto,
      question,
    });

    return await this.optionsQuestionRepository.save(option);
  }

  async createMany(
    questionId: string,
    createOptionQuestionDtos: CreateOptionQuestionDto[],
  ): Promise<OptionQuestion[]> {
    if (createOptionQuestionDtos.length === 0) {
      throw new BadRequestException('At least one option must be provided');
    }

    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const options = this.optionsQuestionRepository.create(
      createOptionQuestionDtos.map((dto) => ({
        ...dto,
        question,
      })),
    );

    return await this.optionsQuestionRepository.save(options);
  }

  async findAll(questionId: string): Promise<OptionQuestion[]> {
    await this.ensureQuestionExists(questionId);

    return await this.optionsQuestionRepository.find({
      where: { question: { questionId } },
      order: { createdAt: 'ASC' },
      relations: { question: true },
    });
  }

  async findOne(questionId: string, optionId: string): Promise<OptionQuestion> {
    await this.ensureQuestionExists(questionId);

    const option = await this.optionsQuestionRepository.findOne({
      where: {
        optionId,
        question: { questionId },
      },
      relations: { question: true },
    });

    if (!option) {
      throw new NotFoundException('Option not found');
    }

    return option;
  }

  async update(
    questionId: string,
    optionId: string,
    updateOptionQuestionDto: UpdateOptionQuestionDto,
  ): Promise<OptionQuestion> {
    const option = await this.findOne(questionId, optionId);

    Object.assign(option, updateOptionQuestionDto);

    return await this.optionsQuestionRepository.save(option);
  }

  async remove(questionId: string, optionId: string): Promise<void> {
    const option = await this.findOne(questionId, optionId);
    await this.optionsQuestionRepository.remove(option);
  }

  private async ensureQuestionExists(questionId: string): Promise<void> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }
  }
}
