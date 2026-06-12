import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Question } from 'src/questions/entities/question.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from './entities/campaign.entity';
import { CampaignStep } from './entities/campaign-step.entity';
import { StepCondition } from './entities/step-condition.entity';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignStepsController } from './steps/campaign-steps.controller';
import { CampaignStepsService } from './steps/campaign-steps.service';
import { StepConditionsController } from './steps/step-conditions.controller';
import { StepConditionsService } from './steps/step-conditions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Campaign,
      CampaignStep,
      StepCondition,
      CampaignSession,
      Instrument,
      Question,
      TypeOfCrop,
    ]),
  ],
  controllers: [CampaignsController, CampaignStepsController, StepConditionsController],
  providers: [CampaignsService, CampaignStepsService, StepConditionsService],
  exports: [CampaignsService, CampaignStepsService],
})
export class CampaignsModule {}
