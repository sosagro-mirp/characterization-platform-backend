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

const NAME = `S6A: Generación y Manejo de Residuos — Cacao`;
const VERSION = 1;

export async function seedInstrumentoS6aGeneracionYManejoDeResiduosCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "open_text", "single_choice", "yes_no", "likert"];
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

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `6.1 Tabla de Residuos por Cultivo`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `6.2 Caracterización Detallada de Residuos`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `6.3 Interés en Valorización de Residuos`, order: 3, instrument }))
  ]);

  // ── 6.1 Tabla de Residuos por Cultivo ──
  {
    let o = 1;

    const q_cb24df19_85b2_4b98_acd3_8930ca5aef7a = await saveQuestion(manager, {
      text: `¿Genera cáscara de mazorca de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de cáscara de mazorca de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cb24df19_85b2_4b98_acd3_8930ca5aef7a,
      conditionValue: 'true',
    });

    const q_9157ae6b_7b52_4127_893f_abddf707f4e3 = await saveQuestion(manager, {
      text: `Unidad de medida para Cáscara / cascarilla de mazorca de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cb24df19_85b2_4b98_acd3_8930ca5aef7a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_9157ae6b_7b52_4127_893f_abddf707f4e3, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_c04e25f6_5171_4098_8e55_fd1529ef2223 = await saveQuestion(manager, {
      text: `Manejo actual de Cáscara / cascarilla de mazorca de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cb24df19_85b2_4b98_acd3_8930ca5aef7a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c04e25f6_5171_4098_8e55_fd1529ef2223, [
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Otro` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Cáscara / cascarilla de mazorca de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cb24df19_85b2_4b98_acd3_8930ca5aef7a,
      conditionValue: 'true',
    });

    const q_6eead935_9ac0_4a3c_8203_cf7f9afc6086 = await saveQuestion(manager, {
      text: `¿Genera Mucílago / baba de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Mucílago / baba de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_6eead935_9ac0_4a3c_8203_cf7f9afc6086,
      conditionValue: 'true',
    });

    const q_d5b88421_c285_495e_a256_3a6e6cebc60b = await saveQuestion(manager, {
      text: `Unidad de medida para Mucílago / baba de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_6eead935_9ac0_4a3c_8203_cf7f9afc6086,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_d5b88421_c285_495e_a256_3a6e6cebc60b, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_71e1d7fc_7f80_4244_86ba_dce0b9b5b5c6 = await saveQuestion(manager, {
      text: `Manejo actual de Mucílago / baba de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_6eead935_9ac0_4a3c_8203_cf7f9afc6086,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_71e1d7fc_7f80_4244_86ba_dce0b9b5b5c6, [
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Ningún manejo especial` },
      { text: `Otro` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
      { text: `Abandono en campo` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Mucílago / baba de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_6eead935_9ac0_4a3c_8203_cf7f9afc6086,
      conditionValue: 'true',
    });

    const q_35f38777_05de_4699_a616_e20f84c6c21f = await saveQuestion(manager, {
      text: `¿Genera Semillas defectuosas / cacao de baja calidad?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Semillas defectuosas / cacao de baja calidad`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_35f38777_05de_4699_a616_e20f84c6c21f,
      conditionValue: 'true',
    });

    const q_08c20699_6762_4ca2_bbba_3c6891e7700e = await saveQuestion(manager, {
      text: `Unidad de medida para Semillas defectuosas / cacao de baja calidad`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_35f38777_05de_4699_a616_e20f84c6c21f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_08c20699_6762_4ca2_bbba_3c6891e7700e, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_3edba324_9407_4fb5_ae60_90ff1987c42b = await saveQuestion(manager, {
      text: `Manejo actual de Semillas defectuosas / cacao de baja calidad`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_35f38777_05de_4699_a616_e20f84c6c21f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_3edba324_9407_4fb5_ae60_90ff1987c42b, [
      { text: `Venta o donación` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Otro` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Semillas defectuosas / cacao de baja calidad`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_35f38777_05de_4699_a616_e20f84c6c21f,
      conditionValue: 'true',
    });

    const q_60d01116_bbf4_43a3_afc8_f75a8a6ebddb = await saveQuestion(manager, {
      text: `¿Genera Aguas mieles del beneficio húmedo de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Aguas mieles del beneficio húmedo de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_60d01116_bbf4_43a3_afc8_f75a8a6ebddb,
      conditionValue: 'true',
    });

    const q_7442ed67_b496_4379_b883_4e80160054f3 = await saveQuestion(manager, {
      text: `Unidad de medida para Aguas mieles del beneficio húmedo de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_60d01116_bbf4_43a3_afc8_f75a8a6ebddb,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_7442ed67_b496_4379_b883_4e80160054f3, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_50a87a91_fc8e_4dfa_b9e6_4e9d37c290ce = await saveQuestion(manager, {
      text: `Manejo actual de Aguas mieles del beneficio húmedo de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_60d01116_bbf4_43a3_afc8_f75a8a6ebddb,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_50a87a91_fc8e_4dfa_b9e6_4e9d37c290ce, [
      { text: `Ningún manejo especial` },
      { text: `Otro` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Aguas mieles del beneficio húmedo de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_60d01116_bbf4_43a3_afc8_f75a8a6ebddb,
      conditionValue: 'true',
    });

    const q_a536d0e8_5e51_45f8_b6ca_12b19d2aff7f = await saveQuestion(manager, {
      text: `¿Genera Restos de poda de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de restos de poda de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a536d0e8_5e51_45f8_b6ca_12b19d2aff7f,
      conditionValue: 'true',
    });

    const q_1499c143_980d_4c40_9327_d4d18a4f987c = await saveQuestion(manager, {
      text: `Unidad de medida para Restos de poda de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a536d0e8_5e51_45f8_b6ca_12b19d2aff7f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_1499c143_980d_4c40_9327_d4d18a4f987c, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_5250ba52_14f5_47d7_bd39_72be641d3b43 = await saveQuestion(manager, {
      text: `Manejo actual de Restos de poda de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a536d0e8_5e51_45f8_b6ca_12b19d2aff7f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_5250ba52_14f5_47d7_bd39_72be641d3b43, [
      { text: `Abandono en campo` },
      { text: `Otro` },
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Restos de poda de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a536d0e8_5e51_45f8_b6ca_12b19d2aff7f,
      conditionValue: 'true',
    });

    const q_e381c872_aa0c_4d35_9006_ab2038edbe04 = await saveQuestion(manager, {
      text: `¿Genera Cascarilla de cacao tostado?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Cascarilla de cacao tostado`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e381c872_aa0c_4d35_9006_ab2038edbe04,
      conditionValue: 'true',
    });

    const q_8f9a92cd_a614_410a_890e_214e2428d513 = await saveQuestion(manager, {
      text: `Unidad de medida para Cascarilla de cacao tostado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e381c872_aa0c_4d35_9006_ab2038edbe04,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_8f9a92cd_a614_410a_890e_214e2428d513, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_2b2aaf86_55af_4bea_a9be_01eca7416aec = await saveQuestion(manager, {
      text: `Manejo actual de Cascarilla de cacao tostado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e381c872_aa0c_4d35_9006_ab2038edbe04,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_2b2aaf86_55af_4bea_a9be_01eca7416aec, [
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Ningún manejo especial` },
      { text: `Otro` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Cascarilla de cacao tostado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e381c872_aa0c_4d35_9006_ab2038edbe04,
      conditionValue: 'true',
    });

    const q_0cc999bc_31db_4add_8b3f_748cfa8ee769 = await saveQuestion(manager, {
      text: `¿Genera algún otro residuo de cacao no listado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.otro-cacao — ¿Cuál es el nombre del residuo?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0cc999bc_31db_4add_8b3f_748cfa8ee769,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de otro residuo de cacao no listado`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0cc999bc_31db_4add_8b3f_748cfa8ee769,
      conditionValue: 'true',
    });

    const q_b72f1d2f_66e9_48a0_a4cc_d6fef15f7fc0 = await saveQuestion(manager, {
      text: `6.1.otro-cacao — Unidad de medida para otro residuo de cacao no listado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0cc999bc_31db_4add_8b3f_748cfa8ee769,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b72f1d2f_66e9_48a0_a4cc_d6fef15f7fc0, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_2278a2c2_2766_481b_b4b5_0ef75dc4fb85 = await saveQuestion(manager, {
      text: `Manejo actual de otro residuo de cacao no listado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0cc999bc_31db_4add_8b3f_748cfa8ee769,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_2278a2c2_2766_481b_b4b5_0ef75dc4fb85, [
      { text: `Abandono en campo` },
      { text: `Ningún manejo especial` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.otro-cacao — Efectos negativos observados de otro residuo de cacao no listado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0cc999bc_31db_4add_8b3f_748cfa8ee769,
      conditionValue: 'true',
    });

  }

  // ── 6.2 Caracterización Detallada de Residuos ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Cuál es la parte del cultivo que constituye el residuo o los residuos más abundantes? (Ej: cáscara de cacao, mucílago de café, tallos de cáñamo)`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿El residuo es homogéneo o viene mezclado con otros materiales (tierra, piedras, plásticos)?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cómo es la forma y tamaño aproximado del residuo?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_fc39b713_78e4_4d75_bc91_ae1e990a9ccd = await saveQuestion(manager, {
      text: `¿El material es fibroso o denso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_fc39b713_78e4_4d75_bc91_ae1e990a9ccd, [
      { text: `Denso` },
      { text: `Fibroso` },
      { text: `Mixto` },
    ]);

    const q_39a9251f_1739_42bc_ab07_fbc4dd794548 = await saveQuestion(manager, {
      text: `¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_39a9251f_1739_42bc_ab07_fbc4dd794548 = await saveOptions(manager, q_39a9251f_1739_42bc_ab07_fbc4dd794548, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);
    const opt_3b66c3d2_a040_4368_a2f3_18a3cf39e96b = opts_39a9251f_1739_42bc_ab07_fbc4dd794548.get(`Sí`)!;

    const q_5ee11b5e_2e50_4acd_bdc8_ba360804de8e = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de la caracterización con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_39a9251f_1739_42bc_ab07_fbc4dd794548,
      conditionValue: opt_3b66c3d2_a040_4368_a2f3_18a3cf39e96b,
    });
    await saveOptions(manager, q_5ee11b5e_2e50_4acd_bdc8_ba360804de8e, [
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene idea del contenido de humedad del residuo al momento de la recolección?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cuánto tiempo transcurre desde la generación del residuo hasta que puede ser recolectado? ¿Observa señales de descomposición?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_29fafcbf_fc6a_4b9d_b709_1237937423b7 = await saveQuestion(manager, {
      text: `¿Bajo qué condiciones se almacena actualmente el residuo?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_29fafcbf_fc6a_4b9d_b709_1237937423b7, [
      { text: `Bajo techo sin control` },
      { text: `En cuarto controlado` },
      { text: `Contacto directo con suelo` },
      { text: `En silos` },
      { text: `A la intemperie` },
    ]);

    const q_fa56378d_dc26_4417_8331_4afcc6bf6336 = await saveQuestion(manager, {
      text: `¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_fa56378d_dc26_4417_8331_4afcc6bf6336, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_a48a4283_5742_4361_82fd_b26d811e4f59 = await saveQuestion(manager, {
      text: `¿Sería posible enviar los residuos secos al laboratorio del proyecto?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_a48a4283_5742_4361_82fd_b26d811e4f59, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Se aplican agentes químicos durante el cultivo o poscosecha (pesticidas, fungicidas)? Liste los agentes empleados.`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cómo es el proceso de beneficio: vía seca o húmeda?`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cuál es el volumen estimado de lixiviados o "aguas mieles" por tonelada de producto procesado? (L/t o m³/t)`,
      type: types.numeric,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Se añade agua adicional durante el proceso de extracción o despulpado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cuál es el pH inicial aproximado de las fases líquidas obtenidas?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿El residuo se genera de manera constante o solo en meses específicos de cosecha? (Indique los meses si aplica)`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Qué volumen o masa total genera por lote de producción? (Incluya cantidad y unidad: kg, t o L)`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿El residuo se recolecta de forma selectiva o se mezcla en un foso común?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cuánto tiempo máximo permanece almacenado el residuo antes de ser usado o despachado? (horas / días / semanas)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_8f721796_2dbc_4fcb_83cc_bf6a44cf418e = await saveQuestion(manager, {
      text: `¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_8f721796_2dbc_4fcb_83cc_bf6a44cf418e, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuál es la temperatura promedio del área de almacenamiento? (°C)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_9d1a8b50_ce86_4098_a625_d1a50e5e0f40 = await saveQuestion(manager, {
      text: `¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo? (Clave para seguridad en valorización energética y de materiales)`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_9d1a8b50_ce86_4098_a625_d1a50e5e0f40 = await saveOptions(manager, q_9d1a8b50_ce86_4098_a625_d1a50e5e0f40, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);
    const opt_178d71dc_c3dc_4e9c_b17e_0439c1c98fcc = opts_9d1a8b50_ce86_4098_a625_d1a50e5e0f40.get(`Sí`)!;

    const q_160418ca_01e5_4c79_aebd_63d5bc94078f = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de metales pesados con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_9d1a8b50_ce86_4098_a625_d1a50e5e0f40,
      conditionValue: opt_178d71dc_c3dc_4e9c_b17e_0439c1c98fcc,
    });
    await saveOptions(manager, q_160418ca_01e5_4c79_aebd_63d5bc94078f, [
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.e — ¿Qué residuos genera? Nombre todos los residuos de estos cultivos.`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si el residuo es fibroso (tallo de cáñamo, cáscara de cacao), ¿cuál es la longitud promedio de la fibra? (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

  }

  // ── 6.3 Interés en Valorización de Residuos ──
  {
    let o = 1;

    const q_5a226864_f50c_4314_b33b_9ca88c783b38 = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a reutilizar / valorizar sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_5a226864_f50c_4314_b33b_9ca88c783b38, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_e4221c52_435a_42bf_8e33_4d1d4c2abde5 = await saveQuestion(manager, {
      text: `¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_e4221c52_435a_42bf_8e33_4d1d4c2abde5, [
      { text: `Materiales / empaques` },
      { text: `Ingredientes funcionales / cosméticos` },
      { text: `Producción de energía (biochar, biogás)` },
      { text: `Fertilizantes / abonos` },
      { text: `Tratamiento de agua (filtros, carbón activado)` },
    ]);

    const q_3443c7c3_a668_4d67_a181_5fae37d82418 = await saveQuestion(manager, {
      text: `¿Ha escuchado sobre la generación de energía a partir de residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_3443c7c3_a668_4d67_a181_5fae37d82418, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Actualmente aprovecha algún residuo para generar energía?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec3,
    });

    const q_c8f6d181_5e81_4e44_b1c5_805448c7c1bf = await saveQuestion(manager, {
      text: `¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_c8f6d181_5e81_4e44_b1c5_805448c7c1bf, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué uso le daría a esa energía?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_8281fa33_49de_4a90_8cab_2c5648da9df9 = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_8281fa33_49de_4a90_8cab_2c5648da9df9, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_0ff868d6_0d74_4ba3_82a2_2642e9d80048 = await saveQuestion(manager, {
      text: `¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_0ff868d6_0d74_4ba3_82a2_2642e9d80048, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_82b167a4_88dd_4b03_8785_d4c4c0915cc1 = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_82b167a4_88dd_4b03_8785_d4c4c0915cc1, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_fa9187b1_04d0_4197_9164_1f409b8d9306 = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_fa9187b1_04d0_4197_9164_1f409b8d9306, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_4fc7621e_6633_4ecd_9e0c_6c200204276c = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes biocosméticos?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_4fc7621e_6633_4ecd_9e0c_6c200204276c, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    const q_490dabb7_8e67_4ec9_9657_ff155e31a500 = await saveQuestion(manager, {
      text: `¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_490dabb7_8e67_4ec9_9657_ff155e31a500, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_d8040b91_5fa0_4a64_b31c_8ac559a074e8 = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_d8040b91_5fa0_4a64_b31c_8ac559a074e8, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué factor considera más importante al evaluar una tecnología de valorización de residuos?`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `¿Ha incorporado alguna ruta de valorización? Si Sí: ¿Cuál? ¿Cómo le ha funcionado? Si No: ¿Cuál intentó sin éxito? ¿Por qué no funcionó? ¿Quién se la dio o vendió?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil una app que me mostrara opciones de valorización para los residuos de cacao que genero (cáscara de mazorca, mucílago, aguas mieles), con instrucciones paso a paso para implementarlas.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de cacao.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Me sería útil llevar en una app un registro de las cantidades de residuos de cacao que genero por cosecha, para estimar su potencial de valorización y acceder a incentivos ambientales.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Preferiría recibir guías de manejo de residuos de cacao en formato de video corto o audio, para usarlas mientras trabajo.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (81 preguntas).`);
}
