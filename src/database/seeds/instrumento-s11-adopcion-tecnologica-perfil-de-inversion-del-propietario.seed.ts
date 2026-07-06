import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

async function saveQuestion(
  manager: EntityManager,
  def: {
    text: string;
    type: TypeOfQuestion;
    isRequired: boolean;
    isSelectionCriteria?: boolean;
    isKeyQuestion?: boolean;
    order: number;
    section: Section;
    conditionQuestion?: Question;
    conditionValue?: string;
    systemField?: string;
  },
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    isKeyQuestion: def.isKeyQuestion ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
    systemField: def.systemField,
  }));
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean; metadataId?: string }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
      metadataId: opt.metadataId,
    }));
    map.set(opt.text, saved.optionId);
  }
  return map;
}

const NAME = `S11: Adopción Tecnológica — Perfil de Inversión del Propietario`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaPerfilDeInversionDelPropietario(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "single_choice"];
  const types: Record<string, TypeOfQuestion> = {};
  for (const n of typeNames) {
    const t = await typeRepo.findOne({ where: { name: n } });
    if (!t) throw new Error(`[seed] TypeOfQuestion "${n}" no encontrado.`);
    types[n] = t;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: false,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `PR. Perfil de inversión del propietario`, order: 1, instrument }),
  );

  // ── PR. Perfil de inversión del propietario ──
  {
    let o = 1;

    const q_adba2b71_8e26_4372_8117_0694203c5985 = await saveQuestion(manager, {
      text: `¿Ha realizado inversiones en tecnología o infraestructura en los últimos 3 años?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_adba2b71_8e26_4372_8117_0694203c5985, [
      { text: `No y sin planes actualmente` },
      { text: `No, pero tengo planes` },
      { text: `Sí, entre 1–3 años atrás` },
      { text: `Sí, en los últimos 12 meses` },
    ]);

    const q_5630254a_8540_417c_8a61_1b323d4668ab = await saveQuestion(manager, {
      text: `¿Quién toma las decisiones de inversión en nuevas tecnologías para la finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5630254a_8540_417c_8a61_1b323d4668ab, [
      { text: `Propietario y productor en conjunto` },
      { text: `Una junta familiar` },
      { text: `El productor / administrador` },
      { text: `El propietario exclusivamente` },
    ]);

    const q_a3996f83_8432_43da_ab02_ee5a041beb7e = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a pagar por un servicio digital de monitoreo o gestión de su finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a3996f83_8432_43da_ab02_ee5a041beb7e, [
      { text: `Solo si fuera gratuito` },
      { text: `Sí, pagaría hasta $20.000 COP/mes` },
      { text: `No estoy interesado` },
      { text: `Sí, $20.001–$50.000 COP/mes` },
      { text: `Sí, más de $50.000 COP/mes` },
    ]);

    const q_a6b07573_f857_4688_99ae_a7422ef79e08 = await saveQuestion(manager, {
      text: `¿Tiene acceso a crédito o líneas de financiamiento para inversión productiva?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a6b07573_f857_4688_99ae_a7422ef79e08, [
      { text: `Sí, tengo crédito activo` },
      { text: `Sí, tengo acceso pero sin uso reciente` },
      { text: `He intentado pero no me han aprobado` },
      { text: `No tengo acceso a crédito formal` },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me gustaría poder revisar el estado de mi finca desde mi celular o computador sin necesidad de estar físicamente presente.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me sería útil que la plataforma digital me generara reportes de rentabilidad de mi finca de manera automática (ingresos, costos, utilidad estimada por campaña).`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Estaría dispuesto(a) a pagar por un servicio digital de monitoreo remoto de mi finca si me ayuda a reducir pérdidas o aumentar ingresos de forma demostrable.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Me interesaría que la plataforma digital estuviera integrada con mi sistema de crédito o financiamiento para facilitar la gestión de líneas agropecuarias.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_5 = await saveQuestion(manager, {
      text: `Esperaría ver resultados concretos en menos de seis meses para considerar que la inversión en una plataforma de gestión de finca valió la pena.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_5, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (9 preguntas).`);
}
