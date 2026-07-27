import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignSession } from './entities/campaign-session.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { User } from 'src/users/entities/user.entity';
import { CampaignSessionsController } from './campaign-sessions.controller';
import { CampaignSessionsService } from './campaign-sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CampaignSession,
      Campaign,
      TypeOfCrop,
      Farmer,
      User,
    ]),
  ],
  controllers: [CampaignSessionsController],
  providers: [CampaignSessionsService],
  exports: [CampaignSessionsService],
})
export class CampaignSessionsModule {}
