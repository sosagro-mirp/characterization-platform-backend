import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { DataSource } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignStep } from 'src/campaigns/entities/campaign-step.entity';
import { Cooperative } from 'src/cooperatives/entities/cooperative.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Device } from 'src/devices/entities/device.entity';
import { DigitalFuncionality } from 'src/digital-funcionality/entities/digital-funcionality.entity';
import { FarmerConnection } from 'src/farmers-connections/entities/farmer-connection.entity';
import { Farmer } from 'src/farmers/entities/farmer.entity';
import { Farm } from 'src/farms/entities/farm.entity';
import { Institution } from 'src/institutions/entities/institution.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Laboratory } from 'src/laboratories/entities/laboratory.entity';
import { Objective } from 'src/objectives/entities/objective.entity';
import { Obstacle } from 'src/obstacles/entities/obstacle.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Role } from 'src/roles/entities/role.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Technology } from 'src/technologies/entities/technology.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfConnection } from 'src/types-of-connections/entities/type-of-connection.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { TypeOfInstitution } from 'src/types-of-institutions/entities/type-of-institution.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { User } from 'src/users/entities/user.entity';
import { seedActorTypes } from './actor-types.seed';
import { seedGeography } from './geography.seed';
import { seedTypesOfCrops } from './types-of-crops.seed';
import { seedTypesOfQuestions } from './types-of-questions.seed';
import { seedRoles } from './roles.seed';
import { seedAdminUser } from './admin-user.seed';
import { seedInstrumentoResiduos } from './instrumento-residuos.seed';
import { seedInstrumentosAgua } from './instrumento-agua.seed';
import { seedInstrumentoIdentificacion } from './instrumento-identificacion.seed';
import { seedInstrumentosCultivos } from './instrumento-cultivos.seed';
import { seedInstrumentosSuelo } from './instrumento-suelo.seed';
import { seedInstrumentoCacaoMorfologia } from './instrumento-cacao-morfologia.seed';
import { seedInstrumentosPoscosecha } from './instrumento-poscosecha.seed';
import { seedInstrumentoDificultades } from './instrumento-dificultades.seed';
import { seedInstrumentosInfraestructura } from './instrumento-infraestructura.seed';
import { seedInstrumentoAsociatividad } from './instrumento-asociatividad.seed';
import { seedInstrumentoParticipacion } from './instrumento-participacion.seed';
import { seedInstrumentoAdopcionProductores } from './instrumento-adopcion-productores.seed';
import { seedInstrumentoAdopcionExtensionistas } from './instrumento-adopcion-extensionistas.seed';
import { seedInstrumentoAdopcionPropietarios } from './instrumento-adopcion-propietarios.seed';

const ALL_ENTITIES = [
  ActorType,
  Campaign,
  CampaignSession,
  CampaignStep,
  Cooperative,
  Department,
  Device,
  DigitalFuncionality,
  Farm,
  Farmer,
  FarmerConnection,
  Institution,
  Instrument,
  Laboratory,
  Objective,
  Obstacle,
  OptionQuestion,
  Question,
  Response,
  Role,
  Section,
  Survey,
  Technology,
  Town,
  TypeOfConnection,
  TypeOfCrop,
  TypeOfInstitution,
  TypeOfQuestion,
  User,
];

async function run(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    entities: ALL_ENTITIES,
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('[seed] Conexión a base de datos establecida');

  try {
    await dataSource.transaction(async (manager) => {
      await seedRoles(manager);
      await seedAdminUser(manager);
      await seedActorTypes(manager);
      await seedGeography(manager);
      await seedTypesOfCrops(manager);
      await seedTypesOfQuestions(manager);
      await seedInstrumentoResiduos(manager);
      await seedInstrumentosAgua(manager);
      await seedInstrumentoIdentificacion(manager);
      await seedInstrumentosCultivos(manager);
      await seedInstrumentosSuelo(manager);
      await seedInstrumentoCacaoMorfologia(manager);
      await seedInstrumentosPoscosecha(manager);
      await seedInstrumentoDificultades(manager);
      await seedInstrumentosInfraestructura(manager);
      await seedInstrumentoAsociatividad(manager);
      await seedInstrumentoParticipacion(manager);
      await seedInstrumentoAdopcionProductores(manager);
      await seedInstrumentoAdopcionExtensionistas(manager);
      await seedInstrumentoAdopcionPropietarios(manager);
    });
    console.log('[seed] Completado exitosamente');
  } catch (error) {
    console.error('[seed] Error al ejecutar el seed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

void run();
