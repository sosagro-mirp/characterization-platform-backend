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
    order: number;
    section: Section;
    conditionQuestion?: Question;
    conditionValue?: string;
  },
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
  }));
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
    }));
    map.set(opt.text, saved.optionId);
  }
  return map;
}

const NAME = `S6: Generación y Manejo de Residuos / Biomasa`;
const VERSION = 1;

export async function seedInstrumentoS6GeneracionYManejoDeResiduosBiomasa(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["yes_no","numeric","single_choice","open_text","multiple_choice"];
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
      isActive: true,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `6.1 Tabla de Residuos por Cultivo`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `6.2 Caracterización Detallada de Residuos`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `6.3 Interés en Valorización de Residuos`, order: 3, instrument })),
  ]);

  // ── 6.1 Tabla de Residuos por Cultivo ──
  {
    let o = 1;

    const q_a3d34dc3_8ef1_4cff_94f4_45b3d8537072 = await saveQuestion(manager, {
      text: `6.1.1 — ¿Genera cáscara de mazorca de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.1 — Cantidad estimada por año de cáscara de mazorca de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a3d34dc3_8ef1_4cff_94f4_45b3d8537072,
      conditionValue: 'true',
    });

    const q_26ae6578_741a_4562_9397_1431ead0faee = await saveQuestion(manager, {
      text: `6.1.1 — Unidad de medida para Cáscara / cascarilla de mazorca de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a3d34dc3_8ef1_4cff_94f4_45b3d8537072,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_26ae6578_741a_4562_9397_1431ead0faee, [
      { text: `t` },
      { text: `L` },
      { text: `kg` },
    ]);

    const q_a1ac315f_cf69_4f2c_a0ff_652e85a71507 = await saveQuestion(manager, {
      text: `6.1.1 — Manejo actual de Cáscara / cascarilla de mazorca de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a3d34dc3_8ef1_4cff_94f4_45b3d8537072,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_a1ac315f_cf69_4f2c_a0ff_652e85a71507, [
      { text: `Quema` },
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Aprovechamiento energético` },
      { text: `Ningún manejo especial` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `6.1.1 — Efectos negativos observados de Cáscara / cascarilla de mazorca de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a3d34dc3_8ef1_4cff_94f4_45b3d8537072,
      conditionValue: 'true',
    });

    const q_3dc6d0b3_5228_4de3_9d4a_41603f11294a = await saveQuestion(manager, {
      text: `6.1.2 — ¿Genera Mucílago / baba de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.2 — Cantidad estimada por año de Mucílago / baba de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3dc6d0b3_5228_4de3_9d4a_41603f11294a,
      conditionValue: 'true',
    });

    const q_91689590_b09d_45e8_afbf_971d39283fd7 = await saveQuestion(manager, {
      text: `6.1.2 — Unidad de medida para Mucílago / baba de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3dc6d0b3_5228_4de3_9d4a_41603f11294a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_91689590_b09d_45e8_afbf_971d39283fd7, [
      { text: `kg` },
      { text: `t` },
      { text: `L` },
    ]);

    const q_e07562c4_81be_49e2_9bd6_bace4f8c58c5 = await saveQuestion(manager, {
      text: `6.1.2 — Manejo actual de Mucílago / baba de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3dc6d0b3_5228_4de3_9d4a_41603f11294a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_e07562c4_81be_49e2_9bd6_bace4f8c58c5, [
      { text: `Venta o donación` },
      { text: `Ningún manejo especial` },
      { text: `Otro`, isOther: true },
      { text: `Aprovechamiento energético` },
      { text: `Abandono en campo` },
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.2 — Efectos negativos observados de Mucílago / baba de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3dc6d0b3_5228_4de3_9d4a_41603f11294a,
      conditionValue: 'true',
    });

    const q_f5526794_ba95_494b_8ac0_60e0501408ba = await saveQuestion(manager, {
      text: `6.1.3 — ¿Genera Semillas defectuosas / cacao de baja calidad?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.3 — Cantidad estimada por año de Semillas defectuosas / cacao de baja calidad`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f5526794_ba95_494b_8ac0_60e0501408ba,
      conditionValue: 'true',
    });

    const q_970bc7bd_89fd_4b44_97e4_ba3b3ae9bbbd = await saveQuestion(manager, {
      text: `6.1.3 — Unidad de medida para Semillas defectuosas / cacao de baja calidad`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f5526794_ba95_494b_8ac0_60e0501408ba,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_970bc7bd_89fd_4b44_97e4_ba3b3ae9bbbd, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_17e40066_2bef_450b_b13b_8e1501aedcbe = await saveQuestion(manager, {
      text: `6.1.3 — Manejo actual de Semillas defectuosas / cacao de baja calidad`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f5526794_ba95_494b_8ac0_60e0501408ba,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_17e40066_2bef_450b_b13b_8e1501aedcbe, [
      { text: `Venta o donación` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Quema` },
      { text: `Otro`, isOther: true },
      { text: `Aprovechamiento energético` },
      { text: `Ningún manejo especial` },
      { text: `Abandono en campo` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.3 — Efectos negativos observados de Semillas defectuosas / cacao de baja calidad`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f5526794_ba95_494b_8ac0_60e0501408ba,
      conditionValue: 'true',
    });

    const q_fb4d7d51_fbd8_47c2_a115_4da2851fcd7c = await saveQuestion(manager, {
      text: `6.1.4 — ¿Genera Aguas mieles del beneficio húmedo de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.4 — Cantidad estimada por año de Aguas mieles del beneficio húmedo de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fb4d7d51_fbd8_47c2_a115_4da2851fcd7c,
      conditionValue: 'true',
    });

    const q_904e00c6_17b3_4452_b3d1_360cb76204da = await saveQuestion(manager, {
      text: `6.1.4 — Unidad de medida para Aguas mieles del beneficio húmedo de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fb4d7d51_fbd8_47c2_a115_4da2851fcd7c,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_904e00c6_17b3_4452_b3d1_360cb76204da, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_a8f94953_ebac_4d85_a780_82c2a641e5fc = await saveQuestion(manager, {
      text: `6.1.4 — Manejo actual de Aguas mieles del beneficio húmedo de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fb4d7d51_fbd8_47c2_a115_4da2851fcd7c,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_a8f94953_ebac_4d85_a780_82c2a641e5fc, [
      { text: `Venta o donación` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Aprovechamiento energético` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.4 — Efectos negativos observados de Aguas mieles del beneficio húmedo de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fb4d7d51_fbd8_47c2_a115_4da2851fcd7c,
      conditionValue: 'true',
    });

    const q_42cdfaf1_81bb_4792_a7f4_bf619a191687 = await saveQuestion(manager, {
      text: `6.1.5 — ¿Genera Restos de poda de cacao?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.5 — Cantidad estimada por año de Restos de poda de cacao`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_42cdfaf1_81bb_4792_a7f4_bf619a191687,
      conditionValue: 'true',
    });

    const q_65d9ef9f_dc43_47eb_a024_e4cb8546c2a9 = await saveQuestion(manager, {
      text: `6.1.5 — Unidad de medida para Restos de poda de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_42cdfaf1_81bb_4792_a7f4_bf619a191687,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_65d9ef9f_dc43_47eb_a024_e4cb8546c2a9, [
      { text: `t` },
      { text: `L` },
      { text: `kg` },
    ]);

    const q_1fcbff35_6cce_43dc_900a_0c0187f4f112 = await saveQuestion(manager, {
      text: `6.1.5 — Manejo actual de Restos de poda de cacao`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_42cdfaf1_81bb_4792_a7f4_bf619a191687,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_1fcbff35_6cce_43dc_900a_0c0187f4f112, [
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Venta o donación` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Aprovechamiento energético` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `6.1.5 — Efectos negativos observados de Restos de poda de cacao`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_42cdfaf1_81bb_4792_a7f4_bf619a191687,
      conditionValue: 'true',
    });

    const q_b8fac4e7_58bd_43b4_88cb_524c38f1b43d = await saveQuestion(manager, {
      text: `6.1.6 — ¿Genera Cascarilla de cacao tostado?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.6 — Cantidad estimada por año de Cascarilla de cacao tostado`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b8fac4e7_58bd_43b4_88cb_524c38f1b43d,
      conditionValue: 'true',
    });

    const q_17e4c74b_32b8_4160_9cf7_a65c9f5e6d62 = await saveQuestion(manager, {
      text: `6.1.6 — Unidad de medida para Cascarilla de cacao tostado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b8fac4e7_58bd_43b4_88cb_524c38f1b43d,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_17e4c74b_32b8_4160_9cf7_a65c9f5e6d62, [
      { text: `kg` },
      { text: `t` },
      { text: `L` },
    ]);

    const q_06f68e29_f9b5_4168_b431_bd8cb1a1fada = await saveQuestion(manager, {
      text: `6.1.6 — Manejo actual de Cascarilla de cacao tostado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b8fac4e7_58bd_43b4_88cb_524c38f1b43d,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_06f68e29_f9b5_4168_b431_bd8cb1a1fada, [
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro`, isOther: true },
      { text: `Quema` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.6 — Efectos negativos observados de Cascarilla de cacao tostado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b8fac4e7_58bd_43b4_88cb_524c38f1b43d,
      conditionValue: 'true',
    });

    const q_ca880f10_1ed5_4102_a4eb_a2c679003676 = await saveQuestion(manager, {
      text: `6.1.otro-cacao — ¿Genera algún otro residuo de cacao no listado?`,
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
      conditionQuestion: q_ca880f10_1ed5_4102_a4eb_a2c679003676,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `6.1.otro-cacao — Cantidad estimada por año de otro residuo de cacao no listado`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_ca880f10_1ed5_4102_a4eb_a2c679003676,
      conditionValue: 'true',
    });

    const q_345dd7f5_102a_4491_a341_55aa96144a3c = await saveQuestion(manager, {
      text: `6.1.otro-cacao — Unidad de medida para otro residuo de cacao no listado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_ca880f10_1ed5_4102_a4eb_a2c679003676,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_345dd7f5_102a_4491_a341_55aa96144a3c, [
      { text: `t` },
      { text: `L` },
      { text: `kg` },
    ]);

    const q_5f2b0add_e450_4de4_a340_09feac37d567 = await saveQuestion(manager, {
      text: `6.1.otro-cacao — Manejo actual de otro residuo de cacao no listado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_ca880f10_1ed5_4102_a4eb_a2c679003676,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_5f2b0add_e450_4de4_a340_09feac37d567, [
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Abandono en campo` },
      { text: `Alimentación animal` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.otro-cacao — Efectos negativos observados de otro residuo de cacao no listado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_ca880f10_1ed5_4102_a4eb_a2c679003676,
      conditionValue: 'true',
    });

    const q_db7f632f_88e9_4202_949e_8bce426c5a6f = await saveQuestion(manager, {
      text: `6.1.7 — ¿Genera Pulpa de café (despulpado)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.7 — Cantidad estimada por año de Pulpa de café (despulpado)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_db7f632f_88e9_4202_949e_8bce426c5a6f,
      conditionValue: 'true',
    });

    const q_dabca238_d3f8_4bde_a6b1_ada3f42e77c1 = await saveQuestion(manager, {
      text: `6.1.7 — Unidad de medida para Pulpa de café (despulpado)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_db7f632f_88e9_4202_949e_8bce426c5a6f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_dabca238_d3f8_4bde_a6b1_ada3f42e77c1, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_526f780f_fa6e_40eb_8547_63cb48b3c81a = await saveQuestion(manager, {
      text: `6.1.7 — Manejo actual de Pulpa de café (despulpado)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_db7f632f_88e9_4202_949e_8bce426c5a6f,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_526f780f_fa6e_40eb_8547_63cb48b3c81a, [
      { text: `Quema` },
      { text: `Otro`, isOther: true },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.7 — Efectos negativos observados de Pulpa de café (despulpado)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_db7f632f_88e9_4202_949e_8bce426c5a6f,
      conditionValue: 'true',
    });

    const q_a2fb71dd_6968_47b4_96a7_c42292bb1369 = await saveQuestion(manager, {
      text: `6.1.8 — ¿Genera Mucílago de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.8 — Cantidad estimada por año de Mucílago de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a2fb71dd_6968_47b4_96a7_c42292bb1369,
      conditionValue: 'true',
    });

    const q_8c56bb48_8e26_40a6_8208_c2b16c242f44 = await saveQuestion(manager, {
      text: `6.1.8 — Unidad de medida para Mucílago de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a2fb71dd_6968_47b4_96a7_c42292bb1369,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_8c56bb48_8e26_40a6_8208_c2b16c242f44, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_a2879059_a23b_4ad7_8cbc_4d22b95b729d = await saveQuestion(manager, {
      text: `6.1.8 — Manejo actual de Mucílago de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a2fb71dd_6968_47b4_96a7_c42292bb1369,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_a2879059_a23b_4ad7_8cbc_4d22b95b729d, [
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
      { text: `Otro`, isOther: true },
      { text: `Abandono en campo` },
      { text: `Venta o donación` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.8 — Efectos negativos observados de Mucílago de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_a2fb71dd_6968_47b4_96a7_c42292bb1369,
      conditionValue: 'true',
    });

    const q_dde228b0_3c5b_4986_b2c0_2caa9b6a65ac = await saveQuestion(manager, {
      text: `6.1.9 — ¿Genera Aguas mieles de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.9 — Cantidad estimada por año de Aguas mieles de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_dde228b0_3c5b_4986_b2c0_2caa9b6a65ac,
      conditionValue: 'true',
    });

    const q_af57d557_6976_4b15_94cb_a54f9441b035 = await saveQuestion(manager, {
      text: `6.1.9 — Unidad de medida para Aguas mieles de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_dde228b0_3c5b_4986_b2c0_2caa9b6a65ac,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_af57d557_6976_4b15_94cb_a54f9441b035, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_1f5a8bc6_c3db_499a_8ce9_9aa0e5b05e17 = await saveQuestion(manager, {
      text: `6.1.9 — Manejo actual de Aguas mieles de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_dde228b0_3c5b_4986_b2c0_2caa9b6a65ac,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_1f5a8bc6_c3db_499a_8ce9_9aa0e5b05e17, [
      { text: `Venta o donación` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro`, isOther: true },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.9 — Efectos negativos observados de Aguas mieles de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_dde228b0_3c5b_4986_b2c0_2caa9b6a65ac,
      conditionValue: 'true',
    });

    const q_16fbaeb5_8c0c_427d_8f1f_da1b150715b1 = await saveQuestion(manager, {
      text: `6.1.10 — ¿Genera Cisco / cascarilla de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.10 — Cantidad estimada por año de Cisco / cascarilla de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_16fbaeb5_8c0c_427d_8f1f_da1b150715b1,
      conditionValue: 'true',
    });

    const q_ad1834ad_52e8_461c_9854_8eb69e5251ca = await saveQuestion(manager, {
      text: `6.1.10 — Unidad de medida para Cisco / cascarilla de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_16fbaeb5_8c0c_427d_8f1f_da1b150715b1,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_ad1834ad_52e8_461c_9854_8eb69e5251ca, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_b382954c_46ab_4161_9e56_c543f254cebd = await saveQuestion(manager, {
      text: `6.1.10 — Manejo actual de Cisco / cascarilla de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_16fbaeb5_8c0c_427d_8f1f_da1b150715b1,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b382954c_46ab_4161_9e56_c543f254cebd, [
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.10 — Efectos negativos observados de Cisco / cascarilla de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_16fbaeb5_8c0c_427d_8f1f_da1b150715b1,
      conditionValue: 'true',
    });

    const q_40c364cd_d2bc_46d7_800f_e0adf7dfd452 = await saveQuestion(manager, {
      text: `6.1.11 — ¿Genera Café de segunda (granos defectuosos)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.11 — Cantidad estimada por año de Café de segunda (granos defectuosos)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_40c364cd_d2bc_46d7_800f_e0adf7dfd452,
      conditionValue: 'true',
    });

    const q_370a361f_5c51_4431_92a4_a58c4013d5c7 = await saveQuestion(manager, {
      text: `6.1.11 — Unidad de medida para Café de segunda (granos defectuosos)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_40c364cd_d2bc_46d7_800f_e0adf7dfd452,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_370a361f_5c51_4431_92a4_a58c4013d5c7, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_654cff9f_0eeb_4b1e_8648_9aec399d65cb = await saveQuestion(manager, {
      text: `6.1.11 — Manejo actual de Café de segunda (granos defectuosos)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_40c364cd_d2bc_46d7_800f_e0adf7dfd452,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_654cff9f_0eeb_4b1e_8648_9aec399d65cb, [
      { text: `Incorporación al suelo / compostaje` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Venta o donación` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.11 — Efectos negativos observados de Café de segunda (granos defectuosos)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_40c364cd_d2bc_46d7_800f_e0adf7dfd452,
      conditionValue: 'true',
    });

    const q_9d489c68_b4bc_428b_b01b_ae6392da4983 = await saveQuestion(manager, {
      text: `6.1.12 — ¿Genera Restos de poda de café?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.12 — Cantidad estimada por año de Restos de poda de café`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_9d489c68_b4bc_428b_b01b_ae6392da4983,
      conditionValue: 'true',
    });

    const q_3ba1e11e_15ae_4e72_9b00_b6e621eec20b = await saveQuestion(manager, {
      text: `6.1.12 — Unidad de medida para Restos de poda de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_9d489c68_b4bc_428b_b01b_ae6392da4983,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_3ba1e11e_15ae_4e72_9b00_b6e621eec20b, [
      { text: `t` },
      { text: `kg` },
      { text: `L` },
    ]);

    const q_b88263f8_8ef5_471b_9986_299656532438 = await saveQuestion(manager, {
      text: `6.1.12 — Manejo actual de Restos de poda de café`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_9d489c68_b4bc_428b_b01b_ae6392da4983,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b88263f8_8ef5_471b_9986_299656532438, [
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro`, isOther: true },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.12 — Efectos negativos observados de Restos de poda de café`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_9d489c68_b4bc_428b_b01b_ae6392da4983,
      conditionValue: 'true',
    });

    const q_2c22f5db_b346_46a7_95df_5746745a995b = await saveQuestion(manager, {
      text: `6.1.13 — ¿Genera Tallos y hojas de descarte de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.13 — Cantidad estimada por año de Tallos y hojas de descarte de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_2c22f5db_b346_46a7_95df_5746745a995b,
      conditionValue: 'true',
    });

    const q_b9be5eac_43aa_4673_9b4c_3cb9373e027d = await saveQuestion(manager, {
      text: `6.1.13 — Unidad de medida para Tallos y hojas de descarte de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_2c22f5db_b346_46a7_95df_5746745a995b,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_b9be5eac_43aa_4673_9b4c_3cb9373e027d, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_56b3bbc6_2230_4ca1_82fe_60f2d89f4677 = await saveQuestion(manager, {
      text: `6.1.13 — Manejo actual de Tallos y hojas de descarte de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_2c22f5db_b346_46a7_95df_5746745a995b,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_56b3bbc6_2230_4ca1_82fe_60f2d89f4677, [
      { text: `Abandono en campo` },
      { text: `Ningún manejo especial` },
      { text: `Quema` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro`, isOther: true },
      { text: `Venta o donación` },
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.13 — Efectos negativos observados de Tallos y hojas de descarte de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_2c22f5db_b346_46a7_95df_5746745a995b,
      conditionValue: 'true',
    });

    const q_3c7a5249_1efd_4b23_9836_4084325c0acf = await saveQuestion(manager, {
      text: `6.1.14 — ¿Genera Material vegetal post-extracción (bagazo) de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.14 — Cantidad estimada por año de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3c7a5249_1efd_4b23_9836_4084325c0acf,
      conditionValue: 'true',
    });

    const q_e6954d79_0085_47b7_a7fe_d4c976498207 = await saveQuestion(manager, {
      text: `6.1.14 — Unidad de medida para Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3c7a5249_1efd_4b23_9836_4084325c0acf,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_e6954d79_0085_47b7_a7fe_d4c976498207, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_c8554aa1_0720_4258_8bc9_2b43a9461fa0 = await saveQuestion(manager, {
      text: `6.1.14 — Manejo actual de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3c7a5249_1efd_4b23_9836_4084325c0acf,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c8554aa1_0720_4258_8bc9_2b43a9461fa0, [
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Aprovechamiento energético` },
      { text: `Venta o donación` },
      { text: `Otro`, isOther: true },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Alimentación animal` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.14 — Efectos negativos observados de Material vegetal post-extracción (bagazo) de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3c7a5249_1efd_4b23_9836_4084325c0acf,
      conditionValue: 'true',
    });

    const q_e4afbd88_c4b5_4e85_bf71_aac22937bcab = await saveQuestion(manager, {
      text: `6.1.15 — ¿Genera Aguas de limpieza / lixiviados de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.15 — Cantidad estimada por año de Aguas de limpieza / lixiviados de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e4afbd88_c4b5_4e85_bf71_aac22937bcab,
      conditionValue: 'true',
    });

    const q_597c703c_fd69_44c0_8fa4_6702460ee747 = await saveQuestion(manager, {
      text: `6.1.15 — Unidad de medida para Aguas de limpieza / lixiviados de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e4afbd88_c4b5_4e85_bf71_aac22937bcab,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_597c703c_fd69_44c0_8fa4_6702460ee747, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_935fcc8a_229e_4984_ace4_3c074562e572 = await saveQuestion(manager, {
      text: `6.1.15 — Manejo actual de Aguas de limpieza / lixiviados de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e4afbd88_c4b5_4e85_bf71_aac22937bcab,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_935fcc8a_229e_4984_ace4_3c074562e572, [
      { text: `Venta o donación` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Alimentación animal` },
      { text: `Abandono en campo` },
      { text: `Incorporación al suelo / compostaje` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.15 — Efectos negativos observados de Aguas de limpieza / lixiviados de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e4afbd88_c4b5_4e85_bf71_aac22937bcab,
      conditionValue: 'true',
    });

    const q_73c0ab1e_232f_4d32_8b76_aaebd3f10c31 = await saveQuestion(manager, {
      text: `6.1.16 — ¿Genera Residuos de empaque de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.16 — Cantidad estimada por año de Residuos de empaque de cannabis`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_73c0ab1e_232f_4d32_8b76_aaebd3f10c31,
      conditionValue: 'true',
    });

    const q_7d2287e6_57ac_431d_85f8_4771fd1881db = await saveQuestion(manager, {
      text: `6.1.16 — Unidad de medida para Residuos de empaque de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_73c0ab1e_232f_4d32_8b76_aaebd3f10c31,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_7d2287e6_57ac_431d_85f8_4771fd1881db, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_43c23341_0afe_4b50_bcac_98ebdc9392c7 = await saveQuestion(manager, {
      text: `6.1.16 — Manejo actual de Residuos de empaque de cannabis`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_73c0ab1e_232f_4d32_8b76_aaebd3f10c31,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_43c23341_0afe_4b50_bcac_98ebdc9392c7, [
      { text: `Alimentación animal` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Venta o donación` },
      { text: `Quema` },
      { text: `Aprovechamiento energético` },
      { text: `Otro`, isOther: true },
      { text: `Abandono en campo` },
      { text: `Ningún manejo especial` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.16 — Efectos negativos observados de Residuos de empaque de cannabis`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_73c0ab1e_232f_4d32_8b76_aaebd3f10c31,
      conditionValue: 'true',
    });

    const q_e75078b2_0fc7_4817_ab49_3e14d89c12e6 = await saveQuestion(manager, {
      text: `6.1.17 — ¿Genera Cáscara / agramiza (fibra corta de cáñamo)?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.17 — Cantidad estimada por año de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e75078b2_0fc7_4817_ab49_3e14d89c12e6,
      conditionValue: 'true',
    });

    const q_97750d09_4b95_4a1e_81da_0c3f41469830 = await saveQuestion(manager, {
      text: `6.1.17 — Unidad de medida para Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e75078b2_0fc7_4817_ab49_3e14d89c12e6,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_97750d09_4b95_4a1e_81da_0c3f41469830, [
      { text: `kg` },
      { text: `L` },
      { text: `t` },
    ]);

    const q_842cebec_5db4_4a3e_9220_f78588f791dc = await saveQuestion(manager, {
      text: `6.1.17 — Manejo actual de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e75078b2_0fc7_4817_ab49_3e14d89c12e6,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_842cebec_5db4_4a3e_9220_f78588f791dc, [
      { text: `Aprovechamiento energético` },
      { text: `Abandono en campo` },
      { text: `Venta o donación` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Alimentación animal` },
      { text: `Quema` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.17 — Efectos negativos observados de Cáscara / agramiza (fibra corta de cáñamo)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e75078b2_0fc7_4817_ab49_3e14d89c12e6,
      conditionValue: 'true',
    });

    const q_3b96ba5c_b2dd_4ef4_86ec_8159fee36bff = await saveQuestion(manager, {
      text: `6.1.18 — ¿Genera Semillas partidas o imperfectas de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.18 — Cantidad estimada por año de Semillas partidas o imperfectas de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3b96ba5c_b2dd_4ef4_86ec_8159fee36bff,
      conditionValue: 'true',
    });

    const q_aae557e4_d3e4_48a8_8c62_636c4bd3bba0 = await saveQuestion(manager, {
      text: `6.1.18 — Unidad de medida para Semillas partidas o imperfectas de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3b96ba5c_b2dd_4ef4_86ec_8159fee36bff,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_aae557e4_d3e4_48a8_8c62_636c4bd3bba0, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_d926a9d3_7900_4168_b56f_eea473931dd7 = await saveQuestion(manager, {
      text: `6.1.18 — Manejo actual de Semillas partidas o imperfectas de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3b96ba5c_b2dd_4ef4_86ec_8159fee36bff,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_d926a9d3_7900_4168_b56f_eea473931dd7, [
      { text: `Quema` },
      { text: `Aprovechamiento energético` },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Abandono en campo` },
      { text: `Otro`, isOther: true },
      { text: `Venta o donación` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.18 — Efectos negativos observados de Semillas partidas o imperfectas de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3b96ba5c_b2dd_4ef4_86ec_8159fee36bff,
      conditionValue: 'true',
    });

    const q_fcb9fa39_9e3d_4e8a_82c8_163cc70c92fb = await saveQuestion(manager, {
      text: `6.1.19 — ¿Genera Torta de semilla post-prensado de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.19 — Cantidad estimada por año de Torta de semilla post-prensado de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fcb9fa39_9e3d_4e8a_82c8_163cc70c92fb,
      conditionValue: 'true',
    });

    const q_c36d09a7_8d7c_4c98_a582_f37a674982ff = await saveQuestion(manager, {
      text: `6.1.19 — Unidad de medida para Torta de semilla post-prensado de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fcb9fa39_9e3d_4e8a_82c8_163cc70c92fb,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c36d09a7_8d7c_4c98_a582_f37a674982ff, [
      { text: `L` },
      { text: `kg` },
      { text: `t` },
    ]);

    const q_c8a82bc7_4b15_4d0d_a705_7286df316fd3 = await saveQuestion(manager, {
      text: `6.1.19 — Manejo actual de Torta de semilla post-prensado de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fcb9fa39_9e3d_4e8a_82c8_163cc70c92fb,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c8a82bc7_4b15_4d0d_a705_7286df316fd3, [
      { text: `Aprovechamiento energético` },
      { text: `Abandono en campo` },
      { text: `Quema` },
      { text: `Alimentación animal` },
      { text: `Otro`, isOther: true },
      { text: `Ningún manejo especial` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Venta o donación` },
    ]);

    await saveQuestion(manager, {
      text: `6.1.19 — Efectos negativos observados de Torta de semilla post-prensado de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_fcb9fa39_9e3d_4e8a_82c8_163cc70c92fb,
      conditionValue: 'true',
    });

    const q_c7ad5d3f_ea86_4992_8fd9_aa8076497ddd = await saveQuestion(manager, {
      text: `6.1.20 — ¿Genera Aguas de proceso de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `6.1.20 — Cantidad estimada por año de Aguas de proceso de cáñamo`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_c7ad5d3f_ea86_4992_8fd9_aa8076497ddd,
      conditionValue: 'true',
    });

    const q_c13f9738_2f9d_4dad_b666_f1ad4b2ac1b9 = await saveQuestion(manager, {
      text: `6.1.20 — Unidad de medida para Aguas de proceso de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_c7ad5d3f_ea86_4992_8fd9_aa8076497ddd,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_c13f9738_2f9d_4dad_b666_f1ad4b2ac1b9, [
      { text: `L` },
      { text: `t` },
      { text: `kg` },
    ]);

    const q_1f31def8_21fc_45bd_9e9e_f84ea80aad4d = await saveQuestion(manager, {
      text: `6.1.20 — Manejo actual de Aguas de proceso de cáñamo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_c7ad5d3f_ea86_4992_8fd9_aa8076497ddd,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_1f31def8_21fc_45bd_9e9e_f84ea80aad4d, [
      { text: `Venta o donación` },
      { text: `Incorporación al suelo / compostaje` },
      { text: `Alimentación animal` },
      { text: `Ningún manejo especial` },
      { text: `Aprovechamiento energético` },
      { text: `Quema` },
      { text: `Abandono en campo` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `6.1.20 — Efectos negativos observados de Aguas de proceso de cáñamo`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_c7ad5d3f_ea86_4992_8fd9_aa8076497ddd,
      conditionValue: 'true',
    });

  }

  // ── 6.2 Caracterización Detallada de Residuos ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `6.2.1 ★ — ¿Cuál es la parte del cultivo que constituye el residuo o los residuos más abundantes? (Ej: cáscara de cacao, mucílago de café, tallos de cáñamo)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.2 — ¿El residuo es homogéneo o viene mezclado con otros materiales (tierra, piedras, plásticos)?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.3 — ¿Cómo es la forma y tamaño aproximado del residuo?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_4eb2c01a_590b_45a6_ad19_9cb59165eebe = await saveQuestion(manager, {
      text: `6.2.4 — ¿El material es fibroso o denso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_4eb2c01a_590b_45a6_ad19_9cb59165eebe, [
      { text: `Mixto` },
      { text: `Fibroso` },
      { text: `Denso` },
    ]);

    const q_4d38b450_3381_4192_ae5e_8e65289b3628 = await saveQuestion(manager, {
      text: `6.2.5 ★ — ¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    const opts_q_4d38b450_3381_4192_ae5e_8e65289b3628 = await saveOptions(manager, q_4d38b450_3381_4192_ae5e_8e65289b3628, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);
    const opt_09bcd6b8_d34d_498e_bbd4_2ea6e1eec720 = opts_q_4d38b450_3381_4192_ae5e_8e65289b3628.get(`Sí`)!;

    const q_f64525c8_bbfa_41d4_8166_1b94d32d5955 = await saveQuestion(manager, {
      text: `6.2.6 — ¿Puede compartir los resultados de la caracterización con el proyecto? (Aplica solo si respondió Sí en 6.2.5)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_4d38b450_3381_4192_ae5e_8e65289b3628,
      conditionValue: opt_09bcd6b8_d34d_498e_bbd4_2ea6e1eec720,
    });
    await saveOptions(manager, q_f64525c8_bbfa_41d4_8166_1b94d32d5955, [
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.7 — ¿Tiene idea del contenido de humedad del residuo al momento de la recolección?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.8 — ¿Cuánto tiempo transcurre desde la generación del residuo hasta que puede ser recolectado? ¿Observa señales de descomposición?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_894a76e3_ee9a_4008_a98a_6ac443fb0a5e = await saveQuestion(manager, {
      text: `6.2.9 — ¿Bajo qué condiciones se almacena actualmente el residuo?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_894a76e3_ee9a_4008_a98a_6ac443fb0a5e, [
      { text: `En silos` },
      { text: `Bajo techo sin control` },
      { text: `A la intemperie` },
      { text: `En cuarto controlado` },
      { text: `Contacto directo con suelo` },
    ]);

    const q_3785bc46_6a93_44f4_8f5d_b0ff91574bdf = await saveQuestion(manager, {
      text: `6.2.10 ★ — ¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_3785bc46_6a93_44f4_8f5d_b0ff91574bdf, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_b11a4f1a_a48d_4278_ae36_620b9d7674d0 = await saveQuestion(manager, {
      text: `6.2.11 ★ — ¿Sería posible enviar los residuos secos al laboratorio del proyecto?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_b11a4f1a_a48d_4278_ae36_620b9d7674d0, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.12 ★ — ¿Se aplican agentes químicos durante el cultivo o poscosecha (pesticidas, fungicidas)? Liste los agentes empleados. (Clave para seguridad en valorización)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.13 ★ — [Café / Cacao] ¿Cómo es el proceso de beneficio: vía seca o húmeda?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.14 ★ — [Café / Cacao] ¿Cuál es el volumen estimado de lixiviados o "aguas mieles" por tonelada de producto procesado? (L/t o m³/t)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.15 — [Café / Cacao] ¿Se añade agua adicional durante el proceso de extracción o despulpado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.16 — [Café / Cacao] ¿Cuál es el pH inicial aproximado de las fases líquidas obtenidas?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.17 ★ — ¿El residuo se genera de manera constante o solo en meses específicos de cosecha? (Indique los meses si aplica)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.18 ★ — ¿Qué volumen o masa total genera por lote de producción? (Incluya cantidad y unidad: kg, t o L)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.19 — ¿El residuo se recolecta de forma selectiva o se mezcla en un foso común?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.20 — ¿Cuánto tiempo máximo permanece almacenado el residuo antes de ser usado o despachado? (horas / días / semanas)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_55e646ae_80ff_4546_afb0_1b6b9561627d = await saveQuestion(manager, {
      text: `6.2.21 — ¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_55e646ae_80ff_4546_afb0_1b6b9561627d, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.22 — ¿Cuál es la temperatura promedio del área de almacenamiento? (°C)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_0b1411b2_2505_4cd0_a60d_d553945ad274 = await saveQuestion(manager, {
      text: `6.2.23 ★ — ¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo? (Clave para seguridad en valorización energética y de materiales)`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    const opts_q_0b1411b2_2505_4cd0_a60d_d553945ad274 = await saveOptions(manager, q_0b1411b2_2505_4cd0_a60d_d553945ad274, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);
    const opt_71abd87d_006b_47b7_a41a_0883d6f2d303 = opts_q_0b1411b2_2505_4cd0_a60d_d553945ad274.get(`Sí`)!;

    const q_e2a97326_7182_4365_b807_64329416bf59 = await saveQuestion(manager, {
      text: `6.2.23b — ¿Puede compartir los resultados de metales pesados con el proyecto? (Aplica solo si respondió Sí en 6.2.23)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_0b1411b2_2505_4cd0_a60d_d553945ad274,
      conditionValue: opt_71abd87d_006b_47b7_a41a_0883d6f2d303,
    });
    await saveOptions(manager, q_e2a97326_7182_4365_b807_64329416bf59, [
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.24 ◆ — [Café] ¿Cuánto tiempo (horas) pasa desde que el residuo sale de la despulpadora hasta que se estabiliza?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_cfe65201_23c9_4f84_83d3_a8eda5264dda = await saveQuestion(manager, {
      text: `6.2.25 ◆ — [Café] Si conoce los azúcares del proceso de fermentación, ¿predominan hexosas (C6: glucosa, fructosa) o pentosas (C5: xilosa)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_cfe65201_23c9_4f84_83d3_a8eda5264dda, [
      { text: `Pentosas (C5): xilosa` },
      { text: `No sabe` },
      { text: `Hexosas (C6): glucosa, fructosa` },
    ]);

    await saveQuestion(manager, {
      text: `6.2.e — [Cáñamo / Cacao] ¿Qué residuos genera? Nombre todos los residuos de estos cultivos.`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `6.2.26 ◆ — [Cáñamo / Cacao] Si el residuo es fibroso (tallo de cáñamo, cáscara de cacao), ¿cuál es la longitud promedio de la fibra? (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

  }

  // ── 6.3 Interés en Valorización de Residuos ──
  {
    let o = 1;

    const q_40c13ac5_ba33_4d3f_9811_acf98bd360b3 = await saveQuestion(manager, {
      text: `6.3.1 ★ — ¿Estaría dispuesto a reutilizar / valorizar sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_40c13ac5_ba33_4d3f_9811_acf98bd360b3, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_f623c090_7f65_422a_b18d_c3462efc465b = await saveQuestion(manager, {
      text: `6.3.2a ★ — ¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_f623c090_7f65_422a_b18d_c3462efc465b, [
      { text: `Tratamiento de agua (filtros, carbón activado)` },
      { text: `Ingredientes funcionales / cosméticos` },
      { text: `Fertilizantes / abonos` },
      { text: `Materiales / empaques` },
      { text: `Producción de energía (biochar, biogás)` },
    ]);

    const q_99893558_d03e_4549_9a21_c55b85bcadb7 = await saveQuestion(manager, {
      text: `4.5.3 ★ — ¿Ha escuchado sobre la generación de energía a partir de residuos?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_99893558_d03e_4549_9a21_c55b85bcadb7, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `4.5.4 ★ — ¿Actualmente aprovecha algún residuo para generar energía?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    const q_63e8f309_c1df_4f47_95b8_6745a14e4ae3 = await saveQuestion(manager, {
      text: `4.5.5 ★ — ¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_63e8f309_c1df_4f47_95b8_6745a14e4ae3, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `4.5.6 — ¿Qué uso le daría a esa energía?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_31d34fff_9fbb_4c6d_bf6a_93647709dcb2 = await saveQuestion(manager, {
      text: `6.3.3 ★ — ¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_31d34fff_9fbb_4c6d_bf6a_93647709dcb2, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    const q_65279e6d_2fb6_4eaa_9bf8_41c57d7ca263 = await saveQuestion(manager, {
      text: `6.3.4 ★ — ¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_65279e6d_2fb6_4eaa_9bf8_41c57d7ca263, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_27334e7b_3af8_4c79_82cf_c653bd961377 = await saveQuestion(manager, {
      text: `6.3.5 ★ — ¿Le interesaría usar sus residuos para tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_27334e7b_3af8_4c79_82cf_c653bd961377, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_edec5252_6657_4b0d_bdfa_2717e19b3d6c = await saveQuestion(manager, {
      text: `6.3.6a — ¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_edec5252_6657_4b0d_bdfa_2717e19b3d6c, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_499a8469_dc52_4967_aedc_bceee50a5ffc = await saveQuestion(manager, {
      text: `6.3.6b — ¿Sus residuos podrían tener potencial para ingredientes biocosméticos?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_499a8469_dc52_4967_aedc_bceee50a5ffc, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_5facc086_a235_4ae9_81b9_e8d9fc2d4b52 = await saveQuestion(manager, {
      text: `6.3.7 ★ — ¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_5facc086_a235_4ae9_81b9_e8d9fc2d4b52, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_6c9b5a5a_d97f_4208_b8eb_e54b4e761e24 = await saveQuestion(manager, {
      text: `6.3.8 ★ — ¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_6c9b5a5a_d97f_4208_b8eb_e54b4e761e24, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `6.3.9 ★ — ¿Qué factor considera más importante al evaluar una tecnología de valorización de residuos?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `6.3 — ¿Ha incorporado alguna ruta de valorización? Si Sí: ¿Cuál? ¿Cómo le ha funcionado? Si No: ¿Cuál intentó sin éxito? ¿Por qué no funcionó? ¿Quién se la dio o vendió?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

  }

  console.log(`[seed] "${NAME}" insertado (149 preguntas).`);
}
