import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Opciones compartidas ─────────────────────────────────────────────────────

const OPTS_SI_NO_NSA = [
  { text: 'Sí' },
  { text: 'No' },
  { text: 'No sabe / No aplica' },
];

const OPTS_FUENTE_AGUA = [
  { text: 'Río' },
  { text: 'Quebrada' },
  { text: 'Pozo profundo' },
  { text: 'Pozo somero' },
  { text: 'Agua lluvia' },
  { text: 'Reservorio / Jagüey' },
  { text: 'Acueducto veredal' },
  { text: 'Acueducto municipal' },
  { text: 'Otro', isOther: true },
];

const OPTS_DESTINO_AGUA = [
  { text: 'Reúso en cultivo' },
  { text: 'Suelo sin tratar' },
  { text: 'Alcantarillado' },
  { text: 'Cuerpo de agua (quebrada / río)' },
  { text: 'Tanque de almacenamiento' },
  { text: 'Otro', isOther: true },
];

const OPTS_TRATAMIENTO_AGUA = [
  { text: 'Filtración (arena, grava)' },
  { text: 'Carbón activado' },
  { text: 'Ósmosis inversa' },
  { text: 'Desinfección UV' },
  { text: 'Cloración' },
  { text: 'Acidificación / alcalinización' },
  { text: 'Sin tratamiento' },
  { text: 'Otro', isOther: true },
];

const OPTS_FRECUENCIA = [
  { text: 'Semanal o más frecuente' },
  { text: 'Quincenal' },
  { text: 'Mensual' },
  { text: 'Cada 2–3 meses' },
  { text: 'Ocasional / según demanda' },
];

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
  const q = repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
  });
  return repo.save(q);
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const o = repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
    });
    const saved = await repo.save(o);
    map.set(opt.text, saved.optionId);
  }
  return map;
}

// Helper para el patrón yes_no + follow-up open_text ("Si Sí: …")
async function saveYesNoWithFollowUp(
  manager: EntityManager,
  section: Section,
  types: Record<string, TypeOfQuestion>,
  gateText: string,
  followUpText: string,
  isRequired: boolean,
  isSelectionCriteria: boolean,
  orderRef: { value: number },
  followUpType: TypeOfQuestion = types.open_text,
): Promise<Question> {
  const gate = await saveQuestion(manager, {
    text: gateText,
    type: types.yes_no,
    isRequired,
    isSelectionCriteria,
    order: orderRef.value++,
    section,
  });
  await saveQuestion(manager, {
    text: followUpText,
    type: followUpType,
    isRequired: false,
    order: orderRef.value++,
    section,
    conditionQuestion: gate,
    conditionValue: 'true',
  });
  return gate;
}

// ─── 7A — Agua en el Cultivo de Cacao ────────────────────────────────────────

async function seedInstrumento7A(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S7A: Agua en el Cultivo de Cacao';
  const version = 1;

  if (await instrumentRepo.findOne({ where: { name, version } })) {
    console.log(
      `[seed] Instrumento "${name}" v${version} ya existe. Se omite.`,
    );
    return;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name,
      version,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const section = await sectionRepo.save(
    sectionRepo.create({
      name: '7A Fuente y Uso del Agua — Cacao',
      order: 1,
      instrument,
    }),
  );

  const o = { value: 1 };

  // 7A.1
  await saveQuestion(manager, {
    text: '7A.1 ★ — ¿Tiene acceso a fuente(s) de agua en la finca?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.2
  const fuenteQ = await saveQuestion(manager, {
    text: '7A.2 ★ — Tipo de fuente de agua principal',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, fuenteQ, OPTS_FUENTE_AGUA);

  // 7A.3
  await saveQuestion(manager, {
    text: '7A.3 ★ — ¿Cuántas fuentes de agua tiene cerca de la finca?',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.4
  await saveQuestion(manager, {
    text: '7A.4 ★ — ¿Usa agua para riego del cultivo de cacao?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.5
  await saveQuestion(manager, {
    text: '7A.5 ★ — ¿Usa agua en el proceso de beneficio (fermentación, lavado)?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.6
  await saveQuestion(manager, {
    text: '7A.6 — ¿Cuánta agua usa por ciclo de fermentación / lavado? (Indique valor y unidad: L o m³)',
    type: types.open_text,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7A.7
  await saveQuestion(manager, {
    text: '7A.7 — ¿Usa agua adicional durante el despulpado o apertura de mazorcas?',
    type: types.yes_no,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7A.8
  await saveQuestion(manager, {
    text: '7A.8 ★ — ¿Se generan aguas mieles / lixiviados durante el beneficio?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.9
  const destinoQ = await saveQuestion(manager, {
    text: '7A.9 ★ — Destino de las aguas mieles / lixiviados',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, destinoQ, OPTS_DESTINO_AGUA);

  // 7A.10
  await saveQuestion(manager, {
    text: '7A.10 — ¿Cuál es el volumen estimado de lixiviados por tonelada procesada? (L/t)',
    type: types.numeric,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7A.11
  const calidadQ = await saveQuestion(manager, {
    text: '7A.11 ★ — ¿Conoce la calidad del agua que usa?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, calidadQ, OPTS_SI_NO_NSA);

  // 7A.12
  await saveQuestion(manager, {
    text: '7A.12 ★ — ¿Ha realizado análisis de calidad del agua (pH, turbidez, microbiológico)?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.13
  const metalesQ = await saveQuestion(manager, {
    text: '7A.13 ★ — ¿Ha detectado o sospecha contaminación por metales pesados en el agua?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, metalesQ, OPTS_SI_NO_NSA);

  // 7A.14
  const pesticidасQ = await saveQuestion(manager, {
    text: '7A.14 ★ — ¿Ha detectado o sospecha contaminación por pesticidas o agroquímicos?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, pesticidасQ, OPTS_SI_NO_NSA);

  // 7A.15 + 7A.16 (tratamiento → tipo)
  const tratamientoGate = await saveQuestion(manager, {
    text: '7A.15 ★ — ¿Realiza algún tratamiento al agua antes de usarla en el proceso?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  const tipoTratamientoQ = await saveQuestion(manager, {
    text: '7A.16 — Tipo de tratamiento del agua (Aplica si respondió Sí en 7A.15)',
    type: types.single_choice,
    isRequired: false,
    order: o.value++,
    section,
    conditionQuestion: tratamientoGate,
    conditionValue: 'true',
  });
  await saveOptions(manager, tipoTratamientoQ, OPTS_TRATAMIENTO_AGUA);

  // 7A.17
  const descartaQ = await saveQuestion(manager, {
    text: '7A.17 ★ — ¿Cómo descarta las aguas residuales del beneficio?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, descartaQ, OPTS_DESTINO_AGUA);

  // 7A.18
  await saveQuestion(manager, {
    text: '7A.18 ★ — ¿Tiene algún sistema de tratamiento de aguas residuales?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7A.19
  const interesQ = await saveQuestion(manager, {
    text: '7A.19 ★ — ¿Estaría interesado en instalar un sistema de tratamiento de aguas en su finca?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, interesQ, OPTS_SI_NO_NSA);

  // 7A.20
  const impactoQ = await saveQuestion(manager, {
    text: '7A.20 ★ — ¿Su proceso genera impacto ambiental en las aguas cercanas?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, impactoQ, OPTS_SI_NO_NSA);

  console.log(
    `[seed] Instrumento "${name}" insertado (${o.value - 1} preguntas).`,
  );
}

// ─── 7B — Agua en el Cultivo de Café ─────────────────────────────────────────

async function seedInstrumento7B(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S7B: Agua en el Cultivo de Café';
  const version = 1;

  if (await instrumentRepo.findOne({ where: { name, version } })) {
    console.log(
      `[seed] Instrumento "${name}" v${version} ya existe. Se omite.`,
    );
    return;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name,
      version,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  const section = await sectionRepo.save(
    sectionRepo.create({
      name: '7B Fuente y Uso del Agua — Café',
      order: 1,
      instrument,
    }),
  );

  const o = { value: 1 };

  // 7B.1
  await saveQuestion(manager, {
    text: '7B.1 ★ — ¿Tiene acceso a fuente(s) de agua en la finca?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.2
  const fuenteQ = await saveQuestion(manager, {
    text: '7B.2 ★ — Tipo de fuente de agua principal',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, fuenteQ, OPTS_FUENTE_AGUA);

  // 7B.3
  await saveQuestion(manager, {
    text: '7B.3 ★ — ¿Usa agua en el proceso de despulpado?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.4
  await saveQuestion(manager, {
    text: '7B.4 ★ — ¿Usa agua en la fermentación y lavado del café?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.5
  const usosQ = await saveQuestion(manager, {
    text: '7B.5 ★ — ¿Para qué usa el agua en el proceso? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, usosQ, [
    { text: 'Despulpado' },
    { text: 'Fermentación' },
    { text: 'Lavado del grano' },
    { text: 'Enfriamiento' },
    { text: 'Limpieza de equipos' },
    { text: 'Otro', isOther: true },
  ]);

  // 7B.6
  await saveQuestion(manager, {
    text: '7B.6 ★ — ¿Cuánta agua usa por carga de café procesada? (Indique valor y unidad: L o m³ por carga)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.7
  await saveQuestion(manager, {
    text: '7B.7 ★ — ¿Se generan aguas mieles / lixiviados?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.8
  await saveQuestion(manager, {
    text: '7B.8 ★ — Volumen estimado de lixiviados por tonelada de café procesado (L/t)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.9
  await saveQuestion(manager, {
    text: '7B.9 — ¿Se añade agua adicional durante el despulpado? (Afecta concentración de azúcares)',
    type: types.yes_no,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7B.10
  await saveQuestion(manager, {
    text: '7B.10 — pH inicial aproximado de las aguas mieles',
    type: types.numeric,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7B.11
  const destinoQ = await saveQuestion(manager, {
    text: '7B.11 ★ — Destino de las aguas mieles / lixiviados',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, destinoQ, OPTS_DESTINO_AGUA);

  // 7B.12
  await saveQuestion(manager, {
    text: '7B.12 — ¿Los lixiviados se almacenan antes de descartar?',
    type: types.yes_no,
    isRequired: false,
    order: o.value++,
    section,
  });

  // 7B.13
  const calidadQ = await saveQuestion(manager, {
    text: '7B.13 ★ — ¿Conoce la calidad del agua que usa?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, calidadQ, OPTS_SI_NO_NSA);

  // 7B.14
  await saveQuestion(manager, {
    text: '7B.14 ★ — ¿Ha tenido problemas de calidad de agua?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.15
  const metalesQ = await saveQuestion(manager, {
    text: '7B.15 ★ — ¿Ha detectado o sospecha contaminación por metales pesados?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, metalesQ, OPTS_SI_NO_NSA);

  // 7B.16
  const pesticidасQ = await saveQuestion(manager, {
    text: '7B.16 ★ — ¿Ha detectado o sospecha contaminación por pesticidas?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, pesticidасQ, OPTS_SI_NO_NSA);

  // 7B.17 + 7B.18 (tratamiento → tipo)
  const tratamientoGate = await saveQuestion(manager, {
    text: '7B.17 ★ — ¿Realiza algún tratamiento al agua antes de usarla?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  const tipoTratamientoQ = await saveQuestion(manager, {
    text: '7B.18 — Tipo de tratamiento (Aplica si respondió Sí en 7B.17)',
    type: types.single_choice,
    isRequired: false,
    order: o.value++,
    section,
    conditionQuestion: tratamientoGate,
    conditionValue: 'true',
  });
  await saveOptions(manager, tipoTratamientoQ, OPTS_TRATAMIENTO_AGUA);

  // 7B.19
  await saveQuestion(manager, {
    text: '7B.19 ★ — ¿Tiene sistema de tratamiento de aguas residuales?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });

  // 7B.20
  const interesQ = await saveQuestion(manager, {
    text: '7B.20 ★ — ¿Estaría interesado en instalar un sistema de tratamiento de aguas?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, interesQ, OPTS_SI_NO_NSA);

  // 7B.21
  const impactoQ = await saveQuestion(manager, {
    text: '7B.21 ★ — ¿Su proceso genera impacto ambiental en las fuentes de agua cercanas?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o.value++,
    section,
  });
  await saveOptions(manager, impactoQ, OPTS_SI_NO_NSA);

  console.log(
    `[seed] Instrumento "${name}" insertado (${o.value - 1} preguntas).`,
  );
}

// ─── 7C — Agua en Cannabis y Cáñamo ──────────────────────────────────────────

async function seedInstrumento7C(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S7C. Agua en Cannabis y Cáñamo';
  const version = 1;

  if (await instrumentRepo.findOne({ where: { name, version } })) {
    console.log(
      `[seed] Instrumento "${name}" v${version} ya existe. Se omite.`,
    );
    return;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name,
      version,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );

  // ── Secciones ────────────────────────────────────────────────────────────────
  const [sec1, sec2, sec3, sec4, sec5, sec6, sec7] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.1 Fuente y Uso del Agua',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.2 Parámetros Medidos en Campo',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.3 Agroinsumos y Contaminantes',
        order: 3,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.4 Tratamiento del Agua',
        order: 4,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.5 Balance Agua-Nutrientes',
        order: 5,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.6 Vertimiento y Cumplimiento Ambiental',
        order: 6,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '7C.7 Observaciones Operativas',
        order: 7,
        instrument,
      }),
    ),
  ]);

  let totalQuestions = 0;

  // ── 7C.1 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    const fuenteQ = await saveQuestion(manager, {
      text: '7C.1 ★ — Fuente principal de agua',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec1,
    });
    await saveOptions(manager, fuenteQ, OPTS_FUENTE_AGUA);

    await saveYesNoWithFollowUp(
      manager,
      sec1,
      types,
      '7C.2 ◆ — ¿Se mezclan diferentes fuentes de agua?',
      '7C.2b — ¿Cuáles fuentes se mezclan? (especifique)',
      false,
      false,
      o,
    );

    await saveQuestion(manager, {
      text: '7C.3 ◆ — Volumen de agua usado (Indique valor y unidad: L/día, m³/día o m³/mes)',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });

    const frecuenciaQ = await saveQuestion(manager, {
      text: '7C.4 ◆ — Frecuencia de riego',
      type: types.single_choice,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });
    await saveOptions(manager, frecuenciaQ, OPTS_FRECUENCIA);

    const riegoQ = await saveQuestion(manager, {
      text: '7C.5 ★ — Método de riego',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec1,
    });
    await saveOptions(manager, riegoQ, [
      { text: 'Goteo' },
      { text: 'Aspersión' },
      { text: 'Manual' },
      { text: 'Recirculante (hidropónico)' },
      { text: 'NFT (Nutrient Film)' },
      { text: 'DWC (Cultivo en agua profunda)' },
      { text: 'Gravedad' },
      { text: 'Otro', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: '7C.6 ◆ — ¿Se realiza fertirriego?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '7C.7 ◆ — ¿Se recircula el agua o solución nutritiva?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '7C.8 ★ — ¿Se generan drenajes o lixiviados?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec1,
    });

    const destinoQ = await saveQuestion(manager, {
      text: '7C.9 ★ — Destino del drenaje / lixiviado',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec1,
    });
    await saveOptions(manager, destinoQ, OPTS_DESTINO_AGUA);

    await saveQuestion(manager, {
      text: '7C.10 ◆ — ¿Hay obras de construcción cercanas?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '7C.11 ◆ — ¿Qué tipo de actividad económica tienen los predios aledaños?',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec1,
    });

    totalQuestions += o.value - 1;
  }

  // ── 7C.2 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    await saveQuestion(manager, {
      text: '7C.12 ★ — ¿Mide la temperatura del agua de riego?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec2,
    });

    const measureParams: { code: string; label: string; unit: string }[] = [
      {
        code: '7C.13',
        label: 'el pH del agua de entrada',
        unit: 'valor o rango habitual de pH de entrada',
      },
      {
        code: '7C.14',
        label: 'el pH de la solución nutritiva (fertirriego)',
        unit: 'valor o rango habitual de pH del fertirriego',
      },
      {
        code: '7C.15',
        label: 'el pH del drenaje o lixiviado',
        unit: 'valor o rango habitual de pH del drenaje',
      },
      {
        code: '7C.16',
        label: 'la Conductividad Eléctrica (CE) del agua de entrada',
        unit: 'valor o rango habitual de CE entrada (mS/cm)',
      },
      {
        code: '7C.17',
        label: 'la Conductividad Eléctrica (CE) del fertirriego',
        unit: 'valor o rango habitual de CE fertirriego (mS/cm)',
      },
      {
        code: '7C.18',
        label: 'la Conductividad Eléctrica (CE) del drenaje',
        unit: 'valor o rango habitual de CE drenaje (mS/cm)',
      },
      {
        code: '7C.19',
        label: 'los Sólidos Disueltos Totales (TDS)',
        unit: 'valor o rango habitual de TDS (ppm)',
      },
      {
        code: '7C.20',
        label: 'el Oxígeno Disuelto (OD)',
        unit: 'valor o rango habitual de OD (mg/L)',
      },
      {
        code: '7C.21',
        label: 'el Potencial Óxido-Reducción (ORP)',
        unit: 'valor o rango habitual de ORP (mV)',
      },
    ];

    for (const p of measureParams) {
      await saveYesNoWithFollowUp(
        manager,
        sec2,
        types,
        `${p.code} ★ — ¿Mide ${p.label}?`,
        `${p.code}b — Si Sí: indique el ${p.unit}`,
        true,
        true,
        o,
      );
    }

    const otrosParamsQ = await saveQuestion(manager, {
      text: '7C.22 ★ — ¿Qué otros parámetros mide en el agua? (Marque todos los que apliquen)',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec2,
    });
    await saveOptions(manager, otrosParamsQ, [
      { text: 'Dureza' },
      { text: 'Nutrientes' },
      { text: 'Metales pesados' },
      { text: 'Materia orgánica' },
      { text: 'Contaminantes' },
      { text: 'Otro', isOther: true },
    ]);

    totalQuestions += o.value - 1;
  }

  // ── 7C.3 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    await saveYesNoWithFollowUp(
      manager,
      sec3,
      types,
      '7C.23 ★ — ¿Se usan plaguicidas o fungicidas en el cultivo?',
      '7C.23b — Liste los productos utilizados',
      true,
      true,
      o,
    );

    await saveQuestion(manager, {
      text: '7C.24 ◆ — Presencia de residuos de plaguicidas en el agua (liste compuestos / concentración en µg/L si se conoce)',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec3,
    });

    await saveYesNoWithFollowUp(
      manager,
      sec3,
      types,
      '7C.25 ◆ — ¿Se usan reguladores de crecimiento?',
      '7C.25b — Especifique los reguladores de crecimiento utilizados',
      false,
      false,
      o,
    );

    await saveYesNoWithFollowUp(
      manager,
      sec3,
      types,
      '7C.26 ◆ — ¿Se usan surfactantes o detergentes?',
      '7C.26b — Concentración aproximada de surfactantes / detergentes (mg/L)',
      false,
      false,
      o,
    );

    totalQuestions += o.value - 1;
  }

  // ── 7C.4 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    const tratamientoGate = await saveQuestion(manager, {
      text: '7C.27 ★ — ¿El agua recibe tratamiento previo al uso?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec4,
    });
    const tipoTratQ = await saveQuestion(manager, {
      text: '7C.28 ◆ — Tipo de tratamiento que aplica (Aplica si respondió Sí en 7C.27)',
      type: types.single_choice,
      isRequired: false,
      order: o.value++,
      section: sec4,
      conditionQuestion: tratamientoGate,
      conditionValue: 'true',
    });
    await saveOptions(manager, tipoTratQ, OPTS_TRATAMIENTO_AGUA);

    await saveYesNoWithFollowUp(
      manager,
      sec4,
      types,
      '7C.29 ◆ — ¿Se ajusta el pH antes del riego?',
      '7C.29b — Rango objetivo de pH',
      false,
      false,
      o,
    );

    await saveQuestion(manager, {
      text: '7C.30 ◆ — ¿Se ajusta la alcalinidad del agua?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '7C.31 ◆ — ¿Se filtra la solución nutritiva?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec4,
    });

    await saveYesNoWithFollowUp(
      manager,
      sec4,
      types,
      '7C.32 ◆ — ¿Se monitorea la calidad del agua periódicamente?',
      '7C.32b — ¿Con qué frecuencia se monitorea?',
      false,
      false,
      o,
    );

    totalQuestions += o.value - 1;
  }

  // ── 7C.5 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    await saveQuestion(manager, {
      text: '7C.33 ★ — Volumen de agua aplicado por ciclo (Indique valor y unidad: L/planta, L/m² o m³/ha)',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: '7C.34 ◆ — Porcentaje de drenaje generado (%)',
      type: types.numeric,
      isRequired: false,
      order: o.value++,
      section: sec5,
    });

    const reusoGate = await saveQuestion(manager, {
      text: '7C.35 ◆ — ¿Se reutiliza el drenaje?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec5,
    });
    await saveQuestion(manager, {
      text: '7C.35b — Porcentaje de drenaje reutilizado (%)',
      type: types.numeric,
      isRequired: false,
      order: o.value++,
      section: sec5,
      conditionQuestion: reusoGate,
      conditionValue: 'true',
    });

    totalQuestions += o.value - 1;
  }

  // ── 7C.6 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    await saveQuestion(manager, {
      text: '7C.36 ◆ — ¿Existe un punto de vertimiento definido?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });

    await saveQuestion(manager, {
      text: '7C.37 ◆ — Tipo de receptor del vertimiento (ej: suelo, cuerpo hídrico, alcantarillado)',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });

    const permisoQ = await saveQuestion(manager, {
      text: '7C.38 ◆ — ¿Cuenta con permiso de vertimiento?',
      type: types.single_choice,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });
    await saveOptions(manager, permisoQ, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'En trámite' },
    ]);

    const freqMonitoreoQ = await saveQuestion(manager, {
      text: '7C.39 ◆ — Frecuencia de monitoreo de vertimientos',
      type: types.single_choice,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });
    await saveOptions(manager, freqMonitoreoQ, OPTS_FRECUENCIA);

    await saveQuestion(manager, {
      text: '7C.40 ◆ — Parámetros exigidos por la autoridad ambiental para el vertimiento',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });

    await saveQuestion(manager, {
      text: '7C.41 ◆ — ¿Se trata el vertimiento antes de la descarga?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec6,
    });

    totalQuestions += o.value - 1;
  }

  // ── 7C.7 ─────────────────────────────────────────────────────────────────────
  {
    const o = { value: 1 };

    await saveQuestion(manager, {
      text: '7C.42 ◆ — Problemas observados en el cultivo asociados al agua (clorosis, necrosis, salinidad, etc.)',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec7,
    });

    await saveQuestion(manager, {
      text: '7C.43 ◆ — ¿Hay problemas de incrustaciones en tuberías o goteros?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec7,
    });

    await saveQuestion(manager, {
      text: '7C.44 ◆ — ¿Hay presencia de olores, color o turbidez anormal en el agua?',
      type: types.yes_no,
      isRequired: false,
      order: o.value++,
      section: sec7,
    });

    await saveYesNoWithFollowUp(
      manager,
      sec7,
      types,
      '7C.45 ◆ — ¿Han ocurrido eventos recientes de lluvia intensa o sequía?',
      '7C.45b — Describa el evento',
      false,
      false,
      o,
    );

    await saveQuestion(manager, {
      text: '7C.46 ◆ — Observaciones adicionales del productor sobre el agua',
      type: types.open_text,
      isRequired: false,
      order: o.value++,
      section: sec7,
    });

    const impactoQ = await saveQuestion(manager, {
      text: '7C.47 ★ — ¿Su cultivo de cannabis / cáñamo genera impacto ambiental en las fuentes de agua cercanas?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o.value++,
      section: sec7,
    });
    await saveOptions(manager, impactoQ, OPTS_SI_NO_NSA);

    totalQuestions += o.value - 1;
  }

  console.log(
    `[seed] Instrumento "${name}" insertado (${totalQuestions} preguntas en 7 secciones).`,
  );
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function seedInstrumentosAgua(
  manager: EntityManager,
): Promise<void> {
  const typeRepo = manager.getRepository(TypeOfQuestion);

  const typeNames = [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
  ];
  const types: Record<string, TypeOfQuestion> = {};
  for (const name of typeNames) {
    const t = await typeRepo.findOne({ where: { name } });
    if (!t)
      throw new Error(
        `[seed] TypeOfQuestion "${name}" no encontrado. Ejecute primero seedTypesOfQuestions.`,
      );
    types[name] = t;
  }

  await seedInstrumento7A(manager, types);
  await seedInstrumento7B(manager, types);
  await seedInstrumento7C(manager, types);
}
