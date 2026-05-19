import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface QuestionDef {
  text: string;
  type: TypeOfQuestion;
  isRequired: boolean;
  isSelectionCriteria?: boolean;
  order: number;
  section: Section;
}

async function saveQuestion(
  manager: EntityManager,
  def: QuestionDef,
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(
    repo.create({
      text: def.text,
      type: def.type,
      isRequired: def.isRequired,
      isSelectionCriteria: def.isSelectionCriteria ?? false,
      order: def.order,
      section: def.section,
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; isOther?: boolean }[],
): Promise<void> {
  const repo = manager.getRepository(OptionQuestion);
  for (const opt of options) {
    await repo.save(
      repo.create({ question, text: opt.text, isOther: opt.isOther ?? false }),
    );
  }
}

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S11. Adopción Tecnológica: Diagnóstico Extensionistas';
const VERSION = 1;

export async function seedInstrumentoAdopcionExtensionistas(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ['numeric', 'yes_no', 'single_choice', 'multiple_choice'];
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

  const secEX = await sectionRepo.save(
    sectionRepo.create({
      name: 'EX. Diagnóstico territorial del extensionista',
      order: 1,
      instrument,
    }),
  );

  // ── EX. Diagnóstico territorial del extensionista ─────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: 'EX.1 ★ — ¿Cuántas unidades productivas atiende actualmente en su zona?',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });

    const qEX2 = await saveQuestion(manager, {
      text: 'EX.2 ★ — ¿Cuál es el principal obstáculo para que los productores adopten tecnología digital?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });
    await saveOptions(manager, qEX2, [
      { text: 'Falta de conocimiento / alfabetización digital del productor' },
      { text: 'Mala calidad o ausencia de señal móvil' },
      { text: 'Costo elevado de dispositivos o internet' },
      { text: 'Desconfianza del productor en la tecnología' },
      { text: 'Baja percepción de utilidad' },
      { text: 'Falta de acompañamiento técnico continuo' },
      { text: 'Resistencia al cambio' },
    ]);

    // EX.3 split: EX.3a yes_no + EX.3b multiple_choice (herramientas)
    await saveQuestion(manager, {
      text: 'EX.3a ★ — ¿Usted mismo usa herramientas digitales para gestionar o reportar su trabajo?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });

    const qEX3b = await saveQuestion(manager, {
      text: 'EX.3b ★ — ¿Cuáles herramientas digitales usa para gestionar o reportar su trabajo?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });
    await saveOptions(manager, qEX3b, [
      { text: 'WhatsApp / Telegram' },
      { text: 'Formularios digitales (KoBoToolbox / Survey123)' },
      { text: 'Hojas de cálculo (Excel / Sheets)' },
      { text: 'Apps agropecuarias especializadas' },
      { text: 'Google Maps / georreferenciación' },
      { text: 'Registro fotográfico' },
      { text: 'Ninguna' },
    ]);

    await saveQuestion(manager, {
      text: 'EX.4 ★ — ¿Ha recibido formación en uso de tecnologías digitales aplicadas al sector agrícola?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });

    const qEX5 = await saveQuestion(manager, {
      text: 'EX.5 ★ — ¿Qué tipo de tecnología ha generado más interés o adopción efectiva entre sus productores?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });
    await saveOptions(manager, qEX5, [
      { text: 'Apps móviles de consulta (clima/precios)' },
      { text: 'WhatsApp para alertas' },
      { text: 'Registro fotográfico y envío de imágenes' },
      { text: 'Apps de gestión de finca' },
      { text: 'Sensores / IoT' },
      { text: 'Plataformas de comercialización' },
      { text: 'Ninguna' },
    ]);

    const qEX6 = await saveQuestion(manager, {
      text: 'EX.6 ★ — ¿Con qué frecuencia visita cada unidad productiva bajo su acompañamiento?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });
    await saveOptions(manager, qEX6, [
      { text: 'Semanal o más frecuente' },
      { text: 'Quincenal' },
      { text: 'Mensual' },
      { text: 'Cada 2–3 meses' },
      { text: 'Ocasional / según demanda' },
    ]);

    const qEX7 = await saveQuestion(manager, {
      text: 'EX.7 ★ — ¿Qué canales o medios usa para comunicarse con los productores?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEX,
    });
    await saveOptions(manager, qEX7, [
      { text: 'Visita presencial en campo' },
      { text: 'Llamada telefónica' },
      { text: 'WhatsApp' },
      { text: 'SMS' },
      { text: 'Grupos comunitarios / asambleas' },
      { text: 'Radio comunitaria' },
      { text: 'Plataforma institucional' },
    ]);
  }
}
