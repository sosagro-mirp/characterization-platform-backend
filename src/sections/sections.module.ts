import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { SectionsController } from './sections.controller';
import { Section } from './entities/section.entity';
import { SectionsService } from './sections.service';

@Module({
  imports: [TypeOrmModule.forFeature([Section, Instrument, Response])],
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
