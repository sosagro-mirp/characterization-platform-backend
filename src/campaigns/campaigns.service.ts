import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from './entities/campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    @InjectRepository(CampaignSession)
    private readonly sessionsRepository: Repository<CampaignSession>,
  ) {}

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignsRepository.create({
      name: dto.name,
      description: dto.description,
      isActive: dto.isActive ?? true,
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

  async update(campaignId: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(campaignId);
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.description !== undefined) campaign.description = dto.description;
    if (dto.isActive !== undefined) campaign.isActive = dto.isActive;
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
}
