import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStep } from '../entities/campaign-step.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { CreateCampaignStepDto } from './dto/create-campaign-step.dto';
import { UpdateCampaignStepDto } from './dto/update-campaign-step.dto';

@Injectable()
export class CampaignStepsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignsRepository: Repository<Campaign>,
    @InjectRepository(CampaignStep)
    private readonly stepsRepository: Repository<CampaignStep>,
    @InjectRepository(Instrument)
    private readonly instrumentsRepository: Repository<Instrument>,
  ) {}

  private async loadCampaign(campaignId: string): Promise<Campaign> {
    const campaign = await this.campaignsRepository.findOne({
      where: { campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async findAll(campaignId: string): Promise<CampaignStep[]> {
    await this.loadCampaign(campaignId);
    return this.stepsRepository.find({
      where: { campaign: { campaignId } },
      relations: ['instrument'],
      order: { order: 'ASC' },
    });
  }

  async create(
    campaignId: string,
    dto: CreateCampaignStepDto,
  ): Promise<CampaignStep> {
    const campaign = await this.loadCampaign(campaignId);
    const instrument = await this.instrumentsRepository.findOne({
      where: { instrumentId: dto.instrumentId },
    });
    if (!instrument) throw new NotFoundException('Instrument not found');

    // Si el `order` ya está ocupado, desplazo el existente al final.
    const clash = await this.stepsRepository.findOne({
      where: { campaign: { campaignId }, order: dto.order },
    });
    if (clash) {
      const max = await this.stepsRepository
        .createQueryBuilder('s')
        .where('s.campaign_id = :id', { id: campaignId })
        .select('MAX(s.order)', 'max')
        .getRawOne<{ max: number | null }>();
      clash.order = (max?.max ?? 0) + 1;
      await this.stepsRepository.save(clash);
    }

    const step = this.stepsRepository.create({
      campaign,
      instrument,
      order: dto.order,
    });
    const saved = await this.stepsRepository.save(step);
    return this.findOne(campaignId, saved.stepId);
  }

  async findOne(campaignId: string, stepId: string): Promise<CampaignStep> {
    const step = await this.stepsRepository.findOne({
      where: { stepId, campaign: { campaignId } },
      relations: [
        'instrument',
        'conditions',
        'conditions.conditionQuestion',
        'conditions.conditionCrop',
      ],
    });
    if (!step) throw new NotFoundException('Step not found');
    return step;
  }

  async update(
    campaignId: string,
    stepId: string,
    dto: UpdateCampaignStepDto,
  ): Promise<CampaignStep> {
    const step = await this.findOne(campaignId, stepId);

    if (dto.instrumentId !== undefined) {
      const instrument = await this.instrumentsRepository.findOne({
        where: { instrumentId: dto.instrumentId },
      });
      if (!instrument) throw new NotFoundException('Instrument not found');
      step.instrument = instrument;
    }

    if (dto.order !== undefined && dto.order !== step.order) {
      const sibling = await this.stepsRepository.findOne({
        where: { campaign: { campaignId }, order: dto.order, stepId: Not(stepId) },
      });
      if (sibling) {
        sibling.order = step.order;
        await this.stepsRepository.save(sibling);
      }
      step.order = dto.order;
    }

    await this.stepsRepository.save(step);
    return this.findOne(campaignId, stepId);
  }

  async remove(campaignId: string, stepId: string): Promise<void> {
    const step = await this.findOne(campaignId, stepId);
    const removedOrder = step.order;
    await this.stepsRepository.remove(step);

    const remaining = await this.stepsRepository.find({
      where: { campaign: { campaignId } },
      order: { order: 'ASC' },
    });
    for (let i = 0; i < remaining.length; i++) {
      const expected = i + 1;
      if (remaining[i].order !== expected) {
        remaining[i].order = expected;
      }
    }
    if (remaining.length > 0) await this.stepsRepository.save(remaining);
    // removedOrder es informativo; los huecos se compactan arriba.
    void removedOrder;
  }
}
