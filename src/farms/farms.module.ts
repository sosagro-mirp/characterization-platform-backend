import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from './entities/farm.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { FarmCrop } from './entities/farm-crop.entity';
import { FarmerFarm } from 'src/farmer-farms/entities/farmer-farm.entity';

@Module({
  controllers: [FarmsController],
  providers: [FarmsService],
  imports: [TypeOrmModule.forFeature([Farm, TypeOfCrop, FarmCrop, FarmerFarm])],
})
export class FarmsModule {}
