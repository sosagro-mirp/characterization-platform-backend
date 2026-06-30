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

const NAME = `S6D: Generación y Manejo de Residuos — Cáñamo`;
const VERSION = 1;

export async function seedInstrumentoS6dGeneracionYManejoDeResiduosCanamo(manager: EntityManager): Promise<void> {
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

    const q_bce403f9_524b_43ff_adc2_f0b4925c0c00 = await saveQuestion(manager, {
      text: `¿Genera Cáscara / agramiza (fibra corta de cáñamo)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_bce403f9_524b_43ff_adc2_f0b4925c0c00,
      conditionValue: 'true',
    });

    const q_88a1a548_058f_4de9_8cf6_2566f29c5c8d = await saveQuestion(manager, {
      text: `Unidad de medida para Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_bce403f9_524b_43ff_adc2_f0b4925c0c00,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_88a1a548_058f_4de9_8cf6_2566f29c5c8d, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_79e2a545_0662_4738_906e_aae9869cc794 = await saveQuestion(manager, {
      text: `Manejo actual de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_bce403f9_524b_43ff_adc2_f0b4925c0c00,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_79e2a545_0662_4738_906e_aae9869cc794, [
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Otro` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Abandono en campo` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_bce403f9_524b_43ff_adc2_f0b4925c0c00,
      conditionValue: 'true',
    });

    const q_0efe86f6_70e4_4c52_9854_fbe3de365950 = await saveQuestion(manager, {
      text: `¿Genera Semillas partidas o imperfectas de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Semillas partidas o imperfectas de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0efe86f6_70e4_4c52_9854_fbe3de365950,
      conditionValue: 'true',
    });

    const q_64a7cd3d_a047_4caf_89d9_d83f8aa135e9 = await saveQuestion(manager, {
      text: `Unidad de medida para Semillas partidas o imperfectas de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0efe86f6_70e4_4c52_9854_fbe3de365950,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_64a7cd3d_a047_4caf_89d9_d83f8aa135e9, [
      { text: `t` },
      { text: `L` },
      { text: `kg` },
    ]);

    const q_15fa6c46_26c1_46e1_b9d7_f7f51f04bec6 = await saveQuestion(manager, {
      text: `Manejo actual de Semillas partidas o imperfectas de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0efe86f6_70e4_4c52_9854_fbe3de365950,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_15fa6c46_26c1_46e1_b9d7_f7f51f04bec6, [
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Otro` },
      { text: `Venta o donación` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
      { text: `Abandono en campo` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Semillas partidas o imperfectas de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0efe86f6_70e4_4c52_9854_fbe3de365950,
      conditionValue: 'true',
    });

    const q_0569e59f_9f4b_4747_adcb_5b3a19c56c36 = await saveQuestion(manager, {
      text: `¿Genera Torta de semilla post-prensado de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Torta de semilla post-prensado de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0569e59f_9f4b_4747_adcb_5b3a19c56c36,
      conditionValue: 'true',
    });

    const q_c3bbb7c2_bf6c_4b01_992c_f97fdb36fbac = await saveQuestion(manager, {
      text: `Unidad de medida para Torta de semilla post-prensado de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0569e59f_9f4b_4747_adcb_5b3a19c56c36,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c3bbb7c2_bf6c_4b01_992c_f97fdb36fbac, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_5f6143ba_ca8d_4789_89e6_d2b1f3c67434 = await saveQuestion(manager, {
      text: `Manejo actual de Torta de semilla post-prensado de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0569e59f_9f4b_4747_adcb_5b3a19c56c36,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_5f6143ba_ca8d_4789_89e6_d2b1f3c67434, [
      { text: `Abandono en campo` },
      { text: `Ningún manejo especial` },
      { text: `Venta o donación` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
      { text: `Otro` },
      { text: `Aprovechamiento energético` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Torta de semilla post-prensado de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_0569e59f_9f4b_4747_adcb_5b3a19c56c36,
      conditionValue: 'true',
    });

    const q_d4512e93_e437_4853_8949_84aa4124bac8 = await saveQuestion(manager, {
      text: `¿Genera Aguas de proceso de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Aguas de proceso de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d4512e93_e437_4853_8949_84aa4124bac8,
      conditionValue: 'true',
    });

    const q_2297b118_1c6b_4271_ae6b_d9e878d6fd33 = await saveQuestion(manager, {
      text: `Unidad de medida para Aguas de proceso de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d4512e93_e437_4853_8949_84aa4124bac8,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_2297b118_1c6b_4271_ae6b_d9e878d6fd33, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_6d905370_6fb2_4742_afcd_68e8f6f55c1c = await saveQuestion(manager, {
      text: `Manejo actual de Aguas de proceso de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d4512e93_e437_4853_8949_84aa4124bac8,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_6d905370_6fb2_4742_afcd_68e8f6f55c1c, [
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro` },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Aguas de proceso de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d4512e93_e437_4853_8949_84aa4124bac8,
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

    const q_3494aa4e_8d7b_4afc_b17c_d84c61b3fc36 = await saveQuestion(manager, {
      text: `¿El material es fibroso o denso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_3494aa4e_8d7b_4afc_b17c_d84c61b3fc36, [
      { text: `Denso` },
      { text: `Fibroso` },
      { text: `Mixto` },
    ]);

    const q_d51e20a0_257f_40c2_b32f_f4b707fd68bc = await saveQuestion(manager, {
      text: `¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_d51e20a0_257f_40c2_b32f_f4b707fd68bc = await saveOptions(manager, q_d51e20a0_257f_40c2_b32f_f4b707fd68bc, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);
    const opt_73542075_bf6b_45e0_911e_24eab89615f6 = opts_d51e20a0_257f_40c2_b32f_f4b707fd68bc.get(`Sí`)!;

    const q_fe570219_f9ea_4c59_9275_8829704c7a3b = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de la caracterización con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_d51e20a0_257f_40c2_b32f_f4b707fd68bc,
      conditionValue: opt_73542075_bf6b_45e0_911e_24eab89615f6,
    });
    await saveOptions(manager, q_fe570219_f9ea_4c59_9275_8829704c7a3b, [
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

    const q_2f20f1f3_daa9_4b0d_be76_7f39eaa5e09d = await saveQuestion(manager, {
      text: `¿Bajo qué condiciones se almacena actualmente el residuo?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_2f20f1f3_daa9_4b0d_be76_7f39eaa5e09d, [
      { text: `En silos` },
      { text: `En cuarto controlado` },
      { text: `Contacto directo con suelo` },
      { text: `Bajo techo sin control` },
      { text: `A la intemperie` },
    ]);

    const q_cae92f08_8933_412e_8d28_d26717f93d8a = await saveQuestion(manager, {
      text: `¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_cae92f08_8933_412e_8d28_d26717f93d8a, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_f79580bd_bfee_4b19_be05_d736c82c4e27 = await saveQuestion(manager, {
      text: `¿Sería posible enviar los residuos secos al laboratorio del proyecto?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_f79580bd_bfee_4b19_be05_d736c82c4e27, [
      { text: `No` },
      { text: `No sabe / No aplica` },
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

    const q_c81ea46c_f0dd_40e3_b0e7_087163d7bc3e = await saveQuestion(manager, {
      text: `¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_c81ea46c_f0dd_40e3_b0e7_087163d7bc3e, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuál es la temperatura promedio del área de almacenamiento? (°C)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_00076bf6_53fa_4cd5_95c2_57fd5b346ee0 = await saveQuestion(manager, {
      text: `¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_00076bf6_53fa_4cd5_95c2_57fd5b346ee0 = await saveOptions(manager, q_00076bf6_53fa_4cd5_95c2_57fd5b346ee0, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);
    const opt_a1831b78_d1cf_484c_b997_37f9161926c8 = opts_00076bf6_53fa_4cd5_95c2_57fd5b346ee0.get(`Sí`)!;

    const q_e02255bf_7a6f_44fb_b267_d43c2ce7e0e3 = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de metales pesados con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_00076bf6_53fa_4cd5_95c2_57fd5b346ee0,
      conditionValue: opt_a1831b78_d1cf_484c_b997_37f9161926c8,
    });
    await saveOptions(manager, q_e02255bf_7a6f_44fb_b267_d43c2ce7e0e3, [
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué residuos genera? Nombre todos los residuos de estos cultivos.`,
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

    const q_b01c1e72_bfec_402f_a5d3_f47873fa9624 = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a reutilizar / valorizar sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_b01c1e72_bfec_402f_a5d3_f47873fa9624, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_69b5a5c5_ba63_46ad_b968_863c6980da65 = await saveQuestion(manager, {
      text: `¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_69b5a5c5_ba63_46ad_b968_863c6980da65, [
      { text: `Tratamiento de agua (filtros, carbón activado)` },
      { text: `Producción de energía (biochar, biogás)` },
      { text: `Materiales / empaques` },
      { text: `Ingredientes funcionales / cosméticos` },
      { text: `Fertilizantes / abonos` },
    ]);

    const q_20c88172_4fe6_4928_a84b_e05609eae9cc = await saveQuestion(manager, {
      text: `¿Ha escuchado sobre la generación de energía a partir de residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_20c88172_4fe6_4928_a84b_e05609eae9cc, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Actualmente aprovecha algún residuo para generar energía?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec3,
    });

    const q_a91c4df4_1e12_4bdf_8eaa_7f3b19e63976 = await saveQuestion(manager, {
      text: `¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_a91c4df4_1e12_4bdf_8eaa_7f3b19e63976, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué uso le daría a esa energía?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_a085ede4_691a_4f1c_a795_eb4807dcd04f = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_a085ede4_691a_4f1c_a795_eb4807dcd04f, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    const q_d0854b09_4e2a_418a_b56d_652e412bc44e = await saveQuestion(manager, {
      text: `¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_d0854b09_4e2a_418a_b56d_652e412bc44e, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_5f12495e_d831_43a2_bb34_7f3db565e777 = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_5f12495e_d831_43a2_bb34_7f3db565e777, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_bf1a6fa4_7eee_4ca6_a301_e665f27289dd = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_bf1a6fa4_7eee_4ca6_a301_e665f27289dd, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_9197ecb3_3cc0_4b87_8649_86d5549d7a85 = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes biocosméticos?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_9197ecb3_3cc0_4b87_8649_86d5549d7a85, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_80e8d890_93ea_456e_9b0c_72fc9ba145fc = await saveQuestion(manager, {
      text: `¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_80e8d890_93ea_456e_9b0c_72fc9ba145fc, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_9e548ddf_0381_4bd8_84f7_9c302c5dc0cf = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_9e548ddf_0381_4bd8_84f7_9c302c5dc0cf, [
      { text: `No` },
      { text: `No sabe / No aplica` },
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

  console.log(`[seed] "${NAME}" insertado (57 preguntas).`);
}
