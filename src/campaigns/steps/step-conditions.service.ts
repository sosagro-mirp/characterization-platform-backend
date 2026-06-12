import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignStep } from '../entities/campaign-step.entity';
import { StepCondition } from '../entities/step-condition.entity';
import { Question } from 'src/questions/entities/question.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { CreateStepConditionDto } from './dto/create-step-condition.dto';
import { UpdateStepConditionDto } from './dto/update-step-condition.dto';

@Injectable()
export class StepConditionsService {
  constructor(
    @InjectRepository(CampaignStep)
    private readonly stepsRepository: Repository<CampaignStep>,
    @InjectRepository(StepCondition)
    private readonly conditionsRepository: Repository<StepCondition>,
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  private async loadStep(campaignId: string, stepId: string): Promise<CampaignStep> {
    const step = await this.stepsRepository.findOne({
      where: { stepId, campaign: { campaignId } },
    });
    if (!step) throw new NotFoundException('Step not found');
    return step;
  }

  private validateInvariants(
    dto: CreateStepConditionDto | UpdateStepConditionDto,
    order?: number,
  ): void {
    const effectiveOrder = (dto as CreateStepConditionDto).order ?? order;
    if (effectiveOrder === 1 && (dto as CreateStepConditionDto).logicalOperator !== undefined) {
      const op = (dto as CreateStepConditionDto).logicalOperator;
      if (op !== undefined && op !== null) {
        throw new BadRequestException('La primera condición no puede tener logicalOperator');
      }
    }
    if (effectiveOrder !== undefined && effectiveOrder > 1 && !dto.logicalOperator) {
      throw new BadRequestException('Las condiciones con order > 1 requieren logicalOperator');
    }

    const type = (dto as CreateStepConditionDto).conditionType;
    if (type === 'question' && !(dto as CreateStepConditionDto).conditionQuestionId) {
      throw new BadRequestException('conditionQuestionId es requerido para conditionType = question');
    }
    if (type === 'crop' && !(dto as CreateStepConditionDto).conditionCropId) {
      throw new BadRequestException('conditionCropId es requerido para conditionType = crop');
    }
    if (type === 'crop' && (dto as CreateStepConditionDto).conditionQuestionId) {
      throw new BadRequestException('conditionQuestionId debe ser nulo para conditionType = crop');
    }
  }

  async findAll(campaignId: string, stepId: string): Promise<StepCondition[]> {
    await this.loadStep(campaignId, stepId);
    return this.conditionsRepository.find({
      where: { step: { stepId } },
      relations: ['conditionQuestion', 'conditionCrop'],
      order: { order: 'ASC' },
    });
  }

  async create(
    campaignId: string,
    stepId: string,
    dto: CreateStepConditionDto,
  ): Promise<StepCondition> {
    const step = await this.loadStep(campaignId, stepId);
    this.validateInvariants(dto);

    let conditionQuestion: Question | undefined;
    if (dto.conditionQuestionId) {
      const q = await this.questionsRepository.findOne({
        where: { questionId: dto.conditionQuestionId },
      });
      if (!q) throw new NotFoundException('Question not found');
      conditionQuestion = q;
    }

    let conditionCrop: TypeOfCrop | undefined;
    if (dto.conditionCropId) {
      const c = await this.cropsRepository.findOne({
        where: { cropId: dto.conditionCropId },
      });
      if (!c) throw new NotFoundException('TypeOfCrop not found');
      conditionCrop = c;
    }

    const condition = this.conditionsRepository.create({
      step,
      order: dto.order,
      logicalOperator: dto.logicalOperator ?? null,
      conditionType: dto.conditionType,
      conditionQuestion,
      conditionValue: dto.conditionValue,
      conditionCrop,
    });

    return this.conditionsRepository.save(condition);
  }

  async update(
    campaignId: string,
    stepId: string,
    conditionId: string,
    dto: UpdateStepConditionDto,
  ): Promise<StepCondition> {
    await this.loadStep(campaignId, stepId);
    const condition = await this.conditionsRepository.findOne({
      where: { conditionId, step: { stepId } },
      relations: ['conditionQuestion', 'conditionCrop'],
    });
    if (!condition) throw new NotFoundException('Condition not found');

    if (dto.order !== undefined) condition.order = dto.order;
    if (dto.logicalOperator !== undefined) condition.logicalOperator = dto.logicalOperator;
    if (dto.conditionType !== undefined) condition.conditionType = dto.conditionType;
    if (dto.conditionValue !== undefined) condition.conditionValue = dto.conditionValue;

    if (dto.conditionQuestionId !== undefined) {
      if (dto.conditionQuestionId === null) {
        condition.conditionQuestion = undefined;
      } else {
        const q = await this.questionsRepository.findOne({
          where: { questionId: dto.conditionQuestionId },
        });
        if (!q) throw new NotFoundException('Question not found');
        condition.conditionQuestion = q;
      }
    }

    if (dto.conditionCropId !== undefined) {
      if (dto.conditionCropId === null) {
        condition.conditionCrop = undefined;
      } else {
        const c = await this.cropsRepository.findOne({
          where: { cropId: dto.conditionCropId },
        });
        if (!c) throw new NotFoundException('TypeOfCrop not found');
        condition.conditionCrop = c;
      }
    }

    return this.conditionsRepository.save(condition);
  }

  async remove(
    campaignId: string,
    stepId: string,
    conditionId: string,
  ): Promise<void> {
    await this.loadStep(campaignId, stepId);
    const condition = await this.conditionsRepository.findOne({
      where: { conditionId, step: { stepId } },
    });
    if (!condition) throw new NotFoundException('Condition not found');

    await this.conditionsRepository.remove(condition);

    // Reorder remaining and clear logicalOperator of new first condition
    const remaining = await this.conditionsRepository.find({
      where: { step: { stepId } },
      order: { order: 'ASC' },
    });

    for (let i = 0; i < remaining.length; i++) {
      remaining[i].order = i + 1;
      if (i === 0) remaining[i].logicalOperator = null;
    }

    if (remaining.length > 0) await this.conditionsRepository.save(remaining);
  }
}
