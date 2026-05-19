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

const OPTS_FRECUENCIA_USO = [
  { text: 'Todos los días' },
  { text: 'Al menos una vez por semana' },
  { text: 'Al menos una vez al mes' },
  { text: 'Ocasionalmente' },
  { text: 'No utiliza' },
];

// ─── 8A — Infraestructura Cacao ───────────────────────────────────────────────

async function seedInfraestructuraCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S8A: Infraestructura de Poscosecha Cacao';
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
      name: '8A Infraestructura de Poscosecha — Cacao',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const q8a1 = await saveQuestion(manager, {
    text: '8A.1 ★ — ¿Con cuál de las siguientes instalaciones para cacao cuenta en su finca?',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8a1, [
    { text: 'Área de recepción y clasificación de mazorcas' },
    { text: 'Cajones de fermentación de madera' },
    { text: 'Sacos / cajas para fermentación' },
    { text: 'Marquesina plástica para secado' },
    { text: 'Patio de cemento para secado' },
    { text: 'Secador solar tipo domo / carpa' },
    { text: 'Secador mecánico' },
    { text: 'Bodega / almacén para cacao seco' },
    { text: 'Báscula o balanza' },
    { text: 'Termómetro (para fermentación y/o secado)' },
    { text: 'Higrómetro (medidor de humedad)' },
    { text: 'Clasificadora / seleccionadora de grano' },
    { text: 'Área de empaque y etiquetado' },
  ]);

  await saveQuestion(manager, {
    text: '8A.2 ★ — Capacidad de los cajones de fermentación (valor numérico)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q8a2u = await saveQuestion(manager, {
    text: '8A.2b ★ — Unidad de capacidad de los cajones',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8a2u, [{ text: 'kg' }, { text: 'litros' }]);

  await saveQuestion(manager, {
    text: '8A.3 ★ — Número de cajones de fermentación disponibles',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8A.4 — ¿Los cajones tienen tapas / cubiertas para mantener temperatura?',
    type: types.yes_no,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8A.5 ★ — Área de secado disponible (m²)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8A.6 ★ — Capacidad de almacenamiento de cacao seco (kg)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8A.7 ★ — ¿La bodega tiene control de humedad y temperatura?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8A.8 ★ — ¿Tiene tomas eléctricas disponibles en el área de poscosecha?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 8B — Infraestructura Café ────────────────────────────────────────────────

async function seedInfraestructuraCafe(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S8B: Infraestructura de Poscosecha Café';
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
      name: '8B Infraestructura de Poscosecha — Café',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const q8b1 = await saveQuestion(manager, {
    text: '8B.1 ★ — ¿Con cuál de las siguientes instalaciones para café cuenta en su finca?',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8b1, [
    { text: 'Beneficiadero (área completa de beneficio húmedo)' },
    { text: 'Despulpadora (cilíndrica o de disco)' },
    { text: 'Pilas de fermentación' },
    { text: 'Canal de correteo' },
    { text: 'Marquesina para secado' },
    { text: 'Patio de cemento para secado' },
    { text: 'Secador mecánico / guardiola' },
    { text: 'Trilladora' },
    { text: 'Tostadora' },
    { text: 'Báscula / balanza' },
    { text: 'Bodega para café pergamino seco' },
    { text: 'Equipo de catación / cata en taza' },
    { text: 'Área de empaque y etiquetado' },
  ]);

  await saveQuestion(manager, {
    text: '8B.2 ★ — Capacidad de la despulpadora (valor numérico)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q8b2u = await saveQuestion(manager, {
    text: '8B.2b ★ — Unidad de capacidad de la despulpadora',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8b2u, [
    { text: 'kg / hora' },
    { text: 'cargas / día' },
  ]);

  await saveQuestion(manager, {
    text: '8B.3 ★ — Capacidad de las pilas de fermentación (valor numérico)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q8b3u = await saveQuestion(manager, {
    text: '8B.3b ★ — Unidad de capacidad de las pilas de fermentación',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8b3u, [{ text: 'L' }, { text: 'kg' }]);

  await saveQuestion(manager, {
    text: '8B.4 ★ — Área de secado disponible (m²)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8B.5 ★ — Capacidad de almacenamiento de café pergamino seco (valor numérico)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q8b5u = await saveQuestion(manager, {
    text: '8B.5b ★ — Unidad de capacidad de almacenamiento',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8b5u, [{ text: 'kg' }, { text: 'cargas' }]);

  await saveQuestion(manager, {
    text: '8B.6 ★ — ¿La bodega tiene control de humedad?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8B.7 ★ — ¿Tiene tomas eléctricas disponibles en el área de beneficio?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 8C — Infraestructura Cannabis ───────────────────────────────────────────

async function seedInfraestructuraCannabis(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S8C: Infraestructura de Producción Cannabis';
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

  const [secEst, secRiego, secPost] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '8C.1 Estructura de cultivo',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '8C.2 Sistema de riego',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '8C.3 Extracción, secado y poscosecha',
        order: 3,
        instrument,
      }),
    ),
  ]);

  // ── 8C.1 Estructura ─────────────────────────────────────────────────────────
  {
    let o = 1;

    const q8c1 = await saveQuestion(manager, {
      text: '8C.1 ★ — Tipo de estructura principal',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });
    const opts8c1 = await saveOptions(manager, q8c1, [
      { text: 'Campo abierto' },
      { text: 'Invernadero' },
      { text: 'Indoor (cuarto de cultivo)' },
      { text: 'Mixto' },
    ]);

    await saveQuestion(manager, {
      text: '8C.2 ★ — Material de cubierta del invernadero',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
      conditionQuestion: q8c1,
      conditionValue: opts8c1.get('Invernadero')!,
    });
    await saveOptions(
      manager,
      // save options on the saved question — requery after creation
      // workaround: get the last saved question
      (await manager.getRepository(Question).findOne({
        where: { section: { sectionId: secEst.sectionId }, order: o - 1 },
        relations: ['section'],
      }))!,
      [{ text: 'Plástico' }, { text: 'Policarbonato' }, { text: 'Vidrio' }],
    );

    await saveQuestion(manager, {
      text: '8C.3 ★ — Área del invernadero (m²)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
      conditionQuestion: q8c1,
      conditionValue: opts8c1.get('Invernadero')!,
    });

    const q8c4 = await saveQuestion(manager, {
      text: '8C.4 ★ — ¿Tiene sistema de ventilación?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    const q8c5 = await saveQuestion(manager, {
      text: '8C.5 — Tipo de ventilación',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: secEst,
      conditionQuestion: q8c4,
      conditionValue: 'true',
    });
    await saveOptions(manager, q8c5, [
      { text: 'Natural' },
      { text: 'Forzada (extractores)' },
      { text: 'HVAC completo' },
    ]);

    await saveQuestion(manager, {
      text: '8C.6 ★ — ¿Tiene control automático de temperatura y humedad relativa?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    await saveQuestion(manager, {
      text: '8C.7a ★ — Temperatura mínima manejada (°C)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    await saveQuestion(manager, {
      text: '8C.7b ★ — Temperatura máxima manejada (°C)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    await saveQuestion(manager, {
      text: '8C.8a ★ — Humedad relativa mínima manejada (%)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    await saveQuestion(manager, {
      text: '8C.8b ★ — Humedad relativa máxima manejada (%)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });

    const q8c9 = await saveQuestion(manager, {
      text: '8C.9 ★ — Tipo de iluminación utilizada',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });
    await saveOptions(manager, q8c9, [
      { text: 'Natural' },
      { text: 'LED' },
      { text: 'HPS' },
      { text: 'CMH' },
      { text: 'Mixto' },
    ]);

    await saveQuestion(manager, {
      text: '8C.10 ★ — ¿Tiene sistema de control de fotoperiodo?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEst,
    });
  }

  // ── 8C.2 Riego ──────────────────────────────────────────────────────────────
  {
    const q8c11 = await saveQuestion(manager, {
      text: '8C.11 ★ — ¿Con cuál de los siguientes sistemas de riego cuenta?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: 1,
      section: secRiego,
    });
    await saveOptions(manager, q8c11, [
      { text: 'Riego por goteo' },
      { text: 'Aspersión' },
      { text: 'Riego manual' },
      { text: 'Sistema recirculante' },
      { text: 'NFT (Nutrient Film Technique)' },
      { text: 'DWC (Cultivo en agua profunda)' },
      { text: 'Aeroponía' },
    ]);
  }

  // ── 8C.3 Poscosecha ─────────────────────────────────────────────────────────
  {
    let o = 1;

    const q8c12 = await saveQuestion(manager, {
      text: '8C.12 ★ — ¿Con cuál de las siguientes instalaciones de poscosecha cuenta?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPost,
    });
    await saveOptions(manager, q8c12, [
      { text: 'Cuarto de secado con control de temperatura y HR' },
      { text: 'Cuarto de curado' },
      { text: 'Área de trimming / despalillado' },
      { text: 'Equipo de extracción (prensa, CO₂, etanol, etc.)' },
      { text: 'Área de empaque y etiquetado bajo condiciones controladas' },
      { text: 'Bodega de producto terminado' },
      { text: 'Báscula de precisión (gramos)' },
      { text: 'Equipo de análisis de humedad' },
    ]);

    await saveQuestion(manager, {
      text: '8C.13 ★ — Capacidad de la cámara / cuarto de secado (m²)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPost,
    });

    await saveQuestion(manager, {
      text: '8C.14 ★ — ¿Cuenta con medidor de humedad / higrómetro en el cuarto de secado?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPost,
    });

    await saveQuestion(manager, {
      text: '8C.15 ★ — ¿Tiene tomas eléctricas disponibles para instalación de sensores en el cultivo?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPost,
    });

    const q8c16 = await saveQuestion(manager, {
      text: '8C.16 ★ — ¿El área de extracción cumple normas de seguridad ATEX / INVIMA?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPost,
    });
    await saveOptions(manager, q8c16, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No aplica' },
    ]);
  }

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 8D — Infraestructura Cáñamo ─────────────────────────────────────────────

async function seedInfraestructuraCanamo(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S8D: Infraestructura de Producción Cáñamo';
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
      name: '8D Infraestructura de Producción — Cáñamo',
      order: 1,
      instrument,
    }),
  );

  let o = 1;

  const q8d1 = await saveQuestion(manager, {
    text: '8D.1 ★ — ¿Con cuál de las siguientes instalaciones para cáñamo cuenta?',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8d1, [
    { text: 'Campo abierto (sin estructura)' },
    { text: 'Invernadero' },
    { text: 'Sistema de riego tecnificado' },
    { text: 'Decorticadora / desfibrado mecánico' },
    { text: 'Desfibrado manual' },
    { text: 'Área de secado de fibra / semilla / flor' },
    { text: 'Prensa de semilla (para aceite)' },
    { text: 'Equipo de extracción de CBD' },
    { text: 'Bodega de producto terminado' },
    { text: 'Báscula' },
    { text: 'Área de empaque y etiquetado' },
  ]);

  await saveQuestion(manager, {
    text: '8D.2 ★ — Área de cultivo a campo abierto (ha)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8D.3 — Área bajo invernadero (m²)',
    type: types.numeric,
    isRequired: false,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8D.4 ★ — ¿Tiene maquinaria de cosecha (cosechadora, segadora)?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8D.5 ★ — Capacidad de procesamiento de fibra (valor numérico)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  const q8d5u = await saveQuestion(manager, {
    text: '8D.5b ★ — Unidad de capacidad de procesamiento de fibra',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });
  await saveOptions(manager, q8d5u, [
    { text: 'kg / día' },
    { text: 't / cosecha' },
  ]);

  await saveQuestion(manager, {
    text: '8D.6 ★ — ¿Tiene área de almacenamiento con control de humedad?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  await saveQuestion(manager, {
    text: '8D.7 ★ — ¿Tiene tomas eléctricas disponibles para instalación de sensores?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: o++,
    section: sec,
  });

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── 8E — Servicios e Infraestructura General ─────────────────────────────────

async function seedInfraestructuraGeneral(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);

  const NAME = 'S8E: Servicios e Infraestructura General';
  const VERSION = 1;

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const types = await loadTypes(manager, [
    'open_text',
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

  const [secEnergia, secConect] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '8E.1 Energía eléctrica',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '8E.2 Conectividad e internet',
        order: 2,
        instrument,
      }),
    ),
  ]);

  // ── 8E.1 Energía eléctrica ───────────────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '8E.1 ★ — ¿Tiene acceso a energía eléctrica en la finca?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEnergia,
    });

    const q8e2 = await saveQuestion(manager, {
      text: '8E.2 ★ — Tipo de fuente eléctrica',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEnergia,
    });
    await saveOptions(manager, q8e2, [
      { text: 'Red pública 24/7 sin interrupciones' },
      { text: 'Red pública con interrupciones frecuentes' },
      { text: 'Solo algunas horas al día' },
      { text: 'Panel solar' },
      { text: 'Generador a combustible' },
      { text: 'No tiene acceso' },
      { text: 'Mixto' },
    ]);

    await saveQuestion(manager, {
      text: '8E.3 ★ — ¿El servicio eléctrico es estable? ¿Con qué frecuencia hay cortes?',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secEnergia,
    });

    await saveQuestion(manager, {
      text: '8E.4 — ¿Tiene acceso a agua potable en la vivienda de la finca?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: secEnergia,
    });
  }

  // ── 8E.2 Conectividad e internet ─────────────────────────────────────────────
  {
    let o = 1;

    const q8e5 = await saveQuestion(manager, {
      text: '8E.5 ★ — ¿Tiene acceso a internet en la finca?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });

    const q8e6 = await saveQuestion(manager, {
      text: '8E.6 ★ — Tipo de conectividad disponible',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });
    await saveOptions(manager, q8e6, [
      { text: 'Datos móviles (plan celular)' },
      { text: 'WiFi fijo en finca' },
      { text: 'Solo fuera de la finca' },
      { text: 'WiFi satelital' },
      { text: 'No tiene acceso' },
    ]);

    const q8e7 = await saveQuestion(manager, {
      text: '8E.7 ★ — ¿Cómo describiría la calidad de la señal móvil en la finca?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });
    await saveOptions(manager, q8e7, [
      { text: 'Sin señal' },
      { text: 'Señal mala (llama pero no navega)' },
      { text: 'Señal regular (navega lento)' },
      { text: 'Señal buena' },
      { text: 'No usa celular' },
    ]);

    const q8e8 = await saveQuestion(manager, {
      text: '8E.8 — Si no tiene internet, ¿cuál es la razón principal?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: secConect,
      conditionQuestion: q8e5,
      conditionValue: 'false',
    });
    await saveOptions(manager, q8e8, [
      { text: 'Es muy costoso' },
      { text: 'No hay cobertura en la zona' },
      { text: 'No lo considera necesario' },
      { text: 'No sabe cómo usarlo' },
      { text: 'No tiene dispositivo' },
      { text: 'Cobertura deficiente aunque existe' },
    ]);

    const q8e9 = await saveQuestion(manager, {
      text: '8E.9 ★ — ¿Qué dispositivos utiliza actualmente?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });
    await saveOptions(manager, q8e9, [
      { text: 'Smartphone (teléfono inteligente)' },
      { text: 'Teléfono convencional (no smartphone)' },
      { text: 'Tableta' },
      { text: 'Computador portátil' },
      { text: 'Computador de escritorio' },
      { text: 'Ninguno de estos' },
    ]);

    await saveQuestion(manager, {
      text: '8E.10 ★ — ¿Tiene y usa un smartphone (teléfono inteligente)?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });

    const q8e11 = await saveQuestion(manager, {
      text: '8E.11 ★ — ¿Con qué frecuencia utiliza internet?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });
    await saveOptions(manager, q8e11, OPTS_FRECUENCIA_USO);

    const q8e12 = await saveQuestion(manager, {
      text: '8E.12 ★ — ¿Con qué frecuencia usa su teléfono celular?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secConect,
    });
    await saveOptions(manager, q8e12, OPTS_FRECUENCIA_USO);
  }

  console.log(`[seed] "${NAME}" creado.`);
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function seedInstrumentosInfraestructura(
  manager: EntityManager,
): Promise<void> {
  await seedInfraestructuraCacao(manager);
  await seedInfraestructuraCafe(manager);
  await seedInfraestructuraCannabis(manager);
  await seedInfraestructuraCanamo(manager);
  await seedInfraestructuraGeneral(manager);
}
