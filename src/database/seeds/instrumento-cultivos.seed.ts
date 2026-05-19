import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Opciones compartidas ─────────────────────────────────────────────────────

const OPTS_MESES = [
  { text: 'Enero' },
  { text: 'Febrero' },
  { text: 'Marzo' },
  { text: 'Abril' },
  { text: 'Mayo' },
  { text: 'Junio' },
  { text: 'Julio' },
  { text: 'Agosto' },
  { text: 'Septiembre' },
  { text: 'Octubre' },
  { text: 'Noviembre' },
  { text: 'Diciembre' },
  { text: 'No aplica' },
];

const OPTS_SISTEMA_CULTIVO = [
  { text: 'Suelo' },
  { text: 'Sustrato' },
  { text: 'Hidroponía' },
  { text: 'Aeroponía' },
  { text: 'Mixto' },
  { text: 'Otro', isOther: true },
];

const OPTS_CONDICION_CULTIVO = [
  { text: 'Campo abierto' },
  { text: 'Invernadero' },
  { text: 'Indoor (cuarto de cultivo)' },
  { text: 'Mixto' },
];

const OPTS_LICENCIA = [
  { text: 'Uso adulto (Ley 2204/2022)' },
  { text: 'Uso médico y científico (Ley 1787/2016)' },
  { text: 'Semillas / Material vegetal (ICA)' },
  { text: 'No tiene licencia' },
  { text: 'En trámite' },
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

// ─── Preamble: 2.1–2.3 ───────────────────────────────────────────────────────

async function seedPreamble(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S2. Cultivos — Identificación de Cadenas';
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
      name: '2.1 Cultivos y Etapas de la Cadena',
      order: 1,
      instrument,
    }),
  );

  let order = 1;

  // 2.1 — 4 preguntas yes_no (una por cultivo) en lugar de un multiple_choice
  // para habilitar el condicionamiento de los CampaignSteps por cultivo
  await saveQuestion(manager, {
    text: '2.1a ★ — ¿Cultiva actualmente Cacao?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '2.1b ★ — ¿Cultiva actualmente Café?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '2.1c ★ — ¿Cultiva actualmente Cannabis?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '2.1d ★ — ¿Cultiva actualmente Cáñamo?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.2
  const etapasQ = await saveQuestion(manager, {
    text: '2.2 ★ — ¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, etapasQ, [
    { text: 'Cultivo / producción en campo' },
    { text: 'Cosecha' },
    { text: 'Poscosecha / procesamiento' },
    { text: 'Comercialización directa' },
    { text: 'Exportación' },
    { text: 'Transformación industrial' },
  ]);

  // 2.3
  const materiaQ = await saveQuestion(manager, {
    text: '2.3 — ¿Procesa materia prima propia, de terceros o ambas?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, materiaQ, [
    { text: 'Propia' },
    { text: 'De terceros' },
    { text: 'Ambas' },
  ]);

  console.log(
    `[seed] Instrumento preamble "${name}" insertado (${order - 1} preguntas).`,
  );
}

// ─── Bloque 2.4 — CACAO ───────────────────────────────────────────────────────

async function seedBloqueCacao(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S2.4: Bloque Cacao';
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
      name: '2.4 Información del Cultivo de Cacao',
      order: 1,
      instrument,
    }),
  );

  let order = 1;

  // 2.4.1
  await saveQuestion(manager, {
    text: '2.4.1 ★ — Hectáreas sembradas en cacao (ha)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.4.2 → 2.4.3
  const lotesGate = await saveQuestion(manager, {
    text: '2.4.2 — ¿La producción de cacao está distribuida en varios lotes?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.3 — ¿Cuántos lotes tiene?',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: lotesGate,
    conditionValue: 'true',
  });

  // 2.4.4 → 2.4.5
  const sombraGate = await saveQuestion(manager, {
    text: '2.4.4 ★ — ¿Tiene sombra (cultivo asociado)?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.5 — Especie vegetal de sombra (si aplica)',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: sombraGate,
    conditionValue: 'true',
  });

  // 2.4.6
  const sombraTransGate = await saveQuestion(manager, {
    text: '2.4.6 — ¿Tiene sombra transitoria?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.6b — Porcentaje de sombra transitoria (%)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: sombraTransGate,
    conditionValue: 'true',
  });

  // 2.4.7
  const sombraPermGate = await saveQuestion(manager, {
    text: '2.4.7 — ¿Tiene sombra permanente?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.7b — Porcentaje de sombra permanente (%)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: sombraPermGate,
    conditionValue: 'true',
  });

  // 2.4.8
  const asociadosGate = await saveQuestion(manager, {
    text: '2.4.8 — ¿Tiene otros cultivos asociados / intercalados?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.8b — Especifique los cultivos asociados y el porcentaje de área de cada uno',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: asociadosGate,
    conditionValue: 'true',
  });

  // 2.4.9
  const variedadQ = await saveQuestion(manager, {
    text: '2.4.9 ★ — Variedad predominante de cacao (trazabilidad parental si existe)',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, variedadQ, [
    { text: 'CCN-51' },
    { text: 'ICS-1' },
    { text: 'ICS-6' },
    { text: 'ICS-39' },
    { text: 'ICS-60' },
    { text: 'ICS-95' },
    { text: 'TSH-565' },
    { text: 'EET-8' },
    { text: 'FEC-2' },
    { text: 'Criollo' },
    { text: 'Trinitario' },
    { text: 'Híbrido trinitario' },
    { text: 'Nativo / Silvestres' },
    { text: 'Sin identificar' },
    { text: 'Otro', isOther: true },
  ]);

  // 2.4.10
  await saveQuestion(manager, {
    text: '2.4.10 ★ — Clones sembrados en el cultivo — indique nombre y % sembrado de cada uno (Ej: CCN-51: 60%, ICS-60: 40%)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // Incluir
  await saveQuestion(manager, {
    text: 'Incluir — Edad promedio del cultivo de cacao (años)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: 'Incluir — Densidad de siembra (plantas / ha)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.4.11
  await saveQuestion(manager, {
    text: '2.4.11 ★ — Rendimiento (kg cacao seco / ha / año)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // Incluir
  await saveQuestion(manager, {
    text: 'Incluir — Índice de mazorca del cultivo sembrado en mayor cantidad',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: 'Incluir — Índice de mazorca del cultivo sembrado en menor cantidad',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.4.12
  await saveQuestion(manager, {
    text: '2.4.12 ★ — ¿Tiene registros productivos históricos? (cuadernos, apps, etc.)',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.4.13
  await saveQuestion(manager, {
    text: '2.4.13 ★ — ¿Tiene registro ICA del predio? (BPA, exportador, etc.)',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.4.14
  const asociacionGate = await saveQuestion(manager, {
    text: '2.4.14 — ¿Pertenece a una asociación cacaotera?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.4.14b — ¿A cuál asociación cacaotera pertenece?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: asociacionGate,
    conditionValue: 'true',
  });

  // 2.4.15
  const cosechaPrinQ = await saveQuestion(manager, {
    text: '2.4.15 ★ — ¿En qué meses se presenta la cosecha principal de cacao? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, cosechaPrinQ, OPTS_MESES);

  // 2.4.16
  const cosechaSecQ = await saveQuestion(manager, {
    text: '2.4.16 — ¿En qué meses se presenta la cosecha transitoria (secundaria) de cacao? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, cosechaSecQ, OPTS_MESES);

  console.log(
    `[seed] Instrumento "${name}" insertado (${order - 1} preguntas).`,
  );
}

// ─── Bloque 2.5 — CAFÉ ────────────────────────────────────────────────────────

async function seedBloqueCafe(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S2.5: Bloque Café';
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
      name: '2.5 Información del Cultivo de Café',
      order: 1,
      instrument,
    }),
  );

  let order = 1;

  // 2.5.1
  await saveQuestion(manager, {
    text: '2.5.1 ★ — Hectáreas sembradas en café (ha)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.5.2
  const variedadQ = await saveQuestion(manager, {
    text: '2.5.2 ★ — Variedad(es) cultivada(s) de café principal',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, variedadQ, [
    { text: 'Castillo' },
    { text: 'Colombia' },
    { text: 'Cenicafé 1' },
    { text: 'Tabi' },
    { text: 'Bourbon' },
    { text: 'Típica' },
    { text: 'Caturra' },
    { text: 'Geisha / Gesha' },
    { text: 'Wush Wush' },
    { text: 'Variedad propia' },
    { text: 'Sin identificar' },
    { text: 'Otro', isOther: true },
  ]);

  // 2.5.3
  const masVariedadesGate = await saveQuestion(manager, {
    text: '2.5.3 — ¿Tiene más de una variedad de café?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.5.3b — Liste cada variedad con su porcentaje de área',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: masVariedadesGate,
    conditionValue: 'true',
  });

  // 2.5.4
  await saveQuestion(manager, {
    text: '2.5.4 — Edad promedio del cultivo de café (años)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.5.5
  await saveQuestion(manager, {
    text: '2.5.5 — Densidad de siembra (plantas / ha)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.5.6
  await saveQuestion(manager, {
    text: '2.5.6 ★ — Rendimiento promedio (kg café pergamino seco / ha / año)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.5.7
  const tipoCafeQ = await saveQuestion(manager, {
    text: '2.5.7 ★ — Tipo de café que produce o comercializa',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, tipoCafeQ, [
    { text: 'Café cereza' },
    { text: 'Café pergamino húmedo' },
    { text: 'Café pergamino seco' },
    { text: 'Café trillado / excelso' },
    { text: 'Café tostado' },
    { text: 'Café especial' },
  ]);

  // 2.5.8
  await saveQuestion(manager, {
    text: '2.5.8 ★ — ¿Tiene registros productivos históricos? (solicitar últimos tres años)',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.5.9
  await saveQuestion(manager, {
    text: '2.5.9 ★ — ¿Tiene registro ICA del predio?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.5.10
  const cosechaPrinQ = await saveQuestion(manager, {
    text: '2.5.10 ★ — ¿En qué meses se presenta la cosecha principal de café? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, cosechaPrinQ, OPTS_MESES);

  // 2.5.11
  const cosechaTransQ = await saveQuestion(manager, {
    text: '2.5.11 — ¿En qué meses se presenta la cosecha transitoria de café? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, cosechaTransQ, OPTS_MESES);

  console.log(
    `[seed] Instrumento "${name}" insertado (${order - 1} preguntas).`,
  );
}

// ─── Bloque 2.6 — CANNABIS ───────────────────────────────────────────────────

async function seedBloqueCannabis(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S2.6: Bloque Cannabis';
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
      name: '2.6 Información del Cultivo de Cannabis',
      order: 1,
      instrument,
    }),
  );

  let order = 1;

  // 2.6.1
  const sistemaQ = await saveQuestion(manager, {
    text: '2.6.1 ★ — Sistema de cultivo de cannabis',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, sistemaQ, OPTS_SISTEMA_CULTIVO);

  // 2.6.2
  const condicionQ = await saveQuestion(manager, {
    text: '2.6.2 ★ — Condición de cultivo de cannabis',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, condicionQ, OPTS_CONDICION_CULTIVO);

  // 2.6.3
  await saveQuestion(manager, {
    text: '2.6.3 ★ — Área cultivada en cannabis (Indique valor y unidad: ha o m²)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.6.4
  await saveQuestion(manager, {
    text: '2.6.4 ★ — Material genético / variedad de cannabis (nombre comercial o código)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.6.5
  const masVariedadesGate = await saveQuestion(manager, {
    text: '2.6.5 — ¿Tiene más de una variedad de cannabis?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.6.5b — Liste cada variedad con su porcentaje',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: masVariedadesGate,
    conditionValue: 'true',
  });

  // 2.6.6
  const tipoProduccionQ = await saveQuestion(manager, {
    text: '2.6.6 ★ — Tipo de producción predominante en cannabis',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, tipoProduccionQ, [
    { text: 'Flor seca' },
    { text: 'Extractos' },
    { text: 'Semillas' },
    { text: 'Mixto' },
  ]);

  // 2.6.7
  await saveQuestion(manager, {
    text: '2.6.7 — Ciclos de producción de cannabis por año',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.6.8
  await saveQuestion(manager, {
    text: '2.6.8 ★ — Producción promedio de cannabis (Indique valor y unidad: kg flor seca o extracto / año)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.6.9
  const licenciaQ = await saveQuestion(manager, {
    text: '2.6.9 ★ — ¿Cuenta con licencia vigente de cannabis? (Adjuntar documento)',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, licenciaQ, OPTS_LICENCIA);

  // Incluir — Certificación
  const certQ = await saveQuestion(manager, {
    text: 'Incluir — ¿Cuenta con alguna certificación o está en proceso? (Adjuntar documento si aplica)',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, certQ, [
    { text: 'Orgánico NTC / USDA' },
    { text: 'Rainforest Alliance' },
    { text: 'UTZ' },
    { text: 'Fair Trade / Comercio Justo' },
    { text: 'Denominación de Origen' },
    { text: 'Ninguna' },
    { text: 'Otro', isOther: true },
  ]);

  // 2.6.10
  await saveQuestion(manager, {
    text: '2.6.10 ★ — ¿Tiene registros productivos históricos de cannabis?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  console.log(
    `[seed] Instrumento "${name}" insertado (${order - 1} preguntas).`,
  );
}

// ─── Bloque 2.7 — CÁÑAMO ─────────────────────────────────────────────────────

async function seedBloqueCanamo(
  manager: EntityManager,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const name = 'S2.7: Bloque Cáñamo';
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
      name: '2.7 Información del Cultivo de Cáñamo',
      order: 1,
      instrument,
    }),
  );

  let order = 1;

  // 2.7.1
  const sistemaQ = await saveQuestion(manager, {
    text: '2.7.1 ★ — Sistema de cultivo de cáñamo',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, sistemaQ, OPTS_SISTEMA_CULTIVO);

  // 2.7.2
  const condicionQ = await saveQuestion(manager, {
    text: '2.7.2 ★ — Condición de cultivo de cáñamo',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, condicionQ, OPTS_CONDICION_CULTIVO);

  // 2.7.3
  await saveQuestion(manager, {
    text: '2.7.3 ★ — Área cultivada en cáñamo (ha)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.7.4
  await saveQuestion(manager, {
    text: '2.7.4 ★ — Variedad / material genético de cáñamo',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.7.5
  const masVariedadesGate = await saveQuestion(manager, {
    text: '2.7.5 — ¿Tiene más de una variedad de cáñamo?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });
  await saveQuestion(manager, {
    text: '2.7.5b — Liste cada variedad con su porcentaje',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: masVariedadesGate,
    conditionValue: 'true',
  });

  // 2.7.6
  const productoPrinQ = await saveQuestion(manager, {
    text: '2.7.6 ★ — Producto principal del cultivo de cáñamo',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, productoPrinQ, [
    { text: 'Fibra' },
    { text: 'Semilla' },
    { text: 'CBD' },
    { text: 'Múltiple' },
  ]);

  // 2.7.7
  await saveQuestion(manager, {
    text: '2.7.7 — Ciclos de producción de cáñamo por año',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 2.7.8
  await saveQuestion(manager, {
    text: '2.7.8 ★ — Producción promedio de cáñamo (kg / ha / año)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.7.9
  const licenciaQ = await saveQuestion(manager, {
    text: '2.7.9 ★ — ¿Cuenta con licencia vigente de cáñamo? (Adjuntar documento)',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, licenciaQ, OPTS_LICENCIA);

  // 2.7.10
  await saveQuestion(manager, {
    text: '2.7.10 ★ — ¿Verifica que el contenido de THC sea ≤ 1%? (Requisito legal)',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 2.7.11
  await saveQuestion(manager, {
    text: '2.7.11 ★ — ¿Tiene registros productivos de cáñamo?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  console.log(
    `[seed] Instrumento "${name}" insertado (${order - 1} preguntas).`,
  );
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function seedInstrumentosCultivos(
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

  await seedPreamble(manager, types);
  await seedBloqueCacao(manager, types);
  await seedBloqueCafe(manager, types);
  await seedBloqueCannabis(manager, types);
  await seedBloqueCanamo(manager, types);
}
