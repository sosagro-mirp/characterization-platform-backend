import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
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
import { ActorTypesModule } from './actor-types/actor-types.module';
import { AuthModule } from './auth/auth.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CampaignSessionsModule } from './campaign-sessions/campaign-sessions.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV === 'production'
          ? { target: 'pino/file', options: { destination: 1 } }
          : {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,  // 1 minute
        limit: 60,    // 60 requests per minute per IP
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        const dbHost = configService.get<string>('DB_HOST');
        const dbPort = parseInt(configService.get<string>('DB_PORT') || '5432', 10);
        const dbName = configService.get<string>('DB_NAME');
        const dbUser = configService.get<string>('DB_USER');
        const dbPassword = configService.get<string>('DB_PASSWORD');
        const dbSsl = configService.get<string>('DB_SSL') === 'true';
        const nodeEnv = configService.get<string>('NODE_ENV');

        return {
          type: 'postgres',
          ...(databaseUrl ? { url: databaseUrl } : { host: dbHost, port: dbPort, database: dbName, username: dbUser, password: dbPassword }),
          ssl: dbSsl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: nodeEnv === 'production',
          migrations: ['dist/migrations/*.js'],
          logging: nodeEnv !== 'production',
        };
      },
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
    ActorTypesModule,
    AuthModule,
    CampaignsModule,
    CampaignSessionsModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
