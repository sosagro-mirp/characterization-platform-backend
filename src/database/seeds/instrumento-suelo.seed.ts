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
  options: { text: string; value?: number; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(
      repo.create({
        question,
        text: opt.text,
        value: opt.value,
        isOther: opt.isOther ?? false,
      }),
    );
    map.set(opt.text, saved.optionId);
  }
  return map;
}

// ─── Constantes compartidas ───────────────────────────────────────────────────

const OPTS_SI_NO_NSA = [
  { text: 'Sí' },
  { text: 'No' },
  { text: 'No sabe / No aplica' },
];

const OPTS_CONTROL_FITOSANITARIO = [
  { text: 'Manual' },
  { text: 'Química de síntesis' },
  { text: 'Manual + química de síntesis' },
  { text: 'Control biológico' },
  { text: 'Ninguno' },
];

const OPTS_SUSCEPTIBILIDAD = [
  { text: 'MS (Muy susceptible)' },
  { text: 'S (Susceptible)' },
  { text: 'MR (Moderadamente resistente)' },
  { text: 'R (Resistente)' },
];

// ─── Instrumento: Suelo - General ────────────────────────────────────────────

async function seedSueloGeneral(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  const NAME = 'S3: Manejo del Cultivo, Suelo y Condiciones Ambientales';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(
      `[seed] Instrumento "${NAME}" v${VERSION} ya existe. Se omite.`,
    );
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
  console.log(`[seed] Instrumento "${NAME}" creado.`);

  const [sec31, sec32, sec33, sec342] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '3.1 Variables climáticas de la zona',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '3.2 Suelo o sustrato — análisis y características',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '3.3 Indicadores para la decisión de cosecha',
        order: 3,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '3.4 Sanidad del cultivo — manejo fitosanitario',
        order: 4,
        instrument,
      }),
    ),
  ]);

  // ── Sección 3.1 — Variables climáticas ──────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: 'Temperatura promedio de la zona (°C)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec31,
    });

    await saveQuestion(manager, {
      text: 'Humedad relativa promedio (%)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec31,
    });

    const q33 = await saveQuestion(manager, {
      text: '3.3 — ¿La zona tiene lluvias frecuentes o marcadas?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec31,
    });
    const opts33 = await saveOptions(manager, q33, OPTS_SI_NO_NSA);

    await saveQuestion(manager, {
      text: '3.3b — Descripción del patrón de lluvias',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec31,
      conditionQuestion: q33,
      conditionValue: opts33.get('Sí')!,
    });

    await saveQuestion(manager, {
      text: '3.4 — ¿Hay vientos fuertes en la zona?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec31,
    });

    await saveQuestion(manager, {
      text: '3.5 — ¿Hay nubosidad o neblina frecuente?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec31,
    });

    await saveQuestion(manager, {
      text: '3.6 — Presión atmosférica, si se conoce (hPa)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec31,
    });
  }

  // ── Sección 3.2 — Suelo o sustrato ──────────────────────────────────────────
  {
    let o = 1;

    const q37 = await saveQuestion(manager, {
      text: '3.7 — Tipo de suelo o sustrato predominante',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec32,
    });
    await saveOptions(manager, q37, [
      { text: 'Franco' },
      { text: 'Franco arenoso' },
      { text: 'Franco arcilloso' },
      { text: 'Arcilloso' },
      { text: 'Arenoso' },
      { text: 'Limoso' },
      { text: 'Orgánico' },
      { text: 'No sabe' },
    ]);

    const q38 = await saveQuestion(manager, {
      text: '3.8 ★ — ¿Ha realizado estudio de suelo o sustrato?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec32,
    });

    await saveQuestion(manager, {
      text: '3.8b — Año del último análisis de suelo',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec32,
      conditionQuestion: q38,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: '3.8c — ¿Con qué frecuencia realiza análisis de suelos o sustratos?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec32,
    });

    await saveQuestion(manager, {
      text: '3.9 — pH del suelo o sustrato (último análisis)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec32,
    });

    const q310 = await saveQuestion(manager, {
      text: '3.10 ★ — ¿El estudio incluyó análisis de metales pesados?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec32,
    });
    await saveOptions(manager, q310, OPTS_SI_NO_NSA);

    const q311 = await saveQuestion(manager, {
      text: '3.11 ★ — ¿El estudio incluyó análisis de pesticidas?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec32,
    });
    await saveOptions(manager, q311, OPTS_SI_NO_NSA);

    const q312 = await saveQuestion(manager, {
      text: '3.12 — ¿El estudio incluyó análisis microbiológico?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec32,
    });
    await saveOptions(manager, q312, OPTS_SI_NO_NSA);

    await saveQuestion(manager, {
      text: '3.13 — ¿Puede compartir los resultados del estudio de suelo con el proyecto?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec32,
    });

    const q314 = await saveQuestion(manager, {
      text: '3.14 ★ — Tipo de fertilización que utiliza',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec32,
    });
    await saveOptions(manager, q314, [
      { text: 'Orgánica' },
      { text: 'Química de síntesis' },
      { text: 'Química orgánica + síntesis' },
      { text: 'No fertiliza' },
    ]);

    await saveQuestion(manager, {
      text: '3.15 ★ — Fertilizante(s) empleado(s) — nombre comercial / ficha técnica',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec32,
    });

    await saveQuestion(manager, {
      text: '3.16 — Frecuencia de fertilización',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec32,
    });
  }

  // ── Sección 3.3 — Indicadores para la decisión de cosecha ───────────────────
  {
    let o = 1;

    const q317 = await saveQuestion(manager, {
      text: '3.17 ★ — ¿Qué indicadores usa para decidir cuándo cosechar?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec33,
    });
    await saveOptions(manager, q317, [
      { text: 'Apariencia visual (color, tamaño, textura del fruto)' },
      { text: 'Grados Brix (contenido de azúcar)' },
      { text: 'Porcentaje de humedad del grano' },
      { text: 'Días desde floración o siembra' },
      { text: 'Índice de mazorca / Índice de grano (Cacao)' },
      { text: 'Contenido de cannabinoides THC/CBD (Cannabis / Cáñamo)' },
      { text: 'Asesoría de técnico o agrónomo' },
      { text: 'Experiencia propia / criterio empírico' },
      { text: 'Ningún indicador definido' },
      { text: 'Otro (especifique)', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: '3.17a — Especifique otro indicador de cosecha',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec33,
    });

    await saveQuestion(manager, {
      text: '¿Cuál es la variedad o clon con mayor productividad? (mencione los tres primeros)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec33,
    });

    await saveQuestion(manager, {
      text: '¿Cuál es la variedad o clon con menor productividad? (mencione los tres primeros)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec33,
    });
  }

  // ── Sección 3.4 — Sanidad del cultivo — todos los cultivos ──────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '3.22 ★ — Principales enfermedades / plagas presentes en el último año',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '3.23 ★ — ¿Cómo identifica enfermedades o plagas en su cultivo?',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '¿Cuál variedad o clon es más propenso a enfermedades y a cuál? (nombre los tres más susceptibles)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '3.24 — ¿Qué hace cuando detecta una enfermedad?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec342,
    });

    const q325 = await saveQuestion(manager, {
      text: '3.25 ★ — Tipo de control de enfermedades',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });
    await saveOptions(manager, q325, OPTS_CONTROL_FITOSANITARIO);

    const q326 = await saveQuestion(manager, {
      text: '3.26 ★ — Tipo de control de plagas',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });
    await saveOptions(manager, q326, OPTS_CONTROL_FITOSANITARIO);

    await saveQuestion(manager, {
      text: '3.27 ★ — ¿Usa plaguicidas / herbicidas / fungicidas?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    const q328 = await saveQuestion(manager, {
      text: '3.28 ★ — ¿Los plaguicidas están registrados ante el ICA?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });
    await saveOptions(manager, q328, OPTS_SI_NO_NSA);

    await saveQuestion(manager, {
      text: '3.29 ★ — Liste los plaguicidas utilizados (nombre comercial)',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '3.30 ★ — ¿Aplica Buenas Prácticas Agrícolas (BPA)?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '3.31 — ¿Ha recibido capacitación en BPA o BPM?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec342,
    });

    const q332 = await saveQuestion(manager, {
      text: '3.32 ★ — ¿Recibe asistencia técnica para el manejo del cultivo?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec342,
    });

    await saveQuestion(manager, {
      text: '3.33 — Fuente de la asistencia técnica',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec342,
      conditionQuestion: q332,
      conditionValue: 'true',
    });
  }
}

// ─── Instrumento: Suelo - Cacao ───────────────────────────────────────────────

async function seedSueloCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  const NAME = 'S3.4.1: Susceptibilidad a Enfermedades (Cacao)';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(
      `[seed] Instrumento "${NAME}" v${VERSION} ya existe. Se omite.`,
    );
    return;
  }

  const t = await typeRepo.findOne({ where: { name: 'single_choice' } });
  if (!t)
    throw new Error('[seed] TypeOfQuestion "single_choice" no encontrado.');
  const tOpen = await typeRepo.findOne({ where: { name: 'open_text' } });
  if (!tOpen)
    throw new Error('[seed] TypeOfQuestion "open_text" no encontrado.');

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );
  console.log(`[seed] Instrumento "${NAME}" creado.`);

  const sec = await sectionRepo.save(
    sectionRepo.create({
      name: '3.4.1 Susceptibilidad a enfermedades — Cacao',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const q318 = await saveQuestion(manager, {
    text: '3.18 — Susceptibilidad a Escoba de Bruja',
    type: t,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q318, OPTS_SUSCEPTIBILIDAD);

  const q319 = await saveQuestion(manager, {
    text: '3.19 ★ — Susceptibilidad a Fitóftora / Monilia',
    type: t,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q319, OPTS_SUSCEPTIBILIDAD);

  const q320 = await saveQuestion(manager, {
    text: '3.20 — Reacción a Monilia',
    type: t,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q320, OPTS_SUSCEPTIBILIDAD);

  const q321 = await saveQuestion(manager, {
    text: '3.21 — Susceptibilidad a Mal Rosado',
    type: t,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q321, OPTS_SUSCEPTIBILIDAD);

  await saveQuestion(manager, {
    text: '3.21b — Susceptibilidad a otra enfermedad o plaga — ¿Cuál?',
    type: tOpen,
    isRequired: false,
    order: o++,
    section: sec,
  });
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function seedInstrumentosSuelo(
  manager: EntityManager,
): Promise<void> {
  await seedSueloGeneral(manager);
  await seedSueloCacao(manager);
}
