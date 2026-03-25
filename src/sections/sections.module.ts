import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { SectionsController } from './sections.controller';
import { Section } from './entities/section.entity';
import { SectionsService } from './sections.service';

@Module({
  imports: [TypeOrmModule.forFeature([Section, Instrument])],
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
