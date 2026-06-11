import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignStep } from 'src/campaigns/entities/campaign-step.entity';
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
        'campaign.steps.conditionQuestion',
        'farmer',
        'user',
        'actorType',
        'department',
        'town',
        'crop',
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

    for (const step of steps) {
      if (completedOrders.has(step.order)) continue;

      // TODO(spec24-phase3): evaluate step.conditions[] with AND/OR logic

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
