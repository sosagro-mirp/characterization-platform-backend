import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { Question } from './entities/question.entity';

const TYPES_WITHOUT_OPTIONS = ['open_text', 'numeric', 'yes_no'];

const LIKERT_DEFAULT_OPTIONS = [
  { text: 'Totalmente de acuerdo', value: 5 },
  { text: 'De acuerdo', value: 4 },
  { text: 'Ni de acuerdo ni en desacuerdo', value: 3 },
  { text: 'En desacuerdo', value: 2 },
  { text: 'Totalmente en desacuerdo', value: 1 },
];

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(Section)
    private readonly sectionsRepository: Repository<Section>,
    @InjectRepository(TypeOfQuestion)
    private readonly typesOfQuestionsRepository: Repository<TypeOfQuestion>,
    @InjectRepository(OptionQuestion)
    private readonly optionsRepository: Repository<OptionQuestion>,
  ) {}

  private async seedLikertOptions(question: Question): Promise<void> {
    const options = this.optionsRepository.create(
      LIKERT_DEFAULT_OPTIONS.map((opt) => ({ ...opt, question })),
    );
    await this.optionsRepository.save(options);
  }

  async create(
    sectionId: string,
    createQuestionDto: CreateQuestionDto,
  ): Promise<Question> {
    const { typeId, conditionQuestionId, ...questionData } = createQuestionDto;

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

    let conditionQuestion: Question | undefined;

    if (conditionQuestionId) {
      const found = await this.questionsRepository.findOne({
        where: { questionId: conditionQuestionId },
      });

      if (!found) {
        throw new NotFoundException('Condition question not found');
      }

      conditionQuestion = found;
    }

    const question = this.questionsRepository.create({
      ...questionData,
      isSelectionCriteria: questionData.isSelectionCriteria ?? false,
      section,
      type,
      conditionQuestion,
    });

    const saved = await this.questionsRepository.save(question);

    if (type.name === 'likert') {
      await this.seedLikertOptions(saved);
    }

    return await this.questionsRepository.findOne({
      where: { questionId: saved.questionId },
      relations: ['type', 'options'],
    }) as Question;
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

  async update(
    sectionId: string,
    questionId: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
      relations: ['type', 'options', 'conditionQuestion'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const { typeId, conditionQuestionId, order, ...rest } = updateQuestionDto;

    if (typeId !== undefined && typeId !== question.type?.typeId) {
      const newType = await this.typesOfQuestionsRepository.findOne({
        where: { typeId },
      });
      if (!newType) {
        throw new NotFoundException('Type of question not found');
      }

      if (TYPES_WITHOUT_OPTIONS.includes(newType.name) && question.options?.length > 0) {
        await this.optionsRepository.delete({ question: { questionId } });
        question.options = [];
      }

      question.type = newType;
    }

    if (conditionQuestionId !== undefined) {
      if (conditionQuestionId === null) {
        question.conditionQuestion = undefined;
        question.conditionValue = undefined;
      } else {
        const conditionQ = await this.questionsRepository.findOne({
          where: { questionId: conditionQuestionId },
        });
        if (!conditionQ) {
          throw new NotFoundException('Condition question not found');
        }
        question.conditionQuestion = conditionQ;
      }
    }

    if (order !== undefined && order !== question.order) {
      const sibling = await this.questionsRepository.findOne({
        where: { section: { sectionId }, order },
      });
      if (sibling) {
        sibling.order = question.order;
        await this.questionsRepository.save(sibling);
      }
      question.order = order;
    }

    Object.assign(question, rest);
    const saved = await this.questionsRepository.save(question);

    if (
      typeId !== undefined &&
      question.type?.name === 'likert' &&
      (question.options?.length ?? 0) === 0
    ) {
      await this.seedLikertOptions(saved);
    }

    return await this.questionsRepository.findOne({
      where: { questionId: saved.questionId },
      relations: ['type', 'options'],
    }) as Question;
  }

  async remove(sectionId: string, questionId: string): Promise<void> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const removedOrder = question.order;
    await this.questionsRepository.remove(question);

    const remaining = await this.questionsRepository.find({
      where: { section: { sectionId }, order: Not(removedOrder) },
      order: { order: 'ASC' },
    });

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i + 1) {
        remaining[i].order = i + 1;
      }
    }
    await this.questionsRepository.save(remaining);
  }
}
