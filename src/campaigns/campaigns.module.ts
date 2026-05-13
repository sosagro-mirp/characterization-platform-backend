import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignStep } from './entities/campaign-step.entity';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignStepsController } from './steps/campaign-steps.controller';
import { CampaignStepsService } from './steps/campaign-steps.service';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignStep, Instrument, Question])],
  controllers: [CampaignsController, CampaignStepsController],
  providers: [CampaignsService, CampaignStepsService],
  exports: [CampaignsService, CampaignStepsService],
})
export class CampaignsModule {}
