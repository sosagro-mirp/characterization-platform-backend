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

// ─── Constantes compartidas ───────────────────────────────────────────────────

const OPTS_SI_NO_NSA = [
  { text: 'Sí' },
  { text: 'No' },
  { text: 'No sabe / No aplica' },
];

const OPTS_LICENCIA = [
  { text: 'Uso adulto (ley 2204/2022)' },
  { text: 'Uso médico y científico (ley 1787/2016)' },
  { text: 'Semillas / Material vegetal (ICA)' },
  { text: 'No tiene licencia' },
  { text: 'En trámite' },
];

const OPTS_DESTINO = [
  { text: 'Venta directa local' },
  { text: 'Intermediario / Acopiador' },
  { text: 'Cooperativa / Asociación' },
  { text: 'Exportación directa' },
  { text: 'Comercializador nacional' },
  { text: 'Industria / transformador' },
  { text: 'Otro', isOther: true },
];

const OPTS_CERTIFICACION = [
  { text: 'Orgánico NTC/USDA' },
  { text: 'Rainforest Alliance' },
  { text: 'UTZ' },
  { text: 'Fair Trade / Comercio Justo' },
  { text: 'Denominación de Origen' },
  { text: 'Ninguna' },
  { text: 'Otro', isOther: true },
];

// ─── Helper: resolver tipos ───────────────────────────────────────────────────

async function loadTypes(
  manager: EntityManager,
  names: string[],
): Promise<Record<string, TypeOfQuestion>> {
  const repo = manager.getRepository(TypeOfQuestion);
  const types: Record<string, TypeOfQuestion> = {};
  for (const n of names) {
    const t = await repo.findOne({ where: { name: n } });
    if (!t) throw new Error(`[seed] TypeOfQuestion "${n}" no encontrado.`);
    types[n] = t;
  }
  return types;
}

// ─── 4.1 Poscosecha - Cacao ───────────────────────────────────────────────────

async function seedPoscosechaCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S4.1: Poscosecha Cacao';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ]);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const sec = await sectionRepo.save(
    sectionRepo.create({
      name: '4.1 Cacao — Poscosecha',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const qActividades = await saveQuestion(manager, {
    text: '4.1 — Actividades de poscosecha que realiza en cacao',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, qActividades, [
    { text: 'Cosecha selectiva por madurez' },
    { text: 'Desgrane / apertura de mazorcas' },
    { text: 'Clasificación / selección de grano' },
    { text: 'Fermentación' },
    { text: 'Secado' },
    { text: 'Transformación del grano' },
    { text: 'Almacenamiento' },
    { text: 'Empaque y etiquetado' },
  ]);

  await saveQuestion(manager, {
    text: '4.1.1 ★ — ¿Realiza fermentación?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q412 = await saveQuestion(manager, {
    text: '4.1.2 ★ — ¿En qué tipo de recipiente fermenta?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q412, [
    { text: 'Cajones de madera' },
    { text: 'Sacos de yute' },
    { text: 'Montón' },
    { text: 'No realiza fermentación' },
    { text: 'Otro', isOther: true },
  ]);

  const q413 = await saveQuestion(manager, {
    text: '4.1.3 ★ — ¿Los clones se fermentan por separado o mezclados?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q413, [
    { text: 'Por separado' },
    { text: 'Mezclados' },
  ]);

  await saveQuestion(manager, {
    text: '4.1.4 — Clones en fermentación actualmente',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.5 ★ — Duración promedio de la fermentación (días)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.6 ★ — ¿Cómo sabe que el grano está bien fermentado? (características visuales, olfativas)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.7 ★ — ¿Qué mediciones realiza durante la fermentación?',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.8 ★ — Análisis de control de calidad en finca al cacao fermentado',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.9 — Análisis de control de calidad que manda hacer a laboratorio (fermentado)',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.10 — Calidad sensorial habitual de la fermentación',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.11 — ¿Comercializa el grano en estado fermentado?',
    type: types.yes_no,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.12 ★ — ¿Realiza secado?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q413s = await saveQuestion(manager, {
    text: '4.1.13 ★ — Tipo de secado que utiliza',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q413s, [
    { text: 'Marquesina plástica' },
    { text: 'Patio de cemento' },
    { text: 'Secador solar tipo domo' },
    { text: 'Secador mecánico' },
    { text: 'Al sol directo sobre lonas' },
    { text: 'Otro', isOther: true },
  ]);

  await saveQuestion(manager, {
    text: '4.1.14 — ¿Realiza volteos durante el secado?',
    type: types.yes_no,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.15 — Frecuencia de volteos durante el secado',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.16 ★ — Duración promedio del secado (días)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.17 ★ — ¿Cómo sabe que el grano está bien seco?',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q418 = await saveQuestion(manager, {
    text: '4.1.18 ★ — ¿Mide la humedad final del grano seco?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.18b — Instrumento utilizado para medir humedad',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q418,
    conditionValue: 'true',
  });

  await saveQuestion(manager, {
    text: '4.1.19 ★ — Humedad final habitual del grano seco (%)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.20 ★ — Análisis de calidad en finca al cacao seco',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.21 — Análisis de calidad al cacao seco que manda a laboratorio',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  const q422 = await saveQuestion(manager, {
    text: '4.1.22 ★ — ¿Conoce y cumple la NTC 1252?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q422, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '4.1.23 — ¿Mide el índice de mazorca (IM)?',
    type: types.yes_no,
    isRequired: false,
    order: o++,
    section: sec,
  });

  const q424 = await saveQuestion(manager, {
    text: '4.1.24 ★ — ¿Mide el peso de 100 granos secos?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.1.24b — Valor habitual del peso de 100 granos secos (g)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q424,
    conditionValue: 'true',
  });

  const q425 = await saveQuestion(manager, {
    text: '4.1.25 — ¿Comercializa el grano seco? Indique ámbito',
    type: types.single_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q425, [
    { text: 'Regional' },
    { text: 'Nacional' },
    { text: 'Internacional' },
    { text: 'Todas las anteriores' },
  ]);

  const q426 = await saveQuestion(manager, {
    text: '4.1.26 ★ — Canal de comercialización del cacao',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q426, OPTS_DESTINO);

  const q427 = await saveQuestion(manager, {
    text: '4.1.27 — ¿Tiene alguna certificación?',
    type: types.single_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q427, OPTS_CERTIFICACION);

  await saveQuestion(manager, {
    text: '4.1.28 — Precio promedio de venta (COP / kg cacao seco)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
  });

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 4.2 Poscosecha - Café ────────────────────────────────────────────────────

async function seedPoscosechaCafe(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S4.2: Poscosecha Café';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ]);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const sec = await sectionRepo.save(
    sectionRepo.create({ name: '4.2 Café — Poscosecha', order: 1, instrument }),
  );

  let o = 1;

  const qActividades = await saveQuestion(manager, {
    text: '4.2 — Actividades de poscosecha que realiza en café',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, qActividades, [
    { text: 'Recolección selectiva (solo cerezas maduras)' },
    { text: 'Despulpado' },
    { text: 'Fermentación (vía húmeda)' },
    { text: 'Lavado' },
    { text: 'Secado' },
    { text: 'Trillado' },
    { text: 'Clasificación de grano' },
    { text: 'Tostión' },
  ]);

  const q421 = await saveQuestion(manager, {
    text: '4.2.1 ★ — Método de beneficio predominante',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q421, [
    { text: 'Vía húmeda (fermentación + lavado)' },
    { text: 'Vía seca (natural / honey)' },
    { text: 'Semi-húmedo (honey)' },
    { text: 'Mixto' },
  ]);

  await saveQuestion(manager, {
    text: '4.2.2 ★ — Tiempo de fermentación (horas)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q423 = await saveQuestion(manager, {
    text: '4.2.3 ★ — ¿Controla la humedad del café pergamino seco?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.2.3b — Valor habitual de humedad del pergamino seco (%)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q423,
    conditionValue: 'true',
  });

  await saveQuestion(manager, {
    text: '4.2.4 ★ — ¿Realiza catación / evaluación sensorial?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.2.5 — Puntaje promedio en taza (SCA score)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
  });

  const q426 = await saveQuestion(manager, {
    text: '4.2.6 ★ — ¿Conoce la Norma de Calidad de la FNC / NTC 2090?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q426, OPTS_SI_NO_NSA);

  const q427 = await saveQuestion(manager, {
    text: '4.2.7 ★ — Tipo de café que comercializa actualmente',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q427, [
    { text: 'Café cereza' },
    { text: 'Café pergamino húmedo' },
    { text: 'Café pergamino seco' },
    { text: 'Café trillado / excelso' },
    { text: 'Café tostado' },
    { text: 'Café especial' },
  ]);

  const q428 = await saveQuestion(manager, {
    text: '4.2.8 — ¿Tiene alguna certificación?',
    type: types.single_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q428, OPTS_CERTIFICACION);

  await saveQuestion(manager, {
    text: '4.2.9 — Precio promedio de venta (COP / carga pergamino seco)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
  });

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 4.3 Poscosecha - Cannabis ────────────────────────────────────────────────

async function seedPoscosechaCannabis(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S4.3: Poscosecha Cannabis';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ]);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const sec = await sectionRepo.save(
    sectionRepo.create({
      name: '4.3 Cannabis — Poscosecha',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const qActividades = await saveQuestion(manager, {
    text: '4.3 — Actividades de poscosecha que realiza en cannabis',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, qActividades, [
    { text: 'Cosecha (corte de planta)' },
    { text: 'Secado' },
    { text: 'Curado' },
    { text: 'Despalillado / Trimming' },
    { text: 'Clasificación' },
    { text: 'Extracción (aceites, resinas, etc.)' },
    { text: 'Empaque y embalaje' },
  ]);

  const q431 = await saveQuestion(manager, {
    text: '4.3.1 ★ — Tipo de licencia con que opera',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q431, OPTS_LICENCIA);

  const q432 = await saveQuestion(manager, {
    text: '4.3.2 ★ — ¿Controla el porcentaje de humedad en flor seca?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.3.2b — Valor habitual de humedad en flor seca (%)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q432,
    conditionValue: 'true',
  });

  await saveQuestion(manager, {
    text: '4.3.3 ★ — ¿Mide el contenido de CBD y/o THC con análisis de laboratorio?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.3.4 ★ — ¿Tiene análisis microbiológicos de sus productos?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.3.5 ★ — ¿Realiza pruebas de pesticidas y metales pesados?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q436 = await saveQuestion(manager, {
    text: '4.3.6 ★ — ¿Cuenta con Buenas Prácticas de Manufactura certificadas (INVIMA)?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q436, [
    { text: 'Sí' },
    { text: 'No' },
    { text: 'En trámite' },
  ]);

  await saveQuestion(manager, {
    text: '4.3.7 — ¿Tiene alguna certificación de calidad?',
    type: types.open_text,
    isRequired: false,
    order: o++,
    section: sec,
  });

  const q438 = await saveQuestion(manager, {
    text: '4.3.8 ★ — Destino principal del producto',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q438, OPTS_DESTINO);

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 4.4 Poscosecha - Cáñamo ──────────────────────────────────────────────────

async function seedPoscosechaCanamo(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S4.4: Poscosecha Cáñamo';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, [
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ]);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const sec = await sectionRepo.save(
    sectionRepo.create({
      name: '4.4 Cáñamo — Poscosecha',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const qActividades = await saveQuestion(manager, {
    text: '4.4 — Actividades de poscosecha que realiza en cáñamo',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, qActividades, [
    { text: 'Cosecha mecánica / manual' },
    { text: 'Desfibrado' },
    { text: 'Secado de fibra / semilla / flor' },
    { text: 'Clasificación de fibra' },
    { text: 'Extracción de CBD' },
    { text: 'Prensado de semilla / aceite' },
    { text: 'Empaque' },
  ]);

  const q441 = await saveQuestion(manager, {
    text: '4.4.1 ★ — Tipo de licencia con que opera',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q441, OPTS_LICENCIA);

  const q442 = await saveQuestion(manager, {
    text: '4.4.2 ★ — Producto principal obtenido',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q442, [
    { text: 'Fibra' },
    { text: 'Semilla' },
    { text: 'CBD' },
    { text: 'Múltiple' },
  ]);

  const q443 = await saveQuestion(manager, {
    text: '4.4.3 ★ — ¿Mide contenido de CBD en materia seca?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.4.3b — Valor habitual de CBD en materia seca (%)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q443,
    conditionValue: 'true',
  });

  await saveQuestion(manager, {
    text: '4.4.4 ★ — ¿Verifica que el THC sea ≤ 1% (requisito legal)?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q445 = await saveQuestion(manager, {
    text: '4.4.5 ★ — ¿Controla la humedad en el secado?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '4.4.5b — Valor objetivo de humedad en el secado (%)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
    conditionQuestion: q445,
    conditionValue: 'true',
  });

  const q446 = await saveQuestion(manager, {
    text: '4.4.6 — ¿Tiene alguna certificación?',
    type: types.single_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q446, OPTS_CERTIFICACION);

  const q447 = await saveQuestion(manager, {
    text: '4.4.7 ★ — Destino principal del producto',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q447, OPTS_DESTINO);

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 4.5 Energía y Equipos ────────────────────────────────────────────────────

async function seedPoscosechaEquipos(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S4.5: Energía y Equipos';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, ['multiple_choice']);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const sec = await sectionRepo.save(
    sectionRepo.create({
      name: '4.5 Energía y equipos utilizados en el proceso',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const q451 = await saveQuestion(manager, {
    text: '4.5.1 — ¿Qué equipos utiliza en sus procesos?',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q451, [
    { text: 'Secadores' },
    { text: 'Tostadores' },
    { text: 'Calderas' },
    { text: 'Hornos' },
    { text: 'Ninguno' },
    { text: 'Otro', isOther: true },
  ]);

  const q452 = await saveQuestion(manager, {
    text: '4.5.2 — ¿Qué combustibles utiliza en los procesos?',
    type: types.multiple_choice,
    isRequired: false,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q452, [
    { text: 'Leña' },
    { text: 'Gas natural / propano' },
    { text: 'Electricidad' },
    { text: 'Carbón' },
    { text: 'Biogás / biocombustible' },
    { text: 'Otro', isOther: true },
  ]);

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function seedInstrumentosPoscosecha(
  manager: EntityManager,
): Promise<void> {
  await seedPoscosechaCacao(manager);
  await seedPoscosechaCafe(manager);
  await seedPoscosechaCannabis(manager);
  await seedPoscosechaCanamo(manager);
  await seedPoscosechaEquipos(manager);
}
