import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();

import { DataSource } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { CampaignSession } from 'src/campaign-sessions/entities/campaign-session.entity';
import { Campaign } from 'src/campaigns/entities/campaign.entity';
import { CampaignStep } from 'src/campaigns/entities/campaign-step.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
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
import { MediaAttachment } from 'src/media-attachments/entities/media-attachment.entity';
import { seedActorTypes } from './actor-types.seed';
import { seedGeography } from './geography.seed';
import { seedTypesOfCrops } from './types-of-crops.seed';
import { seedTypesOfQuestions } from './types-of-questions.seed';
import { seedRoles } from './roles.seed';
import { seedAdminUser } from './admin-user.seed';
import { seedInstrumentoS10InteresEnParticiparEnElProyecto } from './instrumento-s10-interes-en-participar-en-el-proyecto.seed';
import { seedInstrumentoS11AdopcionTecnologicaDiagnosticoDeBarreras } from './instrumento-s11-adopcion-tecnologica-diagnostico-de-barreras.seed';
import { seedInstrumentoS11AdopcionTecnologicaDiagnosticoExtensionistas } from './instrumento-s11-adopcion-tecnologica-diagnostico-extensionistas.seed';
import { seedInstrumentoS11AdopcionTecnologicaPerfilDeInversionDelPropietario } from './instrumento-s11-adopcion-tecnologica-perfil-de-inversion-del-propietario.seed';
import { seedInstrumentoS12AspectosFitosanitariosDiagnostico } from './instrumento-s12-aspectos-fitosanitarios-diagnostico.seed';
import { seedInstrumentoS13ValidacionesTecnico } from './instrumento-s13-validaciones-tecnico.seed';
import { seedInstrumentoSDcuDiagnosticoBarrerasAdopcionDigital } from './instrumento-s-dcu-diagnostico-barreras-adopcion-digital.seed';
import { seedInstrumentoS1aIdentificacionDelEncuestadoPropietarioProductor } from './instrumento-s1a-identificacion-del-encuestado-propietario-productor.seed';
import { seedInstrumentoS1bIdentificacionDeLaUnidadProductiva } from './instrumento-s1b-identificacion-de-la-unidad-productiva.seed';
import { seedInstrumentoS24BloqueCacao } from './instrumento-s2-4-bloque-cacao.seed';
import { seedInstrumentoS25BloqueCafe } from './instrumento-s2-5-bloque-cafe.seed';
import { seedInstrumentoS26BloqueCannabis } from './instrumento-s2-6-bloque-cannabis.seed';
import { seedInstrumentoS27BloqueCanamo } from './instrumento-s2-7-bloque-canamo.seed';
import { seedInstrumentoS2CultivosIdentificacionDeCadenas } from './instrumento-s2-cultivos-identificacion-de-cadenas.seed';
import { seedInstrumentoS341SusceptibilidadAEnfermedades } from './instrumento-s3-4-1-susceptibilidad-a-enfermedades.seed';
import { seedInstrumentoS3ManejoDelCultivoSueloYCondicionesAmbientales } from './instrumento-s3-manejo-del-cultivo-suelo-y-condiciones-ambientales.seed';
import { seedInstrumentoS3bCaracterizacionMorfologicaCacaoTecnicos } from './instrumento-s3b-caracterizacion-morfologica-cacao-tecnicos.seed';
import { seedInstrumentoS41PoscosechaCacao } from './instrumento-s4-1-poscosecha-cacao.seed';
import { seedInstrumentoS42PoscosechaCafe } from './instrumento-s4-2-poscosecha-cafe.seed';
import { seedInstrumentoS43PoscosechaCannabis } from './instrumento-s4-3-poscosecha-cannabis.seed';
import { seedInstrumentoS44PoscosechaCanamo } from './instrumento-s4-4-poscosecha-canamo.seed';
import { seedInstrumentoS45EnergiaYEquipos } from './instrumento-s4-5-energia-y-equipos.seed';
import { seedInstrumentoS5DificultadesParaCumplirEstandaresDeCalidad } from './instrumento-s5-dificultades-para-cumplir-estandares-de-calidad.seed';
import { seedInstrumentoS6aGeneracionYManejoDeResiduosCacao } from './instrumento-s6a-generacion-y-manejo-de-residuos-cacao.seed';
import { seedInstrumentoS6bGeneracionYManejoDeResiduosCafe } from './instrumento-s6b-generacion-y-manejo-de-residuos-cafe.seed';
import { seedInstrumentoS6cGeneracionYManejoDeResiduosCannabis } from './instrumento-s6c-generacion-y-manejo-de-residuos-cannabis.seed';
import { seedInstrumentoS6dGeneracionYManejoDeResiduosCanamo } from './instrumento-s6d-generacion-y-manejo-de-residuos-canamo.seed';
import { seedInstrumentoS7aAguaEnElCultivoDeCacao } from './instrumento-s7a-agua-en-el-cultivo-de-cacao.seed';
import { seedInstrumentoS7bAguaEnElCultivoDeCafe } from './instrumento-s7b-agua-en-el-cultivo-de-cafe.seed';
import { seedInstrumentoS7cAguaEnCannabisYCanamo } from './instrumento-s7c-agua-en-cannabis-y-canamo.seed';
import { seedInstrumentoS8aInfraestructuraDePoscosechaCacao } from './instrumento-s8a-infraestructura-de-poscosecha-cacao.seed';
import { seedInstrumentoS8bInfraestructuraDePoscosechaCafe } from './instrumento-s8b-infraestructura-de-poscosecha-cafe.seed';
import { seedInstrumentoS8cInfraestructuraDeProduccionCannabis } from './instrumento-s8c-infraestructura-de-produccion-cannabis.seed';
import { seedInstrumentoS8dInfraestructuraDeProduccionCanamo } from './instrumento-s8d-infraestructura-de-produccion-canamo.seed';
import { seedInstrumentoS8eServiciosEInfraestructuraGeneral } from './instrumento-s8e-servicios-e-infraestructura-general.seed';
import { seedInstrumentoS9AsociatividadYCanalesDeComercializacion } from './instrumento-s9-asociatividad-y-canales-de-comercializacion.seed';
import { seedMunicipioOptions } from './municipio-options.seed';

const ALL_ENTITIES = [
  ActorType,
  MediaAttachment,
  Campaign,
  CampaignSession,
  CampaignStep,
  StepCondition,
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
  const databaseUrl = process.env.DATABASE_URL;
  const dataSource = new DataSource({
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          database: process.env.DB_NAME,
          username: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        }),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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
      // S1 — Identificación
      await seedInstrumentoS1aIdentificacionDelEncuestadoPropietarioProductor(manager);
      await seedInstrumentoS1bIdentificacionDeLaUnidadProductiva(manager);
      // S2 — Cultivos
      await seedInstrumentoS2CultivosIdentificacionDeCadenas(manager);
      await seedInstrumentoS24BloqueCacao(manager);
      await seedInstrumentoS25BloqueCafe(manager);
      await seedInstrumentoS26BloqueCannabis(manager);
      await seedInstrumentoS27BloqueCanamo(manager);
      // S3 — Manejo del cultivo
      await seedInstrumentoS341SusceptibilidadAEnfermedades(manager);
      await seedInstrumentoS3ManejoDelCultivoSueloYCondicionesAmbientales(manager);
      await seedInstrumentoS3bCaracterizacionMorfologicaCacaoTecnicos(manager);
      // S4 — Poscosecha
      await seedInstrumentoS41PoscosechaCacao(manager);
      await seedInstrumentoS42PoscosechaCafe(manager);
      await seedInstrumentoS43PoscosechaCannabis(manager);
      await seedInstrumentoS44PoscosechaCanamo(manager);
      await seedInstrumentoS45EnergiaYEquipos(manager);
      // S5 — Calidad
      await seedInstrumentoS5DificultadesParaCumplirEstandaresDeCalidad(manager);
      // S6 — Residuos
      await seedInstrumentoS6aGeneracionYManejoDeResiduosCacao(manager);
      await seedInstrumentoS6bGeneracionYManejoDeResiduosCafe(manager);
      await seedInstrumentoS6cGeneracionYManejoDeResiduosCannabis(manager);
      await seedInstrumentoS6dGeneracionYManejoDeResiduosCanamo(manager);
      // S7 — Agua
      await seedInstrumentoS7aAguaEnElCultivoDeCacao(manager);
      await seedInstrumentoS7bAguaEnElCultivoDeCafe(manager);
      await seedInstrumentoS7cAguaEnCannabisYCanamo(manager);
      // S8 — Infraestructura
      await seedInstrumentoS8aInfraestructuraDePoscosechaCacao(manager);
      await seedInstrumentoS8bInfraestructuraDePoscosechaCafe(manager);
      await seedInstrumentoS8cInfraestructuraDeProduccionCannabis(manager);
      await seedInstrumentoS8dInfraestructuraDeProduccionCanamo(manager);
      await seedInstrumentoS8eServiciosEInfraestructuraGeneral(manager);
      // S9 — Asociatividad
      await seedInstrumentoS9AsociatividadYCanalesDeComercializacion(manager);
      // S10 — Participación
      await seedInstrumentoS10InteresEnParticiparEnElProyecto(manager);
      // S11 — Adopción tecnológica
      await seedInstrumentoS11AdopcionTecnologicaDiagnosticoExtensionistas(manager);
      await seedInstrumentoS11AdopcionTecnologicaDiagnosticoDeBarreras(manager);
      await seedInstrumentoS11AdopcionTecnologicaPerfilDeInversionDelPropietario(manager);
      // S12 — Fitosanitario
      await seedInstrumentoS12AspectosFitosanitariosDiagnostico(manager);
      // S13 — Validaciones técnico
      await seedInstrumentoS13ValidacionesTecnico(manager);
      // S_DCU — DCU: Diagnóstico de barreras de adopción digital
      await seedInstrumentoSDcuDiagnosticoBarrerasAdopcionDigital(manager);
      // Catálogos auxiliares
      await seedMunicipioOptions(manager);
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
