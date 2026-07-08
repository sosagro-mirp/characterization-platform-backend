import { EntityManager } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

/**
 * Genera encuestas sincronizadas + respuestas de juguete SOLO para desarrollo
 * local, con el fin de superar el umbral de supresión por privacidad
 * (MIN_SAMPLE_THRESHOLD = 5, ver src/dashboard/dashboard.service.ts) y poder
 * certificar TC-06/TC-07/TC-08 de docs/testing/14-test-spec30.md sin depender
 * de un ambiente con datos reales.
 *
 * Idempotente: usa el prefijo DEV_TOY_DOCUMENT_PREFIX en `respondentDocumentId`
 * como marca; si ya existe al menos una encuesta marcada, no vuelve a insertar.
 *
 * Para revertir manualmente en local:
 *   DELETE FROM responses WHERE survey_id IN (
 *     SELECT survey_id FROM surveys WHERE respondent_document_id LIKE 'DEV-TOY-%'
 *   );
 *   DELETE FROM surveys_instruments WHERE survey_id IN (
 *     SELECT survey_id FROM surveys WHERE respondent_document_id LIKE 'DEV-TOY-%'
 *   );
 *   DELETE FROM surveys WHERE respondent_document_id LIKE 'DEV-TOY-%';
 */

const DEV_TOY_DOCUMENT_PREFIX = 'DEV-TOY-';

const PROJECT_DEPARTMENTS = [
  'Antioquia',
  'Caquetá',
  'Chocó',
  'La Guajira',
  'Meta',
  'Norte de Santander',
];

const SURVEYS_PER_DEPARTMENT_S_DCU = 8;
const TOTAL_SURVEYS_S1A = 12;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = Math.min(arr.length, Math.floor(Math.random() * (max - min + 1)) + min);
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function loadInstrumentWithQuestions(
  manager: EntityManager,
  code: string,
): Promise<Instrument> {
  const instrument = await manager
    .getRepository(Instrument)
    .createQueryBuilder('instrument')
    .leftJoinAndSelect('instrument.sections', 'section')
    .leftJoinAndSelect('section.questions', 'question')
    .leftJoinAndSelect('question.type', 'type')
    .leftJoinAndSelect('question.options', 'option')
    .where('instrument.code = :code', { code })
    .getOne();

  if (!instrument) {
    throw new Error(
      `[seed:dev-toy] Instrumento con code "${code}" no encontrado. Corre "pnpm seed:seed" primero.`,
    );
  }
  return instrument;
}

function eligibleQuestions(instrument: Instrument): Question[] {
  return instrument.sections
    .flatMap((section) => section.questions)
    .filter((q) => q.type.name !== 'open_text');
}

async function createResponsesForSurvey(
  manager: EntityManager,
  survey: Survey,
  questions: Question[],
): Promise<void> {
  const responseRepo = manager.getRepository(Response);

  for (const question of questions) {
    const typeName = question.type.name;

    if (typeName === 'yes_no') {
      await responseRepo.save(
        responseRepo.create({
          survey,
          question,
          booleanValue: Math.random() < 0.6,
        }),
      );
      continue;
    }

    if (typeName === 'numeric') {
      const value = question.systemField === 'farmer.age'
        ? randomInt(18, 70)
        : question.systemField === 'farmer.experienceYears'
          ? randomInt(0, 40)
          : randomInt(0, 50);
      await responseRepo.save(
        responseRepo.create({
          survey,
          question,
          numericValue: value,
        }),
      );
      continue;
    }

    if (typeName === 'single_choice' || typeName === 'likert') {
      const options = question.options.filter((o) => !o.isOther);
      if (options.length === 0) continue;
      const option = pickRandom(options);
      await responseRepo.save(
        responseRepo.create({
          survey,
          question,
          option,
        }),
      );
      continue;
    }

    if (typeName === 'multiple_choice') {
      const options = question.options.filter((o) => !o.isOther);
      if (options.length === 0) continue;
      const selected = pickRandomSubset(options, 1, Math.min(3, options.length));
      for (const option of selected) {
        await responseRepo.save(
          responseRepo.create({
            survey,
            question,
            option,
          }),
        );
      }
      continue;
    }
  }
}

async function createToySurveys(
  manager: EntityManager,
  params: {
    instrument: Instrument;
    questions: Question[];
    departments: Department[];
    townsByDepartment: Map<string, Town[]>;
    actorTypes: ActorType[];
    crops: TypeOfCrop[];
    count: number;
    documentPrefix: string;
  },
): Promise<number> {
  const surveyRepo = manager.getRepository(Survey);
  let created = 0;

  for (let i = 0; i < params.count; i++) {
    const department = pickRandom(params.departments);
    const towns = params.townsByDepartment.get(department.departmentId) ?? [];
    const town = towns.length > 0 ? pickRandom(towns) : undefined;
    const actorType = pickRandom(params.actorTypes);
    const crop = Math.random() < 0.85 ? pickRandom(params.crops) : undefined;

    const survey = await surveyRepo.save(
      surveyRepo.create({
        department,
        town,
        actorType,
        crop,
        instruments: [params.instrument],
        sincronized: true,
        respondentDocumentId: `${params.documentPrefix}${params.instrument.code}-${i}`,
      }),
    );

    await createResponsesForSurvey(manager, survey, params.questions);
    created++;
  }

  return created;
}

export async function seedDevToySurveys(manager: EntityManager): Promise<void> {
  const surveyRepo = manager.getRepository(Survey);

  const existing = await surveyRepo
    .createQueryBuilder('survey')
    .where('survey.respondentDocumentId LIKE :prefix', {
      prefix: `${DEV_TOY_DOCUMENT_PREFIX}%`,
    })
    .getCount();

  if (existing > 0) {
    console.log(
      `[seed:dev-toy] Ya existen ${existing} encuestas de juguete (prefijo "${DEV_TOY_DOCUMENT_PREFIX}"). Se omite.`,
    );
    return;
  }

  const departmentRepo = manager.getRepository(Department);
  const townRepo = manager.getRepository(Town);
  const actorTypeRepo = manager.getRepository(ActorType);
  const cropRepo = manager.getRepository(TypeOfCrop);

  const departments = await departmentRepo.find({
    where: PROJECT_DEPARTMENTS.map((name) => ({ name })),
  });
  if (departments.length !== PROJECT_DEPARTMENTS.length) {
    throw new Error(
      '[seed:dev-toy] No se encontraron los 6 departamentos del proyecto. Corre "pnpm seed:seed" primero.',
    );
  }

  const towns = await townRepo.find({ relations: ['department'] });
  const townsByDepartment = new Map<string, Town[]>();
  for (const town of towns) {
    const list = townsByDepartment.get(town.department.departmentId) ?? [];
    list.push(town);
    townsByDepartment.set(town.department.departmentId, list);
  }

  const actorTypes = await actorTypeRepo.find();
  const crops = await cropRepo.find();
  if (actorTypes.length === 0 || crops.length === 0) {
    throw new Error(
      '[seed:dev-toy] No hay actor types o types of crops seedeados. Corre "pnpm seed:seed" primero.',
    );
  }

  const sDcu = await loadInstrumentWithQuestions(manager, 'S_DCU');
  const s1a = await loadInstrumentWithQuestions(manager, 'S1');

  const sDcuQuestions = eligibleQuestions(sDcu);
  const s1aQuestions = eligibleQuestions(s1a);

  let total = 0;

  // Reparte encuestas de S_DCU entre los 6 departamentos del proyecto para
  // que el mapa de Colombia coloree todos y cada filtro por departamento
  // tenga muestra suficiente (≥5).
  for (const department of departments) {
    total += await createToySurveys(manager, {
      instrument: sDcu,
      questions: sDcuQuestions,
      departments: [department],
      townsByDepartment,
      actorTypes,
      crops,
      count: SURVEYS_PER_DEPARTMENT_S_DCU,
      documentPrefix: DEV_TOY_DOCUMENT_PREFIX,
    });
  }

  // S1a cubre yes_no/single_choice/multiple_choice/numeric para TC-06;
  // no necesita cobertura por-departamento, solo muestra total suficiente.
  total += await createToySurveys(manager, {
    instrument: s1a,
    questions: s1aQuestions,
    departments,
    townsByDepartment,
    actorTypes,
    crops,
    count: TOTAL_SURVEYS_S1A,
    documentPrefix: DEV_TOY_DOCUMENT_PREFIX,
  });

  console.log(`[seed:dev-toy] ${total} encuestas de juguete creadas (S_DCU + S1a).`);
}
