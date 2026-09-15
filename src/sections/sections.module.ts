import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Response } from 'src/responses/entities/response.entity';
import { SectionsController } from './sections.controller';
import { Question } from 'src/questions/entities/question.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { Section } from './entities/section.entity';
import { SectionsService } from './sections.service';

@Module({
  imports: [
    // Spec 84 — `remove` consulta preguntas y condiciones de paso
    // directamente para detectar dependientes externos a la sección.
    TypeOrmModule.forFeature([
      Section,
      Instrument,
      Response,
      Question,
      StepCondition,
    ]),
  ],
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
