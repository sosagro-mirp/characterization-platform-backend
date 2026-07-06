import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { User } from 'src/users/entities/user.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignStep } from './entities/campaign-step.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

export interface StepConditionRender {
  conditionId: string;
  order: number;
  logicalOperator: 'AND' | 'OR' | null;
  conditionType: 'question' | 'crop';
  conditionCrop: { cropId: string; name: string } | null;
  conditionQuestion: { questionId: string; text: string } | null;
  conditionValue: string | null;
}

export interface CampaignStepRender {
  stepId: string;
  order: number;
  instrument: { instrumentId: string; name: string; isActive: boolean };
  conditions: StepConditionRender[];
}

export interface CampaignRenderPayload {
  campaignId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  steps: CampaignStepRender[];
  availableCrops: { cropId: string; name: string }[];
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    @InjectRepository(CampaignSession)
    private readonly sessionsRepository: Repository<CampaignSession>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TypeOfCrop)
    private readonly cropsRepository: Repository<TypeOfCrop>,
  ) {}

  async create(dto: CreateCampaignDto, userId?: string): Promise<Campaign> {
    let user: User | undefined;
    if (userId) {
      user = await this.usersRepository.findOne({ where: { userId } }) ?? undefined;
    }

    const campaign = this.campaignsRepository.create({
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive ?? true,
      createdBy: user,
      updatedBy: user,
    });
    return this.campaignsRepository.save(campaign);
  }

  findAll(): Promise<Campaign[]> {
    return this.campaignsRepository.find({ order: { name: 'ASC' } });
  }

  findActive(): Promise<Campaign[]> {
    return this.campaignsRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(campaignId: string): Promise<Campaign> {
    const campaign = await this.campaignsRepository.findOne({
      where: { campaignId },
      relations: [
        'steps',
        'steps.instrument',
        'steps.conditions',
        'steps.conditions.conditionQuestion',
        'steps.conditions.conditionCrop',
      ],
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    campaign.steps = (campaign.steps ?? []).sort((a, b) => a.order - b.order);
    return campaign;
  }

  async update(campaignId: string, dto: UpdateCampaignDto, userId?: string): Promise<Campaign> {
    const campaign = await this.findOne(campaignId);
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.description !== undefined) campaign.description = dto.description;
    if (dto.isActive !== undefined) campaign.isActive = dto.isActive;

    if (userId) {
      const user = await this.usersRepository.findOne({ where: { userId } });
      if (user) campaign.updatedBy = user;
    }

    await this.campaignsRepository.save(campaign);
    return this.findOne(campaignId);
  }

  async getSessionsSummary(campaignId: string): Promise<{ sessionCount: number }> {
    await this.findOne(campaignId);
    const sessionCount = await this.sessionsRepository.count({
      where: { campaign: { campaignId } },
    });
    return { sessionCount };
  }

  async remove(campaignId: string): Promise<void> {
    const campaign = await this.findOne(campaignId);
    await this.campaignsRepository.remove(campaign);
  }

  async findOneForRender(campaignId: string): Promise<CampaignRenderPayload> {
    const [campaign, allCrops] = await Promise.all([
      this.campaignsRepository.findOne({
        where: { campaignId },
        relations: [
          'steps',
          'steps.instrument',
          'steps.conditions',
          'steps.conditions.conditionQuestion',
          'steps.conditions.conditionCrop',
        ],
      }),
      this.cropsRepository.find({ order: { name: 'ASC' } }),
    ]);

    if (!campaign) throw new NotFoundException('Campaign not found');

    const sortedSteps = (campaign.steps ?? []).sort((a, b) => a.order - b.order);

    return {
      campaignId: campaign.campaignId,
      name: campaign.name,
      description: campaign.description ?? null,
      isActive: campaign.isActive,
      steps: sortedSteps.map((step) => this.mapStepToRender(step)),
      availableCrops: allCrops.map((c) => ({ cropId: c.cropId, name: c.name })),
    };
  }

  private mapStepToRender(step: CampaignStep): CampaignStepRender {
    const sortedConditions = (step.conditions ?? []).sort((a, b) => a.order - b.order);
    return {
      stepId: step.stepId,
      order: step.order,
      instrument: {
        instrumentId: step.instrument.instrumentId,
        name: step.instrument.name,
        isActive: step.instrument.isActive,
      },
      conditions: sortedConditions.map((c) => ({
        conditionId: c.conditionId,
        order: c.order,
        logicalOperator: c.logicalOperator ?? null,
        conditionType: c.conditionType,
        conditionCrop: c.conditionCrop
          ? { cropId: c.conditionCrop.cropId, name: c.conditionCrop.name }
          : null,
        conditionQuestion: c.conditionQuestion
          ? { questionId: c.conditionQuestion.questionId, text: c.conditionQuestion.text }
          : null,
        conditionValue: c.conditionValue ?? null,
      })),
    };
  }
}
