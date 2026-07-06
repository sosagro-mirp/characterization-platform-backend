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

const NAME = `S7C: Agua en Cannabis y Cáñamo`;
const VERSION = 1;

export async function seedInstrumentoS7cAguaEnCannabisYCanamo(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "multiple_choice", "numeric", "open_text", "single_choice", "yes_no"];
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

  const [sec1, sec2, sec3, sec4, sec5, sec6, sec7] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `7C.1 Fuente y Uso del Agua`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.2 Parámetros Medidos en Campo`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.3 Agroinsumos y Contaminantes`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.4 Tratamiento del Agua`, order: 4, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.5 Balance Agua-Nutrientes`, order: 5, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.6 Vertimiento y Cumplimiento Ambiental`, order: 6, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `7C.7 Observaciones Operativas`, order: 7, instrument }))
  ]);

  // ── 7C.1 Fuente y Uso del Agua ──
  {
    let o = 1;

    const q_7d55deef_8050_4a37_b0fc_6b586e79f7d7 = await saveQuestion(manager, {
      text: `Fuente principal de agua`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_7d55deef_8050_4a37_b0fc_6b586e79f7d7, [
      { text: `Pozo somero` },
      { text: `Otro`, isOther: true },
      { text: `Agua lluvia` },
      { text: `Río` },
      { text: `Quebrada` },
      { text: `Acueducto veredal` },
      { text: `Reservorio / Jagüey` },
      { text: `Pozo profundo` },
      { text: `Acueducto municipal` },
    ]);

    const q_6fe0f2fd_80d3_4960_929e_846472ec768e = await saveQuestion(manager, {
      text: `¿Se mezclan diferentes fuentes de agua?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cuáles fuentes se mezclan? (especifique)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_6fe0f2fd_80d3_4960_929e_846472ec768e,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Volumen de agua usado (Indique valor y unidad: L/día, m³/día o m³/mes)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_8872eb44_a034_4bb4_9cbd_b2e23fed5418 = await saveQuestion(manager, {
      text: `Frecuencia de riego`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8872eb44_a034_4bb4_9cbd_b2e23fed5418, [
      { text: `Quincenal` },
      { text: `Mensual` },
      { text: `Cada 2–3 meses` },
      { text: `Ocasional / según demanda` },
      { text: `Semanal o más frecuente` },
    ]);

    const q_2cdcc67d_5870_41a2_84fc_70c9e45a41b3 = await saveQuestion(manager, {
      text: `Método de riego`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_2cdcc67d_5870_41a2_84fc_70c9e45a41b3, [
      { text: `Gravedad` },
      { text: `Aspersión` },
      { text: `Manual` },
      { text: `DWC (Cultivo en agua profunda)` },
      { text: `Goteo` },
      { text: `NFT (Nutrient Film)` },
      { text: `Otro`, isOther: true },
      { text: `Recirculante (hidropónico)` },
    ]);

    await saveQuestion(manager, {
      text: `¿Se realiza fertirriego?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Se recircula el agua o solución nutritiva?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Se generan drenajes o lixiviados?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_8970fb32_ef50_4537_a595_2d7114fa9788 = await saveQuestion(manager, {
      text: `Destino del drenaje / lixiviado`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8970fb32_ef50_4537_a595_2d7114fa9788, [
      { text: `Reúso en cultivo` },
      { text: `Alcantarillado` },
      { text: `Cuerpo de agua (quebrada / río)` },
      { text: `Otro`, isOther: true },
      { text: `Suelo sin tratar` },
      { text: `Tanque de almacenamiento` },
    ]);

    await saveQuestion(manager, {
      text: `¿Hay obras de construcción cercanas?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Qué tipo de actividad económica tienen los predios aledaños?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── 7C.2 Parámetros Medidos en Campo ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Mide la temperatura del agua de riego?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    const q_1d81bca8_f64b_445d_b8c3_d7b5cd5e2f42 = await saveQuestion(manager, {
      text: `¿Mide el pH del agua de entrada?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de pH de entrada`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_1d81bca8_f64b_445d_b8c3_d7b5cd5e2f42,
      conditionValue: 'true',
    });

    const q_00162cef_708c_4c47_b46c_6ed18deadd1b = await saveQuestion(manager, {
      text: `¿Mide el pH de la solución nutritiva (fertirriego)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de pH del fertirriego`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_00162cef_708c_4c47_b46c_6ed18deadd1b,
      conditionValue: 'true',
    });

    const q_1b1fe5cb_f039_40bd_a30b_052e95725d09 = await saveQuestion(manager, {
      text: `¿Mide el pH del drenaje o lixiviado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de pH del drenaje`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_1b1fe5cb_f039_40bd_a30b_052e95725d09,
      conditionValue: 'true',
    });

    const q_ec42a802_37dc_4029_94cf_75f28c8c1eea = await saveQuestion(manager, {
      text: `¿Mide la Conductividad Eléctrica (CE) del agua de entrada?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de CE entrada (mS/cm)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_ec42a802_37dc_4029_94cf_75f28c8c1eea,
      conditionValue: 'true',
    });

    const q_4b1dd943_033c_4913_b571_1d3fa369adf9 = await saveQuestion(manager, {
      text: `¿Mide la Conductividad Eléctrica (CE) del fertirriego?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de CE fertirriego (mS/cm)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_4b1dd943_033c_4913_b571_1d3fa369adf9,
      conditionValue: 'true',
    });

    const q_1fccb7ae_ca17_42e8_b00e_36658169b985 = await saveQuestion(manager, {
      text: `¿Mide la Conductividad Eléctrica (CE) del drenaje?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de CE drenaje (mS/cm)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_1fccb7ae_ca17_42e8_b00e_36658169b985,
      conditionValue: 'true',
    });

    const q_7a7da6bd_1529_4760_860c_e0a4dd992a43 = await saveQuestion(manager, {
      text: `¿Mide los Sólidos Disueltos Totales (TDS)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de TDS (ppm)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_7a7da6bd_1529_4760_860c_e0a4dd992a43,
      conditionValue: 'true',
    });

    const q_317a81ac_b849_49f5_b995_9f8b6e5aafb3 = await saveQuestion(manager, {
      text: `¿Mide el Oxígeno Disuelto (OD)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de OD (mg/L)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_317a81ac_b849_49f5_b995_9f8b6e5aafb3,
      conditionValue: 'true',
    });

    const q_418a6729_638a_4d3e_962e_cf70807e4567 = await saveQuestion(manager, {
      text: `¿Mide el Potencial Óxido-Reducción (ORP)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si Sí: indique el valor o rango habitual de ORP (mV)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_418a6729_638a_4d3e_962e_cf70807e4567,
      conditionValue: 'true',
    });

    const q_5403ecc7_4656_4914_a51e_f945f7c515e8 = await saveQuestion(manager, {
      text: `¿Qué otros parámetros mide en el agua? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_5403ecc7_4656_4914_a51e_f945f7c515e8, [
      { text: `Contaminantes` },
      { text: `Dureza` },
      { text: `Materia orgánica` },
      { text: `Otro`, isOther: true },
      { text: `Metales pesados` },
      { text: `Nutrientes` },
    ]);

  }

  // ── 7C.3 Agroinsumos y Contaminantes ──
  {
    let o = 1;

    const q_fd6b4a9c_081e_46cf_87ef_fae0e00307f3 = await saveQuestion(manager, {
      text: `¿Se usan plaguicidas o fungicidas en el cultivo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Liste los productos utilizados`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
      conditionQuestion: q_fd6b4a9c_081e_46cf_87ef_fae0e00307f3,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Presencia de residuos de plaguicidas en el agua (liste compuestos / concentración en µg/L si se conoce)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_8171cbfb_fad7_41d8_9b82_ea56871efc90 = await saveQuestion(manager, {
      text: `¿Se usan reguladores de crecimiento?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Especifique los reguladores de crecimiento utilizados`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
      conditionQuestion: q_8171cbfb_fad7_41d8_9b82_ea56871efc90,
      conditionValue: 'true',
    });

    const q_b6fd48e1_5e95_4dd9_bc17_b39d385421ea = await saveQuestion(manager, {
      text: `¿Se usan surfactantes o detergentes?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Concentración aproximada de surfactantes / detergentes (mg/L)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
      conditionQuestion: q_b6fd48e1_5e95_4dd9_bc17_b39d385421ea,
      conditionValue: 'true',
    });

  }

  // ── 7C.4 Tratamiento del Agua ──
  {
    let o = 1;

    const q_06ee1e83_0e3d_4820_956f_ef1bd1c37afb = await saveQuestion(manager, {
      text: `¿El agua recibe tratamiento previo al uso?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    const q_9acb43b0_83dd_4593_8182_e8c0b54ba537 = await saveQuestion(manager, {
      text: `Tipo de tratamiento que aplica`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec4,
      conditionQuestion: q_06ee1e83_0e3d_4820_956f_ef1bd1c37afb,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_9acb43b0_83dd_4593_8182_e8c0b54ba537, [
      { text: `Desinfección UV` },
      { text: `Otro`, isOther: true },
      { text: `Sin tratamiento` },
      { text: `Acidificación / alcalinización` },
      { text: `Cloración` },
      { text: `Ósmosis inversa` },
      { text: `Carbón activado` },
      { text: `Filtración (arena, grava)` },
    ]);

    const q_c305896e_c25b_42b4_993e_9fbc7b5e56b6 = await saveQuestion(manager, {
      text: `¿Se ajusta el pH antes del riego?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Rango objetivo de pH`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
      conditionQuestion: q_c305896e_c25b_42b4_993e_9fbc7b5e56b6,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Se ajusta la alcalinidad del agua?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `¿Se filtra la solución nutritiva?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    const q_5059ddf0_9a78_4f63_9a76_b0efb297c24c = await saveQuestion(manager, {
      text: `¿Se monitorea la calidad del agua periódicamente?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `¿Con qué frecuencia se monitorea?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
      conditionQuestion: q_5059ddf0_9a78_4f63_9a76_b0efb297c24c,
      conditionValue: 'true',
    });

  }

  // ── 7C.5 Balance Agua-Nutrientes ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Volumen de agua aplicado por ciclo (Indique valor y unidad: L/planta, L/m² o m³/ha)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Porcentaje de drenaje generado (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    const q_997c9667_207a_4359_9e6e_01d668b9c799 = await saveQuestion(manager, {
      text: `¿Se reutiliza el drenaje?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Porcentaje de drenaje reutilizado (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
      conditionQuestion: q_997c9667_207a_4359_9e6e_01d668b9c799,
      conditionValue: 'true',
    });

  }

  // ── 7C.6 Vertimiento y Cumplimiento Ambiental ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Existe un punto de vertimiento definido?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec6,
    });

    await saveQuestion(manager, {
      text: `Tipo de receptor del vertimiento (ej: suelo, cuerpo hídrico, alcantarillado)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec6,
    });

    const q_67225175_747d_4cf8_a298_916e89fa7d4c = await saveQuestion(manager, {
      text: `¿Cuenta con permiso de vertimiento?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec6,
    });
    await saveOptions(manager, q_67225175_747d_4cf8_a298_916e89fa7d4c, [
      { text: `En trámite` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_0a53699f_fe1f_4ebf_982a_6f4d3a1868e5 = await saveQuestion(manager, {
      text: `Frecuencia de monitoreo de vertimientos`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec6,
    });
    await saveOptions(manager, q_0a53699f_fe1f_4ebf_982a_6f4d3a1868e5, [
      { text: `Semanal o más frecuente` },
      { text: `Ocasional / según demanda` },
      { text: `Cada 2–3 meses` },
      { text: `Mensual` },
      { text: `Quincenal` },
    ]);

    await saveQuestion(manager, {
      text: `Parámetros exigidos por la autoridad ambiental para el vertimiento`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec6,
    });

    await saveQuestion(manager, {
      text: `¿Se trata el vertimiento antes de la descarga?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec6,
    });

  }

  // ── 7C.7 Observaciones Operativas ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Problemas observados en el cultivo asociados al agua (clorosis, necrosis, salinidad, etc.)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec7,
    });

    await saveQuestion(manager, {
      text: `¿Hay problemas de incrustaciones en tuberías o goteros?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec7,
    });

    await saveQuestion(manager, {
      text: `¿Hay presencia de olores, color o turbidez anormal en el agua?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec7,
    });

    const q_50698dc3_2646_4a38_9da2_efabc19a57f3 = await saveQuestion(manager, {
      text: `¿Han ocurrido eventos recientes de lluvia intensa o sequía?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec7,
    });

    await saveQuestion(manager, {
      text: `Describa el evento`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec7,
      conditionQuestion: q_50698dc3_2646_4a38_9da2_efabc19a57f3,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Observaciones adicionales del productor sobre el agua`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec7,
    });

    const q_73e3817f_c9d8_44b3_a668_862580584ad9 = await saveQuestion(manager, {
      text: `¿Su cultivo de cannabis / cáñamo genera impacto ambiental en las fuentes de agua cercanas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec7,
    });
    await saveOptions(manager, q_73e3817f_c9d8_44b3_a668_862580584ad9, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular alertas cuando los parámetros del agua de riego (pH, conductividad eléctrica, temperatura) estén fuera del rango óptimo para mi cultivo.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec7,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me gustaría llevar en una app un registro del volumen de agua que uso por ciclo de riego o fertirriego, para detectar tendencias de consumo y reducir costos.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec7,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Me sería útil una herramienta que me indicara qué ajustes de fertilización o tratamiento de agua aplicar según los parámetros que mido en campo.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec7,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Me gustaría recibir recomendaciones digitales sobre cómo gestionar el vertimiento de aguas residuales de mi cultivo para cumplir con las regulaciones ambientales colombianas.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec7,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (68 preguntas).`);
}
