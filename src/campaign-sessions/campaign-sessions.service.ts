import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignStep } from 'src/campaigns/entities/campaign-step.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { CampaignSession } from './entities/campaign-session.entity';
import { Response } from 'src/responses/entities/response.entity';
import { CreateCampaignSessionDto } from './dto/create-campaign-session.dto';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

interface NextStepInstrument {
  instrumentId: string;
  name: string;
  isActive: boolean;
}

export interface NextStepResult {
  stepId: string;
  order: number;
  instrument: NextStepInstrument;
  totalSteps: number;
  completedCount: number;
}

@Injectable()
export class CampaignSessionsService {
  constructor(
    @InjectRepository(CampaignSession)
    private readonly sessionsRepository: Repository<CampaignSession>,
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  async getLastFarmer(userId: string): Promise<{
    farmerId: string;
    name: string;
    lastName: string | null;
    farm?: { name: string };
  } | null> {
    const session = await this.sessionsRepository.findOne({
      where: { user: { userId } },
      relations: ['farmer', 'farmer.farm'],
      order: { createdAt: 'DESC' },
    });

    if (!session?.farmer) return null;

    return {
      farmerId: session.farmer.id,
      name: session.farmer.name,
      lastName: session.farmer.lastName,
      farm: session.farmer.farm ? { name: session.farmer.farm.name } : undefined,
    };
  }

  async create(dto: CreateCampaignSessionDto): Promise<CampaignSession> {
    const campaign = await this.campaignsRepository.findOne({
      where: { campaignId: dto.campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const session = this.sessionsRepository.create({
      campaign,
      farmer: dto.farmerId ? ({ id: dto.farmerId } as any) : undefined,
      user: dto.userId ? ({ userId: dto.userId } as any) : undefined,
      actorType: dto.actorTypeId
        ? ({ actorTypeId: dto.actorTypeId } as any)
        : undefined,
      department: dto.departmentId
        ? ({ departmentId: dto.departmentId } as any)
        : undefined,
      town: dto.townId ? ({ townId: dto.townId } as any) : undefined,
      vereda: dto.vereda,
      crop: dto.cropId ? ({ cropId: dto.cropId } as any) : undefined,
    });

    if (dto.cropIds?.length) {
      session.crops = await this.cropsRepository.findBy({
        cropId: In(dto.cropIds),
      });
    }

    const saved = await this.sessionsRepository.save(session);
    return this.findOne(saved.sessionId);
  }

  async findOne(sessionId: string): Promise<CampaignSession> {
    const session = await this.sessionsRepository.findOne({
      where: { sessionId },
      relations: [
        'campaign',
        'campaign.steps',
        'campaign.steps.instrument',
        'campaign.steps.conditions',
        'campaign.steps.conditions.conditionQuestion',
        'campaign.steps.conditions.conditionCrop',
        'farmer',
        'user',
        'actorType',
        'department',
        'town',
        'crop',
        'crops',
        'surveys',
        'surveys.responses',
        'surveys.responses.question',
        'surveys.responses.option',
      ],
    });
    if (!session) throw new NotFoundException('Campaign session not found');
    session.campaign.steps = (session.campaign.steps ?? []).sort(
      (a, b) => a.order - b.order,
    );
    return session;
  }

  async markAsSynchronized(sessionId: string): Promise<CampaignSession> {
    const session = await this.findOne(sessionId);
    session.sincronized = true;
    await this.sessionsRepository.save(session);
    return this.findOne(sessionId);
  }

  private evalCondition(
    condition: StepCondition,
    allResponses: Response[],
    sessionCrops: TypeOfCrop[],
  ): boolean {
    if (condition.conditionType === 'crop') {
      const cropId = condition.conditionCrop?.cropId;
      return cropId ? sessionCrops.some((c) => c.cropId === cropId) : false;
    }

    // conditionType === 'question'
    const questionId = condition.conditionQuestion?.questionId;
    if (!questionId) return false;

    const matches = allResponses.filter(
      (r) => r.question?.questionId === questionId,
    );
    if (matches.length === 0) return false;

    const expected = condition.conditionValue;
    if (expected === undefined || expected === null) return false;

    return matches.some((r) => {
      if (r.option?.optionId === expected) return true;
      if (r.textValue !== null && r.textValue !== undefined && r.textValue === expected) return true;
      if (r.numericValue !== null && r.numericValue !== undefined && String(r.numericValue) === expected) return true;
      if (r.booleanValue !== null && r.booleanValue !== undefined) {
        if (expected === 'true' && r.booleanValue === true) return true;
        if (expected === 'false' && r.booleanValue === false) return true;
      }
      return false;
    });
  }

  private stepPassesConditions(
    step: CampaignStep,
    allResponses: Response[],
    sessionCrops: TypeOfCrop[],
  ): boolean {
    const conditions = (step.conditions ?? []).sort((a, b) => a.order - b.order);
    if (conditions.length === 0) return true;

    let result = this.evalCondition(conditions[0], allResponses, sessionCrops);

    for (let i = 1; i < conditions.length; i++) {
      const cond = conditions[i];
      const val = this.evalCondition(cond, allResponses, sessionCrops);
      if (cond.logicalOperator === 'OR') {
        result = result || val;
      } else {
        result = result && val;
      }
    }

    return result;
  }

  async getNextStep(sessionId: string): Promise<NextStepResult | null> {
    const session = await this.findOne(sessionId);
    const steps = session.campaign.steps ?? [];
    const totalSteps = steps.length;

    const completedOrders = new Set(
      (session.surveys ?? [])
        .filter((s) => typeof s.stepOrder === 'number')
        .map((s) => s.stepOrder as number),
    );
    const completedCount = completedOrders.size;

    const allResponses: Response[] = (session.surveys ?? []).flatMap(
      (s) => s.responses ?? [],
    );
    const sessionCrops: TypeOfCrop[] = session.crops ?? [];

    for (const step of steps) {
      if (completedOrders.has(step.order)) continue;
      if (!this.stepPassesConditions(step, allResponses, sessionCrops)) continue;

      return {
        stepId: step.stepId,
        order: step.order,
        instrument: {
          instrumentId: step.instrument.instrumentId,
          name: step.instrument.name,
          isActive: step.instrument.isActive,
        },
        totalSteps,
        completedCount,
      };
    }

    return null;
  }
}
