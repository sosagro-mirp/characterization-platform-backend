import { Module } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { FarmsController } from './farms.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Farm } from './entities/farm.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

@Module({
  controllers: [FarmsController],
  providers: [FarmsService],
  imports: [TypeOrmModule.forFeature([Farm, TypeOfCrop])],
})
export class FarmsModule {}
