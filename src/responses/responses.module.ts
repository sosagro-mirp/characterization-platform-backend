import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from './entities/response.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Response])],
})
export class ResponsesModule {}
