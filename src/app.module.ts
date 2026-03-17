import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmersModule } from './farmers/farmers.module';
import { FarmsModule } from './farms/farms.module';
import { CooperativesModule } from './cooperatives/cooperatives.module';
import { TownsModule } from './towns/towns.module';
import { DepartmentsModule } from './departments/departments.module';
import { TypesOfCropsModule } from './types-of-crops/types-of-crops.module';
import { UsersModule } from './users/users.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { TypesOfInstitutionsModule } from './types-of-institutions/types-of-institutions.module';
import { ObjectivesModule } from './objectives/objectives.module';
import { RolesModule } from './roles/roles.module';
import { LaboratoriesModule } from './laboratories/laboratories.module';
import { TechnologiesModule } from './technologies/technologies.module';
import { DevicesModule } from './devices/devices.module';
import { TypesOfConnectionsModule } from './types-of-connections/types-of-connections.module';
import { FarmersConnectionsModule } from './farmers-connections/farmers-connections.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { SectionsModule } from './sections/sections.module';
import { SurveysModule } from './surveys/surveys.module';
import { ResponsesModule } from './responses/responses.module';
import { QuestionsModule } from './questions/questions.module';
import { TypesOfQuestionsModule } from './types-of-questions/types-of-questions.module';
import { ObstaclesModule } from './obstacles/obstacles.module';
import { DigitalFuncionalityModule } from './digital-funcionality/digital-funcionality.module';
import { OptionsQuestionModule } from './options-question/options-question.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      autoLoadEntities: true, // Carga automática de entidades
      synchronize: true, // Sincroniza el esquema de la base de datos (no recomendado para producción)
    }),
    FarmersModule,
    FarmsModule,
    CooperativesModule,
    TownsModule,
    DepartmentsModule,
    TypesOfCropsModule,
    UsersModule,
    InstitutionsModule,
    TypesOfInstitutionsModule,
    ObjectivesModule,
    RolesModule,
    LaboratoriesModule,
    TechnologiesModule,
    DevicesModule,
    TypesOfConnectionsModule,
    FarmersConnectionsModule,
    InstrumentsModule,
    SectionsModule,
    SurveysModule,
    ResponsesModule,
    QuestionsModule,
    TypesOfQuestionsModule,
    ObstaclesModule,
    DigitalFuncionalityModule,
    OptionsQuestionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
