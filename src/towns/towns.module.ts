import { Module } from '@nestjs/common';
import { TownsService } from './towns.service';
import { TownsController } from './towns.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Town } from './entities/town.entity';
import { Department } from 'src/departments/entities/department.entity';

@Module({
  controllers: [TownsController],
  providers: [TownsService],
  imports: [TypeOrmModule.forFeature([Town, Department])],
})
export class TownsModule {}
