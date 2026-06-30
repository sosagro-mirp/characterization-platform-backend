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

const NAME = `S6C: Generación y Manejo de Residuos — Cannabis`;
const VERSION = 1;

export async function seedInstrumentoS6cGeneracionYManejoDeResiduosCannabis(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "open_text", "single_choice", "yes_no"];
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

    const q_d6ce4786_41f4_4a00_b1a6_d210ad70144b = await saveQuestion(manager, {
      text: `¿Genera Tallos y hojas de descarte de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Tallos y hojas de descarte de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d6ce4786_41f4_4a00_b1a6_d210ad70144b,
      conditionValue: 'true',
    });

    const q_47feaf68_a319_4881_bf1d_e1272aca6e78 = await saveQuestion(manager, {
      text: `Unidad de medida para Tallos y hojas de descarte de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d6ce4786_41f4_4a00_b1a6_d210ad70144b,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_47feaf68_a319_4881_bf1d_e1272aca6e78, [
      { text: `kg` },
      { text: `t` },
      { text: `L` },
    ]);

    const q_ea41b706_aabe_46f0_be95_37f2423fb953 = await saveQuestion(manager, {
      text: `Manejo actual de Tallos y hojas de descarte de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d6ce4786_41f4_4a00_b1a6_d210ad70144b,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_ea41b706_aabe_46f0_be95_37f2423fb953, [
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Otro` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Tallos y hojas de descarte de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d6ce4786_41f4_4a00_b1a6_d210ad70144b,
      conditionValue: 'true',
    });

    const q_e738c75f_e975_41e9_bbb1_983a0f1188b0 = await saveQuestion(manager, {
      text: `¿Genera Material vegetal post-extracción (bagazo) de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e738c75f_e975_41e9_bbb1_983a0f1188b0,
      conditionValue: 'true',
    });

    const q_d941c12d_d932_4981_a43d_71ab73af27f7 = await saveQuestion(manager, {
      text: `Unidad de medida para Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e738c75f_e975_41e9_bbb1_983a0f1188b0,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_d941c12d_d932_4981_a43d_71ab73af27f7, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_aa3ce8cb_cc0d_448e_9080_4f230ea4c497 = await saveQuestion(manager, {
      text: `Manejo actual de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e738c75f_e975_41e9_bbb1_983a0f1188b0,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_aa3ce8cb_cc0d_448e_9080_4f230ea4c497, [
      { text: `Incorporación al suelo / compostaje` },
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Otro` },
      { text: `Quema` },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e738c75f_e975_41e9_bbb1_983a0f1188b0,
      conditionValue: 'true',
    });

    const q_b43d080f_ec25_4c0e_8194_104673ccfde1 = await saveQuestion(manager, {
      text: `¿Genera Aguas de limpieza / lixiviados de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Aguas de limpieza / lixiviados de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b43d080f_ec25_4c0e_8194_104673ccfde1,
      conditionValue: 'true',
    });

    const q_4d1703e9_fde9_45b2_82bf_93eb1ff81820 = await saveQuestion(manager, {
      text: `Unidad de medida para Aguas de limpieza / lixiviados de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b43d080f_ec25_4c0e_8194_104673ccfde1,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_4d1703e9_fde9_45b2_82bf_93eb1ff81820, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_b0c85d48_b6e9_4fc8_a330_caa58a9fa654 = await saveQuestion(manager, {
      text: `Manejo actual de Aguas de limpieza / lixiviados de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b43d080f_ec25_4c0e_8194_104673ccfde1,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b0c85d48_b6e9_4fc8_a330_caa58a9fa654, [
      { text: `Aprovechamiento energético` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Otro` },
      { text: `Venta o donación` },
      { text: `Quema` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Aguas de limpieza / lixiviados de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b43d080f_ec25_4c0e_8194_104673ccfde1,
      conditionValue: 'true',
    });

    const q_f703ce82_0407_4fc2_99e2_b65b5b3af4ba = await saveQuestion(manager, {
      text: `¿Genera Residuos de empaque de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Residuos de empaque de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f703ce82_0407_4fc2_99e2_b65b5b3af4ba,
      conditionValue: 'true',
    });

    const q_99c437bf_305c_46a3_a391_0e6c251bb8b2 = await saveQuestion(manager, {
      text: `Unidad de medida para Residuos de empaque de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f703ce82_0407_4fc2_99e2_b65b5b3af4ba,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_99c437bf_305c_46a3_a391_0e6c251bb8b2, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_c5d96d8d_7cdf_4818_b53c_0e0643f1ba81 = await saveQuestion(manager, {
      text: `Manejo actual de Residuos de empaque de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f703ce82_0407_4fc2_99e2_b65b5b3af4ba,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c5d96d8d_7cdf_4818_b53c_0e0643f1ba81, [
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Venta o donación` },
      { text: `Otro` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Residuos de empaque de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f703ce82_0407_4fc2_99e2_b65b5b3af4ba,
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

    const q_ff70e1e6_b71f_4ae5_af53_7402aa70cc4b = await saveQuestion(manager, {
      text: `¿El material es fibroso o denso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_ff70e1e6_b71f_4ae5_af53_7402aa70cc4b, [
      { text: `Fibroso` },
      { text: `Denso` },
      { text: `Mixto` },
    ]);

    const q_9493da7b_108c_4b69_8dc7_c9274fe0b89d = await saveQuestion(manager, {
      text: `¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_9493da7b_108c_4b69_8dc7_c9274fe0b89d = await saveOptions(manager, q_9493da7b_108c_4b69_8dc7_c9274fe0b89d, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);
    const opt_01654016_49af_4eb1_9345_ad7233e9d53c = opts_9493da7b_108c_4b69_8dc7_c9274fe0b89d.get(`Sí`)!;

    const q_48366a48_f11d_46b1_bbe4_32476668f440 = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de la caracterización con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_9493da7b_108c_4b69_8dc7_c9274fe0b89d,
      conditionValue: opt_01654016_49af_4eb1_9345_ad7233e9d53c,
    });
    await saveOptions(manager, q_48366a48_f11d_46b1_bbe4_32476668f440, [
      { text: `Sí` },
      { text: `No` },
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

    const q_816c9efa_c0d9_4980_a8ef_bc4c25fcac64 = await saveQuestion(manager, {
      text: `¿Bajo qué condiciones se almacena actualmente el residuo?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_816c9efa_c0d9_4980_a8ef_bc4c25fcac64, [
      { text: `En silos` },
      { text: `En cuarto controlado` },
      { text: `Contacto directo con suelo` },
      { text: `A la intemperie` },
      { text: `Bajo techo sin control` },
    ]);

    const q_287bfa05_3f5c_489c_9ab2_d7a8808d232d = await saveQuestion(manager, {
      text: `¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_287bfa05_3f5c_489c_9ab2_d7a8808d232d, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    const q_654cda7b_5dd1_468d_bc37_be48dd3aa9a5 = await saveQuestion(manager, {
      text: `¿Sería posible enviar los residuos secos al laboratorio del proyecto?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_654cda7b_5dd1_468d_bc37_be48dd3aa9a5, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Se aplican agentes químicos durante el cultivo o poscosecha (pesticidas, fungicidas)? Liste los agentes empleados.`,
      type: types.open_text,
      isRequired: true,
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

    const q_f454344c_fa4e_438c_ae80_497621c883e9 = await saveQuestion(manager, {
      text: `¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_f454344c_fa4e_438c_ae80_497621c883e9, [
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

    const q_0e4f8de0_b91b_4287_9856_c59e331dc47f = await saveQuestion(manager, {
      text: `¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_0e4f8de0_b91b_4287_9856_c59e331dc47f = await saveOptions(manager, q_0e4f8de0_b91b_4287_9856_c59e331dc47f, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);
    const opt_b454b752_22b1_4128_9223_8be2c9e0b0fa = opts_0e4f8de0_b91b_4287_9856_c59e331dc47f.get(`Sí`)!;

    const q_cb08835e_4937_496e_8977_01abc38104bb = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de metales pesados con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_0e4f8de0_b91b_4287_9856_c59e331dc47f,
      conditionValue: opt_b454b752_22b1_4128_9223_8be2c9e0b0fa,
    });
    await saveOptions(manager, q_cb08835e_4937_496e_8977_01abc38104bb, [
      { text: `Sí` },
      { text: `No` },
    ]);

  }

  // ── 6.3 Interés en Valorización de Residuos ──
  {
    let o = 1;

    const q_bf827a5d_112d_49a1_809b_a2f5dde6b87f = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a reutilizar / valorizar sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_bf827a5d_112d_49a1_809b_a2f5dde6b87f, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_4affdfe9_56d8_4219_8bf8_39991bc7af2e = await saveQuestion(manager, {
      text: `¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_4affdfe9_56d8_4219_8bf8_39991bc7af2e, [
      { text: `Ingredientes funcionales / cosméticos` },
      { text: `Producción de energía (biochar, biogás)` },
      { text: `Fertilizantes / abonos` },
      { text: `Tratamiento de agua (filtros, carbón activado)` },
      { text: `Materiales / empaques` },
    ]);

    const q_2ffcc8f8_affa_4f22_9b79_ebe852142317 = await saveQuestion(manager, {
      text: `¿Ha escuchado sobre la generación de energía a partir de residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_2ffcc8f8_affa_4f22_9b79_ebe852142317, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Actualmente aprovecha algún residuo para generar energía?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec3,
    });

    const q_ef2d0e6c_2744_4082_af7c_8d32d327662a = await saveQuestion(manager, {
      text: `¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_ef2d0e6c_2744_4082_af7c_8d32d327662a, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué uso le daría a esa energía?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_1db92462_9ad5_4b4a_8eab_edf56a0695e4 = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_1db92462_9ad5_4b4a_8eab_edf56a0695e4, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_29ae3590_84fb_4620_8f6f_9ca918ede0be = await saveQuestion(manager, {
      text: `¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_29ae3590_84fb_4620_8f6f_9ca918ede0be, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_9b85a92a_9f7f_408f_9afd_87e57a19e4ee = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_9b85a92a_9f7f_408f_9afd_87e57a19e4ee, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_b1c4c684_59e3_45db_b708_e68a4bb15e37 = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_b1c4c684_59e3_45db_b708_e68a4bb15e37, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_37644cf3_11a2_4548_91f8_13449b15df2d = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes biocosméticos?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_37644cf3_11a2_4548_91f8_13449b15df2d, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_abf4fea9_799a_45b0_818d_a3cd1ba98eef = await saveQuestion(manager, {
      text: `¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_abf4fea9_799a_45b0_818d_a3cd1ba98eef, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_3607436e_c398_404b_bd34_9f2b147a5374 = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_3607436e_c398_404b_bd34_9f2b147a5374, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
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

  }

  console.log(`[seed] "${NAME}" insertado (55 preguntas).`);
}
