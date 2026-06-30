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

const NAME = `S12: Aspectos fitosanitarios/Diagnóstico`;
const VERSION = 1;

export async function seedInstrumentoS12AspectosFitosanitariosDiagnostico(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "open_text", "single_choice", "yes_no"];
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
      publishDate: '2026-06-19',
      isActive: false,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3, sec4, sec5] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `1. Estado Sanitario del Cultivo`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `2. Diagnóstico y Uso de Laboratorios`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `3. Red de Apoyo Técnico`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `4. Necesidades Diagnósticas`, order: 4, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `5. Riesgos Emergentes y Futuro`, order: 5, instrument }))
  ]);

  // ── 1. Estado Sanitario del Cultivo ──
  {
    let o = 1;

    const q_2216af5e_55bd_4c1a_87e4_c463867bbc4e = await saveQuestion(manager, {
      text: `¿Ha tenido problemas fitosanitarios durante los últimos 24 meses?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    const q_f1b142ee_e02e_475a_b422_4a89bb4d22b0 = await saveQuestion(manager, {
      text: `¿Qué tipo de problemas ha identificado?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_2216af5e_55bd_4c1a_87e4_c463867bbc4e,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_f1b142ee_e02e_475a_b422_4a89bb4d22b0, [
      { text: `Hongos` },
      { text: `Bacterias` },
      { text: `Virus` },
      { text: `Fitoplasmas` },
      { text: `Nematodos` },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuáles son actualmente los cinco principales agentes/problemas sanitarios de su cultivo?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_76eff7c3_8e46_42a6_a4a7_9f92bffbe5ed = await saveQuestion(manager, {
      text: `¿Qué nivel de impacto económico generan estos problemas?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_76eff7c3_8e46_42a6_a4a7_9f92bffbe5ed, [
      { text: `Bajo (<5% pérdidas)` },
      { text: `Moderado (5–15%)` },
      { text: `Alto (15–30%)` },
      { text: `Muy alto (>30%)` },
    ]);

  }

  // ── 2. Diagnóstico y Uso de Laboratorios ──
  {
    let o = 1;

    const q_047699e7_80ba_4b48_9f8e_6dc05616b070 = await saveQuestion(manager, {
      text: `Cuando se presenta un problema sanitario, ¿cómo lo identifica?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_047699e7_80ba_4b48_9f8e_6dc05616b070, [
      { text: `Inspección visual propia` },
      { text: `Asistente técnico` },
      { text: `Laboratorio externo` },
      { text: `Universidad` },
      { text: `Instituto de investigación` },
      { text: `Otros`, isOther: true },
    ]);

    const q_0bb0fd91_95ac_4a70_a7e1_9af2af98409a = await saveQuestion(manager, {
      text: `¿Ha utilizado servicios de laboratorio en los últimos 2 años?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_89fc8bcf_d1be_4910_b83f_d0ec9eedd57a = await saveQuestion(manager, {
      text: `¿Qué análisis ha solicitado?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_0bb0fd91_95ac_4a70_a7e1_9af2af98409a,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_89fc8bcf_d1be_4910_b83f_d0ec9eedd57a, [
      { text: `Análisis microbiológicos` },
      { text: `Pruebas ELISA` },
      { text: `Diagnóstico molecular (PCR/qPCR)` },
      { text: `Diagnóstico viral` },
      { text: `Nematología` },
      { text: `Secuenciación genética` },
      { text: `Otros`, isOther: true },
    ]);

    const q_1cdfdd65_83cc_4318_b24a_ac4c06e4f8d4 = await saveQuestion(manager, {
      text: `¿Qué análisis de calidad o inocuidad le han exigido compradores, comercializadores, certificadoras o entidades regulatorias durante los últimos tres años?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_1cdfdd65_83cc_4318_b24a_ac4c06e4f8d4, [
      { text: `Residuos de plaguicidas` },
      { text: `Metales pesados` },
      { text: `Análisis microbiológicos` },
      { text: `Humedad y actividad de agua` },
      { text: `Calidad fisicoquímica del producto` },
      { text: `Trazabilidad de la producción` },
      { text: `Certificados fitosanitarios` },
      { text: `Certificación BPA` },
      { text: `Global G.A.P` },
      { text: `Rainforest Alliance` },
      { text: `Fairtrade (Comercio Justo)` },
      { text: `Certificaciones de sostenibilidad o huella ambiental` },
      { text: `Ninguno` },
      { text: `Otros`, isOther: true },
    ]);

    const q_49c1395b_2a75_4ae0_82f9_4fa7877dd36a = await saveQuestion(manager, {
      text: `¿Su unidad productiva tiene implementada alguna Norma Técnica Colombiana (NTC) o Guía Técnica Colombiana (GTC) relacionada con la producción, calidad, sostenibilidad, inocuidad, trazabilidad o gestión ambiental?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Si respondió "Sí", indique cuál(es)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_49c1395b_2a75_4ae0_82f9_4fa7877dd36a,
      conditionValue: 'true',
    });

    const q_77deff74_fe40_4dee_aebe_3521ab36c5e3 = await saveQuestion(manager, {
      text: `¿Cómo califica la disponibilidad de laboratorios especializados?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_77deff74_fe40_4dee_aebe_3521ab36c5e3, [
      { text: `Muy buena` },
      { text: `Buena` },
      { text: `Regular` },
      { text: `Mala` },
      { text: `Muy mala` },
    ]);

    const q_d420f405_10e1_4c1b_bcc8_683fd67779a3 = await saveQuestion(manager, {
      text: `¿Cuál es el principal obstáculo para acceder a servicios de laboratorios?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_d420f405_10e1_4c1b_bcc8_683fd67779a3, [
      { text: `Costos` },
      { text: `Distancia` },
      { text: `Tiempo de respuesta` },
      { text: `Falta de oferta especializada` },
      { text: `Desconocimiento` },
      { text: `Requisitos regulatorios` },
      { text: `Otros`, isOther: true },
    ]);

  }

  // ── 3. Red de Apoyo Técnico ──
  {
    let o = 1;

    const q_55f286a3_81db_4e74_aaa9_e5ea47e32420 = await saveQuestion(manager, {
      text: `¿Quién brinda asistencia sanitaria a su cultivo?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_55f286a3_81db_4e74_aaa9_e5ea47e32420, [
      { text: `Asistente técnico privado` },
      { text: `Cooperativa` },
      { text: `Asociación de productores` },
      { text: `ICA` },
      { text: `Agrosavia` },
      { text: `Universidad` },
      { text: `Empresa proveedora de insumos` },
      { text: `Ninguno` },
    ]);

    await saveQuestion(manager, {
      text: `¿Considera suficiente el soporte técnico disponible?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_2de9cbef_2bc9_4dcc_acd3_9ee25ebf5876 = await saveQuestion(manager, {
      text: `¿Qué áreas requieren mayor fortalecimiento?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_2de9cbef_2bc9_4dcc_acd3_9ee25ebf5876, [
      { text: `Diagnóstico molecular` },
      { text: `Vigilancia fitosanitaria` },
      { text: `Identificación de plagas` },
      { text: `Manejo integrado` },
      { text: `Bioseguridad` },
      { text: `Trazabilidad` },
    ]);

  }

  // ── 4. Necesidades Diagnósticas ──
  {
    let o = 1;

    const q_e613bc0c_c1cb_4618_97ae_02504653d570 = await saveQuestion(manager, {
      text: `¿Qué servicios le gustaría tener disponibles localmente?`,
      type: types.multiple_choice,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_e613bc0c_c1cb_4618_97ae_02504653d570, [
      { text: `PCR convencional` },
      { text: `qPCR en tiempo real` },
      { text: `Diagnóstico viral` },
      { text: `Secuenciación` },
      { text: `Microbiología agrícola` },
      { text: `Nematología` },
      { text: `Diagnóstico rápido en campo` },
      { text: `Otros`, isOther: true },
    ]);

    const q_6ae8bbfd_dc85_4cc9_bbe5_7f72cfdb6b9b = await saveQuestion(manager, {
      text: `¿Cuál es el tiempo de respuesta ideal para resultados?`,
      type: types.single_choice,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_6ae8bbfd_dc85_4cc9_bbe5_7f72cfdb6b9b, [
      { text: `Menos de 24 horas` },
      { text: `1–3 días` },
      { text: `4–7 días` },
      { text: `1–2 semanas` },
    ]);

    await saveQuestion(manager, {
      text: `¿Estaría dispuesto a enviar muestras a un laboratorio regional especializado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    const q_0ec1831a_aeba_40d2_8bec_9d9af544807c = await saveQuestion(manager, {
      text: `¿Cuál sería un costo razonable por diagnóstico especializado?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_0ec1831a_aeba_40d2_8bec_9d9af544807c, [
      { text: `Menos de $25.000` },
      { text: `Entre $25.000 – $50.000` },
      { text: `Entre $50.000 - $100.000` },
      { text: `Más de $100.000` },
    ]);

  }

  // ── 5. Riesgos Emergentes y Futuro ──
  {
    let o = 1;

    const q_0e8badc3_1868_4b42_a68c_42a9288c8401 = await saveQuestion(manager, {
      text: `¿Ha observado nuevos problemas sanitarios en los últimos 3 años?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Si respondió "Sí", indique cuál(es)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec5,
      conditionQuestion: q_0e8badc3_1868_4b42_a68c_42a9288c8401,
      conditionValue: 'true',
    });

    const q_d4de1745_8884_42b5_968a_9fd52e81377c = await saveQuestion(manager, {
      text: `¿Qué factores considera más importantes para la aparición de nuevas enfermedades?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_d4de1745_8884_42b5_968a_9fd52e81377c, [
      { text: `Cambio climático` },
      { text: `Material vegetal contaminado` },
      { text: `Movimiento de personas` },
      { text: `Movimiento de plantas` },
      { text: `Deficiencias de bioseguridad` },
      { text: `Resistencia a agroquímicos` },
      { text: `Otros`, isOther: true },
    ]);

    const q_3d8619ee_6dfe_4653_b053_6ca9eddd946d = await saveQuestion(manager, {
      text: `¿Qué inversión tendría mayor impacto en la sanidad de su cultivo?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_3d8619ee_6dfe_4653_b053_6ca9eddd946d, [
      { text: `Laboratorios regionales` },
      { text: `Capacitación` },
      { text: `Diagnóstico molecular` },
      { text: `Vigilancia fitosanitaria` },
      { text: `Herramientas digitales` },
      { text: `Programas de certificación` },
      { text: `Investigación aplicada` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (23 preguntas).`);
}
