import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignSession } from './entities/campaign-session.entity';
import { CampaignSessionsController } from './campaign-sessions.controller';
import { CampaignSessionsService } from './campaign-sessions.service';

@Module({
  imports: [TypeOrmModule.forFeature([CampaignSession, Campaign])],
  controllers: [CampaignSessionsController],
  providers: [CampaignSessionsService],
  exports: [CampaignSessionsService],
})
export class CampaignSessionsModule {}
