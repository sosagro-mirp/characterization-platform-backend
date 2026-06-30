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

const NAME = `S11: Adopción Tecnológica — Diagnóstico Extensionistas`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaDiagnosticoExtensionistas(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "multiple_choice", "numeric", "single_choice", "yes_no"];
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
    sectionRepo.create({ name: `EX. Diagnóstico territorial del extensionista`, order: 1, instrument }),
  );

  // ── EX. Diagnóstico territorial del extensionista ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Cuántas unidades productivas atiende actualmente en su zona?`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_108c6d4d_8023_4ed0_895e_7b695a3f04bb = await saveQuestion(manager, {
      text: `¿Cuál es el principal obstáculo para que los productores adopten tecnología digital?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_108c6d4d_8023_4ed0_895e_7b695a3f04bb, [
      { text: `Falta de acompañamiento técnico continuo` },
      { text: `Resistencia al cambio` },
      { text: `Falta de conocimiento / alfabetización digital del productor` },
      { text: `Mala calidad o ausencia de señal móvil` },
      { text: `Costo elevado de dispositivos o internet` },
      { text: `Desconfianza del productor en la tecnología` },
      { text: `Baja percepción de utilidad` },
    ]);

    await saveQuestion(manager, {
      text: `¿Usted mismo usa herramientas digitales para gestionar o reportar su trabajo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

    const q_5a8bd830_db75_48c0_85fd_20ba19efd142 = await saveQuestion(manager, {
      text: `¿Cuáles herramientas digitales usa para gestionar o reportar su trabajo?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5a8bd830_db75_48c0_85fd_20ba19efd142, [
      { text: `Google Maps / georreferenciación` },
      { text: `Ninguna` },
      { text: `Registro fotográfico` },
      { text: `Apps agropecuarias especializadas` },
      { text: `Hojas de cálculo (Excel / Sheets)` },
      { text: `Formularios digitales (KoBoToolbox / Survey123)` },
      { text: `WhatsApp / Telegram` },
      { text: `Otros`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Ha recibido formación en uso de tecnologías digitales aplicadas al sector agrícola?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

    const q_897849da_07cb_4f67_bc73_d6693043e369 = await saveQuestion(manager, {
      text: `¿Qué tipo de tecnología ha generado más interés o adopción efectiva entre sus productores?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_897849da_07cb_4f67_bc73_d6693043e369, [
      { text: `Apps móviles de consulta (clima / precios)` },
      { text: `Plataformas de comercialización` },
      { text: `Ninguna` },
      { text: `Sensores / IoT` },
      { text: `WhatsApp para alertas` },
      { text: `Registro fotográfico y envío de imágenes` },
      { text: `Apps de gestión de finca` },
      { text: `Otros`, isOther: true },
    ]);

    const q_d0563cb2_373f_47d0_b7ce_63c1f988776c = await saveQuestion(manager, {
      text: `¿Con qué frecuencia visita cada unidad productiva bajo su acompañamiento?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d0563cb2_373f_47d0_b7ce_63c1f988776c, [
      { text: `Quincenal` },
      { text: `Ocasional / según demanda` },
      { text: `Cada 2–3 meses` },
      { text: `Semanal o más frecuente` },
      { text: `Mensual` },
    ]);

    const q_5f459f2c_9351_4395_8e0d_36befbb6833c = await saveQuestion(manager, {
      text: `¿Qué canales o medios usa para comunicarse con los productores?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5f459f2c_9351_4395_8e0d_36befbb6833c, [
      { text: `Llamada telefónica` },
      { text: `SMS` },
      { text: `WhatsApp` },
      { text: `Visita presencial en campo` },
      { text: `Plataforma institucional` },
      { text: `Radio comunitaria` },
      { text: `Grupos comunitarios / asambleas` },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil contar con una app para registrar mis visitas de campo y hacer seguimiento al estado productivo de cada unidad que atiendo.`,
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
      text: `Me gustaría contar con una plataforma donde pueda ver el estado actualizado de todas las fincas que atiendo (alertas sanitarias, parámetros de cultivo, pendientes de visita) desde mi celular o computador.`,
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
      text: `Me sería útil poder enviar recomendaciones técnicas personalizadas a cada productor que atiendo directamente desde una plataforma, sin necesidad de visitarlo físicamente.`,
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
      text: `Preferiría compartir contenido técnico con mis productores en formato de fichas breves o videos cortos de 2 a 3 minutos a través de una app, en lugar de documentos extensos.`,
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
      text: `Si una plataforma registrara automáticamente mis visitas (fecha, finca, observaciones), la usaría para mis reportes institucionales y me ahorraría tiempo significativo cada semana.`,
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

  console.log(`[seed] "${NAME}" insertado (13 preguntas).`);
}
