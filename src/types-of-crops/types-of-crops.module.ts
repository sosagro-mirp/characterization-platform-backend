import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfCrop } from './entities/type-of-crop.entity';
import { TypesOfCropsService } from './types-of-crops.service';
import { TypesOfCropsController } from './types-of-crops.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfCrop])],
  controllers: [TypesOfCropsController],
  providers: [TypesOfCropsService],
  exports: [TypesOfCropsService],
})
export class TypesOfCropsModule {}
