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

  const typeNames = ["multiple_choice", "numeric", "single_choice", "yes_no"];
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
      { text: `Baja percepción de utilidad` },
      { text: `Costo elevado de dispositivos o internet` },
      { text: `Desconfianza del productor en la tecnología` },
      { text: `Falta de acompañamiento técnico continuo` },
      { text: `Falta de conocimiento / alfabetización digital del productor` },
      { text: `Mala calidad o ausencia de señal móvil` },
      { text: `Resistencia al cambio` },
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
      { text: `Apps agropecuarias especializadas` },
      { text: `Formularios digitales (KoBoToolbox / Survey123)` },
      { text: `Google Maps / georreferenciación` },
      { text: `Hojas de cálculo (Excel / Sheets)` },
      { text: `Ninguna` },
      { text: `Otros`, isOther: true },
      { text: `Registro fotográfico` },
      { text: `WhatsApp / Telegram` },
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
      { text: `Apps de gestión de finca` },
      { text: `Apps móviles de consulta (clima/precios)` },
      { text: `Ninguna` },
      { text: `Otros`, isOther: true },
      { text: `Plataformas de comercialización` },
      { text: `Registro fotográfico y envío de imágenes` },
      { text: `Sensores / IoT` },
      { text: `WhatsApp para alertas` },
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
      { text: `Cada 2–3 meses` },
      { text: `Mensual` },
      { text: `Ocasional / según demanda` },
      { text: `Quincenal` },
      { text: `Semanal o más frecuente` },
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
      { text: `Grupos comunitarios / asambleas` },
      { text: `Llamada telefónica` },
      { text: `Plataforma institucional` },
      { text: `Radio comunitaria` },
      { text: `SMS` },
      { text: `Visita presencial en campo` },
      { text: `WhatsApp` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (8 preguntas).`);
}
