import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Technology } from './entities/technology.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Technology])],
})
export class TechnologiesModule {}
