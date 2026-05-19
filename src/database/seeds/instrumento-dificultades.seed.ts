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
  conditionQuestion?: Question;
  conditionValue?: string;
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
      conditionQuestion: def.conditionQuestion,
      conditionValue: def.conditionValue,
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(
      repo.create({ question, text: opt.text, isOther: opt.isOther ?? false }),
    );
    map.set(opt.text, saved.optionId);
  }
  return map;
}

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S5: Dificultades para Cumplir Estándares de Calidad';
const VERSION = 1;

export async function seedInstrumentoDificultades(
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

  const typeNames = [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ];
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

  const [sec51, sec52, sec53, sec54] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '5.1 Barreras principales',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '5.2 Tipo de apoyo necesario',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '5.3 Reconocimiento por alta calidad',
        order: 3,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '5.4 Impacto económico del incumplimiento',
        order: 4,
        instrument,
      }),
    ),
  ]);

  // ── 5.1 Barreras principales ─────────────────────────────────────────────────
  {
    let o = 1;

    const q51 = await saveQuestion(manager, {
      text: '5.1 ★ — ¿Cuáles son sus principales dificultades para cumplir los estándares de calidad?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec51,
    });
    await saveOptions(manager, q51, [
      {
        text: 'Falta de equipos para medir parámetros de calidad (humedad, Brix, pH, etc.)',
      },
      { text: 'Falta de conocimiento técnico sobre procesos de poscosecha' },
      {
        text: 'Condiciones climáticas adversas (exceso de lluvia, temperaturas extremas)',
      },
      {
        text: 'Infraestructura deficiente (marquesinas, cajones de fermentación, bodegas)',
      },
      {
        text: 'Acceso limitado a insumos de calidad (semillas certificadas, fertilizantes)',
      },
      {
        text: 'Dificultades en el proceso de fermentación (duración, temperatura, volteo)',
      },
      { text: 'Dificultades en el secado (tiempo, temperatura, uniformidad)' },
      { text: 'Problemas de plagas y enfermedades que afectan la calidad' },
      { text: 'Agua de mala calidad para los procesos de beneficio' },
      { text: 'Dificultades de transporte del producto al punto de venta' },
      {
        text: 'Falta de laboratorios de análisis de calidad accesibles o económicos',
      },
      { text: 'Exigencias de certificaciones que no puede costear' },
      { text: 'Poca información sobre las normas técnicas aplicables' },
      { text: 'Contaminación por residuos de pesticidas o metales pesados' },
      { text: 'Falta de conocimiento / apoyo institucional' },
      { text: 'Falta de financiamiento para mejorar procesos' },
      { text: 'Otro', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: '5.1a — Otra dificultad importante (especifique)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec51,
    });
  }

  // ── 5.2 Tipo de apoyo necesario ───────────────────────────────────────────────
  {
    const q52 = await saveQuestion(manager, {
      text: '5.2 ★ — ¿Qué tipo de apoyo necesitaría principalmente para superar esas dificultades?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: 1,
      section: sec52,
    });
    await saveOptions(manager, q52, [
      { text: 'Capacitación técnica' },
      { text: 'Financiamiento / crédito' },
      { text: 'Equipos / tecnología' },
      { text: 'Acompañamiento técnico continuo' },
      { text: 'Normas y certificaciones' },
      { text: 'Acceso a mercados' },
    ]);
  }

  // ── 5.3 Reconocimiento por alta calidad ───────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '¿Ha sido postulado por cumplimiento de altos estándares de calidad? Si Sí: ¿Cuándo, en qué concurso/evento, entidad, variedad/clon?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec53,
    });

    await saveQuestion(manager, {
      text: '¿Ha sido premiado por cumplimiento de altos estándares de calidad? Si Sí: ¿Cuándo, en qué concurso/evento, entidad, variedad/clon?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec53,
    });

    await saveQuestion(manager, {
      text: '¿Cuál es el atributo de calidad superior que más caracteriza su producción?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec53,
    });

    const qIntl = await saveQuestion(manager, {
      text: '¿La calidad de su producción cumple con estándares internacionales?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec53,
    });
    await saveOptions(manager, qIntl, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);
  }

  // ── 5.4 Impacto económico del incumplimiento ──────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '5.3 ★ — ¿Ha tenido rechazo de producto por incumplimiento de calidad en el último año?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec54,
    });

    const q54 = await saveQuestion(manager, {
      text: '5.4 ★ — Frecuencia de rechazo de producto por calidad',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec54,
    });
    await saveOptions(manager, q54, [
      { text: 'Nunca' },
      { text: 'Raramente (< 10% de la producción)' },
      { text: 'Ocasionalmente (10–30%)' },
      { text: 'Frecuentemente (> 30%)' },
    ]);

    await saveQuestion(manager, {
      text: '5.5 ★ — ¿Qué hace con el producto rechazado?',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec54,
    });

    await saveQuestion(manager, {
      text: '5.5a — ¿Cuál variedad / clon le han rechazado?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec54,
    });

    await saveQuestion(manager, {
      text: '5.6 — Estimación de pérdidas económicas por calidad (COP / año)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec54,
    });

    const q57 = await saveQuestion(manager, {
      text: '5.7 — ¿Conoce el precio diferencial que pagarían por producto de mejor calidad?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec54,
    });
    const opts57 = await saveOptions(manager, q57, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);

    await saveQuestion(manager, {
      text: '5.7b — Valor aproximado o rango del precio diferencial (COP / kg o carga)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec54,
      conditionQuestion: q57,
      conditionValue: opts57.get('Sí')!,
    });
  }
}
