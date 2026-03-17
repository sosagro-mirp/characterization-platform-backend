import { Module } from '@nestjs/common';
import { TownsService } from './towns.service';
import { TownsController } from './towns.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Town } from './entities/town.entity';

@Module({
  controllers: [TownsController],
  providers: [TownsService],
  imports: [TypeOrmModule.forFeature([Town])],
})
export class TownsModule {}
