import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignStep } from './entities/campaign-step.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignStep])],
})
export class CampaignsModule {}
