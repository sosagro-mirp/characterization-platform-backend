import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Obstacle } from './entities/obstacle.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Obstacle])],
})
export class ObstaclesModule {}
