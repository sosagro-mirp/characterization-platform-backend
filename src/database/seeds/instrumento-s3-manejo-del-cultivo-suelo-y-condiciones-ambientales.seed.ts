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

const NAME = `S3: Manejo del Cultivo, Suelo y Condiciones Ambientales`;
const VERSION = 1;

export async function seedInstrumentoS3ManejoDelCultivoSueloYCondicionesAmbientales(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "numeric", "open_text", "single_choice", "yes_no"];
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

  const [sec1, sec2] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `3.1 Variables climáticas de la zona`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `3.2 Suelo o sustrato — análisis y características`, order: 2, instrument }))
  ]);

  // ── 3.1 Variables climáticas de la zona ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Temperatura promedio de la zona (°C)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Humedad relativa promedio (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿La zona tiene lluvias frecuentes o marcadas?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Hay vientos fuertes en la zona?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Hay nubosidad o neblina frecuente?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Presión atmosférica, si se conoce (hPa)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_93a618a9_2323_471c_97cb_df76c8755874 = await saveQuestion(manager, {
      text: `¿Qué tan útil le sería recibir en su celular el pronóstico del tiempo y alertas climáticas (heladas, lluvias extremas) específicas para su zona?`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_93a618a9_2323_471c_97cb_df76c8755874, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  // ── 3.2 Suelo o sustrato — análisis y características ──
  {
    let o = 1;

    const q_f32e6648_00b6_4bd9_be4d_9cc05fe70cd0 = await saveQuestion(manager, {
      text: `Tipo de suelo o sustrato predominante`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_f32e6648_00b6_4bd9_be4d_9cc05fe70cd0, [
      { text: `Limoso` },
      { text: `No sabe` },
      { text: `Orgánico` },
      { text: `Franco` },
      { text: `Franco arenoso` },
      { text: `Franco arcilloso` },
      { text: `Arcilloso` },
      { text: `Arenoso` },
    ]);

    const q_143f163f_30d3_4437_a8a0_098100a99d97 = await saveQuestion(manager, {
      text: `¿Ha realizado estudio de suelo o sustrato?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Año del último análisis de suelo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Con qué frecuencia realiza análisis de suelos o sustratos?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `pH del suelo o sustrato (último análisis)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });

    const q_554d5ff2_e6e7_4fa9_aaa2_64d706342dfa = await saveQuestion(manager, {
      text: `¿El estudio incluyó análisis de metales pesados?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_554d5ff2_e6e7_4fa9_aaa2_64d706342dfa, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_6f112c56_6bef_415a_836b_f6fe051bedc3 = await saveQuestion(manager, {
      text: `¿El estudio incluyó análisis de pesticidas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_6f112c56_6bef_415a_836b_f6fe051bedc3, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_957afc39_03a1_4059_ab40_453b457dcfba = await saveQuestion(manager, {
      text: `¿El estudio incluyó análisis microbiológico?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_957afc39_03a1_4059_ab40_453b457dcfba, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Puede compartir los resultados del estudio de suelo con el proyecto?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_143f163f_30d3_4437_a8a0_098100a99d97,
      conditionValue: 'true',
    });

    const q_821db9d2_21fb_4e14_b45c_01ac575f9cca = await saveQuestion(manager, {
      text: `¿Fertiliza sus cultivos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    const q_4ec64c5f_c4f0_4d52_a81a_1bcad24e8f8d = await saveQuestion(manager, {
      text: `Tipo de fertilización que utiliza`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      conditionQuestion: q_821db9d2_21fb_4e14_b45c_01ac575f9cca,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_4ec64c5f_c4f0_4d52_a81a_1bcad24e8f8d, [
      { text: `Química de síntesis` },
      { text: `Orgánica` },
      { text: `Química orgánica + síntesis` },
    ]);

    await saveQuestion(manager, {
      text: `Fertilizante(s) empleado(s) — nombre comercial / ficha técnica`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      conditionQuestion: q_821db9d2_21fb_4e14_b45c_01ac575f9cca,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Frecuencia de fertilización`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_821db9d2_21fb_4e14_b45c_01ac575f9cca,
      conditionValue: 'true',
    });

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular una alerta cuando sea el momento recomendado para hacer un nuevo análisis de suelo, según el intervalo que yo mismo defina.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me sería útil una app que interpretara los resultados de mi análisis de suelo y me sugiriera ajustes en la fertilización de forma sencilla, sin necesidad de un técnico presente.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Me gustaría llevar un registro digital de los fertilizantes que aplico (producto, dosis, fecha) para comparar con los resultados productivos al final de la campaña.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Me sería útil que una herramienta digital me indicara qué fertilizantes son compatibles con las certificaciones que busco (orgánico, Rainforest Alliance, etc.).`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (24 preguntas).`);
}
