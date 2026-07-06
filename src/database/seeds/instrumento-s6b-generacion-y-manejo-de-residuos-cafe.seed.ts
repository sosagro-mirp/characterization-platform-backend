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

const NAME = `S6B: Generación y Manejo de Residuos — Café`;
const VERSION = 1;

export async function seedInstrumentoS6bGeneracionYManejoDeResiduosCafe(manager: EntityManager): Promise<void> {
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
    sectionRepo.save(sectionRepo.create({ name: `Tabla de Residuos por Cultivo`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Caracterización Detallada de Residuos`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Interés en Valorización de Residuos`, order: 3, instrument }))
  ]);

  // ── Tabla de Residuos por Cultivo ──
  {
    let o = 1;

    const q_692ec409_44c7_4a44_ba75_22db34319693 = await saveQuestion(manager, {
      text: `¿Genera Pulpa de café (despulpado)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Pulpa de café (despulpado)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_692ec409_44c7_4a44_ba75_22db34319693,
      conditionValue: 'true',
    });

    const q_27caa290_9f6a_4ae1_b081_168ff5e0b5d1 = await saveQuestion(manager, {
      text: `Unidad de medida para Pulpa de café (despulpado)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_692ec409_44c7_4a44_ba75_22db34319693,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_27caa290_9f6a_4ae1_b081_168ff5e0b5d1, [
      { text: `kg` },
      { text: `t` },
      { text: `L` },
    ]);

    const q_a3239178_9976_4d9d_9254_e0529aa1e627 = await saveQuestion(manager, {
      text: `Manejo actual de Pulpa de café (despulpado)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_692ec409_44c7_4a44_ba75_22db34319693,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_a3239178_9976_4d9d_9254_e0529aa1e627, [
      { text: `Incorporación al suelo / compostaje` },
      { text: `Abandono en campo` },
      { text: `Alimentación animal` },
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Quema` },
      { text: `Otro` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Pulpa de café (despulpado)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_692ec409_44c7_4a44_ba75_22db34319693,
      conditionValue: 'true',
    });

    const q_4be0077c_8fed_40be_9836_68491318c3e3 = await saveQuestion(manager, {
      text: `¿Genera Mucílago de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Mucílago de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_4be0077c_8fed_40be_9836_68491318c3e3,
      conditionValue: 'true',
    });

    const q_291329fb_a130_44f4_9c83_64ffa620a150 = await saveQuestion(manager, {
      text: `Unidad de medida para Mucílago de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_4be0077c_8fed_40be_9836_68491318c3e3,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_291329fb_a130_44f4_9c83_64ffa620a150, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_85137b2b_16cf_4480_a33e_3238a54e5e57 = await saveQuestion(manager, {
      text: `Manejo actual de Mucílago de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_4be0077c_8fed_40be_9836_68491318c3e3,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_85137b2b_16cf_4480_a33e_3238a54e5e57, [
      { text: `Ningún manejo especial` },
      { text: `Venta o donación` },
      { text: `Quema` },
      { text: `Aprovechamiento energético` },
      { text: `Otro` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Mucílago de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_4be0077c_8fed_40be_9836_68491318c3e3,
      conditionValue: 'true',
    });

    const q_d0d17612_0c0f_4f06_822b_d4aacb6dc43d = await saveQuestion(manager, {
      text: `¿Genera Aguas mieles de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Aguas mieles de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d0d17612_0c0f_4f06_822b_d4aacb6dc43d,
      conditionValue: 'true',
    });

    const q_7aa93771_31d1_4ba1_b282_969178ed236d = await saveQuestion(manager, {
      text: `Unidad de medida para Aguas mieles de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d0d17612_0c0f_4f06_822b_d4aacb6dc43d,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_7aa93771_31d1_4ba1_b282_969178ed236d, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_07f3e5dd_0566_4bb0_b477_ba086706895e = await saveQuestion(manager, {
      text: `Manejo actual de Aguas mieles de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d0d17612_0c0f_4f06_822b_d4aacb6dc43d,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_07f3e5dd_0566_4bb0_b477_ba086706895e, [
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Aguas mieles de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d0d17612_0c0f_4f06_822b_d4aacb6dc43d,
      conditionValue: 'true',
    });

    const q_d3af368c_d9ca_49f4_a692_5e64337ba926 = await saveQuestion(manager, {
      text: `¿Genera Cisco / cascarilla de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Cisco / cascarilla de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d3af368c_d9ca_49f4_a692_5e64337ba926,
      conditionValue: 'true',
    });

    const q_e9fdcd78_b568_4e9b_85ab_9ffc20891c41 = await saveQuestion(manager, {
      text: `Unidad de medida para Cisco / cascarilla de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d3af368c_d9ca_49f4_a692_5e64337ba926,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_e9fdcd78_b568_4e9b_85ab_9ffc20891c41, [
      { text: `t` },
      { text: `L` },
      { text: `kg` },
    ]);

    const q_6f478632_f9c4_4c7d_bd45_db932684d59f = await saveQuestion(manager, {
      text: `Manejo actual de Cisco / cascarilla de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d3af368c_d9ca_49f4_a692_5e64337ba926,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_6f478632_f9c4_4c7d_bd45_db932684d59f, [
      { text: `Otro` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Cisco / cascarilla de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_d3af368c_d9ca_49f4_a692_5e64337ba926,
      conditionValue: 'true',
    });

    const q_399e164c_f4bc_4716_ab7f_78e5bb7f462a = await saveQuestion(manager, {
      text: `¿Genera Café de segunda (granos defectuosos)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Café de segunda (granos defectuosos)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_399e164c_f4bc_4716_ab7f_78e5bb7f462a,
      conditionValue: 'true',
    });

    const q_747d6c02_b12d_4bb9_bfb7_70e6b6bf4de2 = await saveQuestion(manager, {
      text: `Unidad de medida para Café de segunda (granos defectuosos)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_399e164c_f4bc_4716_ab7f_78e5bb7f462a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_747d6c02_b12d_4bb9_bfb7_70e6b6bf4de2, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_d04c1386_bd9c_4008_a677_55e6bc8153be = await saveQuestion(manager, {
      text: `Manejo actual de Café de segunda (granos defectuosos)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_399e164c_f4bc_4716_ab7f_78e5bb7f462a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_d04c1386_bd9c_4008_a677_55e6bc8153be, [
      { text: `Incorporación al suelo / compostaje` },
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Abandono en campo` },
      { text: `Alimentación animal` },
      { text: `Quema` },
      { text: `Otro` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Café de segunda (granos defectuosos)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_399e164c_f4bc_4716_ab7f_78e5bb7f462a,
      conditionValue: 'true',
    });

    const q_b5de82ed_3012_4b28_abb9_9c496365799c = await saveQuestion(manager, {
      text: `¿Genera Restos de poda de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Cantidad estimada por año de Restos de poda de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b5de82ed_3012_4b28_abb9_9c496365799c,
      conditionValue: 'true',
    });

    const q_82e494b0_2823_4065_b29b_755d9a9f83d2 = await saveQuestion(manager, {
      text: `Unidad de medida para Restos de poda de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b5de82ed_3012_4b28_abb9_9c496365799c,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_82e494b0_2823_4065_b29b_755d9a9f83d2, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_b3b885de_1125_4199_ae79_3126c0a706f3 = await saveQuestion(manager, {
      text: `Manejo actual de Restos de poda de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b5de82ed_3012_4b28_abb9_9c496365799c,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b3b885de_1125_4199_ae79_3126c0a706f3, [
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Otro` },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
    ]);

    await saveQuestion(manager, {
      text: `Efectos negativos observados de Restos de poda de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b5de82ed_3012_4b28_abb9_9c496365799c,
      conditionValue: 'true',
    });

  }

  // ── Caracterización Detallada de Residuos ──
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

    const q_29b1e63b_e178_4b71_82bf_b00724788cf9 = await saveQuestion(manager, {
      text: `¿El material es fibroso o denso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_29b1e63b_e178_4b71_82bf_b00724788cf9, [
      { text: `Denso` },
      { text: `Fibroso` },
      { text: `Mixto` },
    ]);

    const q_50a03f41_74a5_4698_b39c_a11a0894d2ef = await saveQuestion(manager, {
      text: `¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_50a03f41_74a5_4698_b39c_a11a0894d2ef = await saveOptions(manager, q_50a03f41_74a5_4698_b39c_a11a0894d2ef, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);
    const opt_0dcb81ee_2103_49fd_8901_7b06e8d0db04 = opts_50a03f41_74a5_4698_b39c_a11a0894d2ef.get(`Sí`)!;

    const q_b3b74a8e_2f3b_47fd_bd1d_a5a10b8bdb6a = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de la caracterización con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_50a03f41_74a5_4698_b39c_a11a0894d2ef,
      conditionValue: opt_0dcb81ee_2103_49fd_8901_7b06e8d0db04,
    });
    await saveOptions(manager, q_b3b74a8e_2f3b_47fd_bd1d_a5a10b8bdb6a, [
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

    const q_9fd05110_c168_4645_be18_2dcd3a9e5a2c = await saveQuestion(manager, {
      text: `¿Bajo qué condiciones se almacena actualmente el residuo?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_9fd05110_c168_4645_be18_2dcd3a9e5a2c, [
      { text: `En cuarto controlado` },
      { text: `Contacto directo con suelo` },
      { text: `En silos` },
      { text: `Bajo techo sin control` },
      { text: `A la intemperie` },
    ]);

    const q_abec22d1_3909_4d5f_ac60_c0820d51c0c3 = await saveQuestion(manager, {
      text: `¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_abec22d1_3909_4d5f_ac60_c0820d51c0c3, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_ef258e73_fa65_4a00_8507_a0ecdfb3d577 = await saveQuestion(manager, {
      text: `¿Sería posible enviar los residuos secos al laboratorio del proyecto?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_ef258e73_fa65_4a00_8507_a0ecdfb3d577, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
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

    const q_e9bdd1b9_e372_4572_b276_bdedb3fd7626 = await saveQuestion(manager, {
      text: `¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_e9bdd1b9_e372_4572_b276_bdedb3fd7626, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuál es la temperatura promedio del área de almacenamiento? (°C)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_1291925d_2725_4daa_9c73_c936ba954ea0 = await saveQuestion(manager, {
      text: `¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    const opts_1291925d_2725_4daa_9c73_c936ba954ea0 = await saveOptions(manager, q_1291925d_2725_4daa_9c73_c936ba954ea0, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);
    const opt_73cdf984_60ed_48ec_9034_c22256fc40d4 = opts_1291925d_2725_4daa_9c73_c936ba954ea0.get(`Sí`)!;

    const q_e997afa5_a104_44fe_91b8_f88b4c983dca = await saveQuestion(manager, {
      text: `¿Puede compartir los resultados de metales pesados con el proyecto?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_1291925d_2725_4daa_9c73_c936ba954ea0,
      conditionValue: opt_73cdf984_60ed_48ec_9034_c22256fc40d4,
    });
    await saveOptions(manager, q_e997afa5_a104_44fe_91b8_f88b4c983dca, [
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuánto tiempo (horas) pasa desde que el residuo sale de la despulpadora hasta que se estabiliza?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_49b108dc_12be_4420_939a_69f54449c92a = await saveQuestion(manager, {
      text: `Si conoce los azúcares del proceso de fermentación, ¿predominan hexosas (C6: glucosa, fructosa) o pentosas (C5: xilosa)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_49b108dc_12be_4420_939a_69f54449c92a, [
      { text: `Pentosas (C5): xilosa` },
      { text: `No sabe` },
      { text: `Hexosas (C6): glucosa, fructosa` },
    ]);

  }

  // ── Interés en Valorización de Residuos ──
  {
    let o = 1;

    const q_db9d8d78_cc17_4c15_bdbe_9cbf99e1c3bc = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a reutilizar / valorizar sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_db9d8d78_cc17_4c15_bdbe_9cbf99e1c3bc, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_aaab1815_8ffb_468b_85e3_9d926325363c = await saveQuestion(manager, {
      text: `¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_aaab1815_8ffb_468b_85e3_9d926325363c, [
      { text: `Producción de energía (biochar, biogás)` },
      { text: `Fertilizantes / abonos` },
      { text: `Tratamiento de agua (filtros, carbón activado)` },
      { text: `Materiales / empaques` },
      { text: `Ingredientes funcionales / cosméticos` },
    ]);

    const q_8c9e9320_3267_4f99_b60b_80eddfc1f056 = await saveQuestion(manager, {
      text: `¿Ha escuchado sobre la generación de energía a partir de residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_8c9e9320_3267_4f99_b60b_80eddfc1f056, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Actualmente aprovecha algún residuo para generar energía?`,
      type: types.yes_no,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });

    const q_95d6a9a5_3328_4959_8fe7_44c84ca9410b = await saveQuestion(manager, {
      text: `¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_95d6a9a5_3328_4959_8fe7_44c84ca9410b, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué uso le daría a esa energía?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_12ede220_38b7_4946_9e43_ad0d35966d2c = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_12ede220_38b7_4946_9e43_ad0d35966d2c, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_9b8f1f8c_a123_451c_b345_8979625053fd = await saveQuestion(manager, {
      text: `¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_9b8f1f8c_a123_451c_b345_8979625053fd, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_ca241921_0c64_472b_b479_41cd2943e5ea = await saveQuestion(manager, {
      text: `¿Le interesaría usar sus residuos para tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_ca241921_0c64_472b_b479_41cd2943e5ea, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_719e7547_bf35_4643_94c8_5aab52f43178 = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_719e7547_bf35_4643_94c8_5aab52f43178, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_c0ab3c98_900a_45ce_9ae9_c1ed21cd2b62 = await saveQuestion(manager, {
      text: `¿Sus residuos podrían tener potencial para ingredientes biocosméticos?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_c0ab3c98_900a_45ce_9ae9_c1ed21cd2b62, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_0eaac7c2_2f85_415b_9315_b213b92c227c = await saveQuestion(manager, {
      text: `¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_0eaac7c2_2f85_415b_9315_b213b92c227c, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_6be1ac42_dbe8_4f1a_acdb_63a3b64986fd = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_6be1ac42_dbe8_4f1a_acdb_63a3b64986fd, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué factor considera más importante al evaluar una tecnología de valorización de residuos?`,
      type: types.open_text,
      isRequired: true,
      isKeyQuestion: true,
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
      text: `Me sería útil una app que me mostrara opciones de valorización para los residuos de café que genero (pulpa, mucílago, aguas mieles), con instrucciones paso a paso para implementarlas.`,
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
      text: `Me gustaría recibir en mi celular alertas sobre programas o proyectos cercanos que compran o aprovechan residuos del cultivo de café.`,
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
      text: `Me sería útil llevar en una app un registro de las cantidades de residuos de café que genero por cosecha, para estimar su potencial de valorización y acceder a incentivos ambientales.`,
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
      text: `Preferiría recibir guías de manejo de residuos de café en formato de video corto o audio, para usarlas mientras trabajo.`,
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

  console.log(`[seed] "${NAME}" insertado (75 preguntas).`);
}
