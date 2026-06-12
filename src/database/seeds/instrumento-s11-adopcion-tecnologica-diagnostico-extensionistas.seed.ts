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

const NAME = `S11. Adopción Tecnológica: Diagnóstico Extensionistas`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaDiagnosticoExtensionistas(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["numeric","single_choice","yes_no","multiple_choice"];
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

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `EX. Diagnóstico territorial del extensionista`, order: 1, instrument }),
  );

  // ── EX. Diagnóstico territorial del extensionista ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `EX.1 ★ — ¿Cuántas unidades productivas atiende actualmente en su zona?`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_108c6d4d_8023_4ed0_895e_7b695a3f04bb = await saveQuestion(manager, {
      text: `EX.2 ★ — ¿Cuál es el principal obstáculo para que los productores adopten tecnología digital?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_108c6d4d_8023_4ed0_895e_7b695a3f04bb, [
      { text: `Baja percepción de utilidad` },
      { text: `Mala calidad o ausencia de señal móvil` },
      { text: `Falta de conocimiento / alfabetización digital del productor` },
      { text: `Falta de acompañamiento técnico continuo` },
      { text: `Resistencia al cambio` },
      { text: `Costo elevado de dispositivos o internet` },
      { text: `Desconfianza del productor en la tecnología` },
    ]);

    await saveQuestion(manager, {
      text: `EX.3a ★ — ¿Usted mismo usa herramientas digitales para gestionar o reportar su trabajo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_5a8bd830_db75_48c0_85fd_20ba19efd142 = await saveQuestion(manager, {
      text: `EX.3b ★ — ¿Cuáles herramientas digitales usa para gestionar o reportar su trabajo?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5a8bd830_db75_48c0_85fd_20ba19efd142, [
      { text: `Hojas de cálculo (Excel / Sheets)` },
      { text: `Formularios digitales (KoBoToolbox / Survey123)` },
      { text: `Apps agropecuarias especializadas` },
      { text: `Google Maps / georreferenciación` },
      { text: `Ninguna` },
      { text: `WhatsApp / Telegram` },
      { text: `Registro fotográfico` },
    ]);

    await saveQuestion(manager, {
      text: `EX.4 ★ — ¿Ha recibido formación en uso de tecnologías digitales aplicadas al sector agrícola?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_897849da_07cb_4f67_bc73_d6693043e369 = await saveQuestion(manager, {
      text: `EX.5 ★ — ¿Qué tipo de tecnología ha generado más interés o adopción efectiva entre sus productores?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_897849da_07cb_4f67_bc73_d6693043e369, [
      { text: `WhatsApp para alertas` },
      { text: `Registro fotográfico y envío de imágenes` },
      { text: `Apps móviles de consulta (clima/precios)` },
      { text: `Sensores / IoT` },
      { text: `Plataformas de comercialización` },
      { text: `Apps de gestión de finca` },
      { text: `Ninguna` },
    ]);

    const q_d0563cb2_373f_47d0_b7ce_63c1f988776c = await saveQuestion(manager, {
      text: `EX.6 ★ — ¿Con qué frecuencia visita cada unidad productiva bajo su acompañamiento?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d0563cb2_373f_47d0_b7ce_63c1f988776c, [
      { text: `Mensual` },
      { text: `Semanal o más frecuente` },
      { text: `Cada 2–3 meses` },
      { text: `Quincenal` },
      { text: `Ocasional / según demanda` },
    ]);

    const q_5f459f2c_9351_4395_8e0d_36befbb6833c = await saveQuestion(manager, {
      text: `EX.7 ★ — ¿Qué canales o medios usa para comunicarse con los productores?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5f459f2c_9351_4395_8e0d_36befbb6833c, [
      { text: `Visita presencial en campo` },
      { text: `Llamada telefónica` },
      { text: `Radio comunitaria` },
      { text: `Plataforma institucional` },
      { text: `WhatsApp` },
      { text: `Grupos comunitarios / asambleas` },
      { text: `SMS` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (8 preguntas).`);
}
