import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignSession } from './entities/campaign-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CampaignSession])],
})
export class CampaignSessionsModule {}
