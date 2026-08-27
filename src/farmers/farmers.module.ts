import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farmer } from './entities/farmer.entity';
import { FarmerDocumentCollision } from './entities/farmer-document-collision.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Town } from 'src/towns/entities/town.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { FarmersService } from './farmers.service';
import { FarmersController } from './farmers.controller';
import { ConsentsModule } from '../consents/consents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Farmer,
      FarmerDocumentCollision,
      Farm,
      Town,
      CampaignSession,
      Survey,
    ]),
    ConsentsModule,
  ],
  controllers: [FarmersController],
  providers: [FarmersService],
  exports: [FarmersService],
})
export class FarmersModule {}
