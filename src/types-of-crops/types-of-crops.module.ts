import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOfCrop } from './entities/type-of-crop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TypeOfCrop])],
})
export class TypesOfCropsModule {}
