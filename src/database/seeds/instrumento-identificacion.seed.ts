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

// ─── Función principal ────────────────────────────────────────────────────────

const INSTRUMENT_NAME =
  'S1. Identificación del Encuestado y la Unidad Productiva';
const INSTRUMENT_VERSION = 1;

export async function seedInstrumentoIdentificacion(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (
    await instrumentRepo.findOne({
      where: { name: INSTRUMENT_NAME, version: INSTRUMENT_VERSION },
    })
  ) {
    console.log(
      `[seed] Instrumento "${INSTRUMENT_NAME}" v${INSTRUMENT_VERSION} ya existe. Se omite.`,
    );
    return;
  }

  const typeNames = ['open_text', 'numeric', 'yes_no', 'single_choice'];
  const types: Record<string, TypeOfQuestion> = {};
  for (const name of typeNames) {
    const t = await typeRepo.findOne({ where: { name } });
    if (!t)
      throw new Error(
        `[seed] TypeOfQuestion "${name}" no encontrado. Ejecute primero seedTypesOfQuestions.`,
      );
    types[name] = t;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: INSTRUMENT_NAME,
      version: INSTRUMENT_VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );
  console.log(`[seed] Instrumento "${INSTRUMENT_NAME}" creado.`);

  const [sec11, sec12, sec13, sec14, sec15] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '1.1 Perfil y Datos Personales',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '1.2 Datos de la Finca / Unidad Productiva',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({ name: '1.3 Ubicación', order: 3, instrument }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '1.4 Acceso desde el Casco Urbano',
        order: 4,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '1.5 Entorno de la Finca',
        order: 5,
        instrument,
      }),
    ),
  ]);

  // ── Sección 1.1 ──────────────────────────────────────────────────────────────
  {
    let order = 1;

    const perfilQ = await saveQuestion(manager, {
      text: '1.1 ★ — Perfil del encuestado',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec11,
    });
    await saveOptions(manager, perfilQ, [
      { text: 'Productor / Propietario' },
      { text: 'Encargado de cultivo' },
      { text: 'Transformador / Agroindustrializador' },
      { text: 'Comercializador' },
      { text: 'Otro', isOther: true },
    ]);

    const generoQ = await saveQuestion(manager, {
      text: '1.2 — Género del productor(a) / responsable',
      type: types.single_choice,
      isRequired: true,
      order: order++,
      section: sec11,
    });
    await saveOptions(manager, generoQ, [
      { text: 'Hombre' },
      { text: 'Mujer' },
      { text: 'No binario / Otro' },
      { text: 'Prefiere no responder' },
    ]);

    await saveQuestion(manager, {
      text: '1.3 — Edad del productor(a) (años)',
      type: types.numeric,
      isRequired: true,
      order: order++,
      section: sec11,
    });

    const educacionQ = await saveQuestion(manager, {
      text: '1.4 — Nivel educativo alcanzado',
      type: types.single_choice,
      isRequired: true,
      order: order++,
      section: sec11,
    });
    await saveOptions(manager, educacionQ, [
      { text: 'Sin escolaridad' },
      { text: 'Primaria (1°–5°)' },
      { text: 'Secundaria (6°–9°)' },
      { text: 'Media (10°–11°)' },
      { text: 'Técnico o tecnológico' },
      { text: 'Universitario' },
      { text: 'Posgrado' },
    ]);

    await saveQuestion(manager, {
      text: '1.5 ★ — Años de experiencia en la actividad productiva',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.6 — ¿Cuántas personas conforman su hogar?',
      type: types.numeric,
      isRequired: false,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.7 ★ — ¿La actividad agrícola es la principal fuente de ingresos del hogar?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.8 — Nombre completo del encuestado / propietario',
      type: types.open_text,
      isRequired: true,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.9 — Nombre de la persona encargada del cultivo (si es diferente al propietario)',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.10 — Número de celular del propietario',
      type: types.open_text,
      isRequired: true,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.11 — Número de celular del encargado del cultivo (si aplica)',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec11,
    });

    await saveQuestion(manager, {
      text: '1.12 — Correo electrónico',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec11,
    });
  }

  // ── Sección 1.2 ──────────────────────────────────────────────────────────────
  {
    let order = 1;

    await saveQuestion(manager, {
      text: '1.13 ★ — Nombre de la finca / unidad productiva',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec12,
    });

    const tenenciaQ = await saveQuestion(manager, {
      text: '1.14 ★ — La unidad productiva es: (Nota: si es arriendo, mínimo 10 años; cannabis/cáñamo mínimo 5 años)',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec12,
    });
    await saveOptions(manager, tenenciaQ, [
      { text: 'Propietario(a) con título formal' },
      { text: 'Propietario(a) sin título formal' },
      { text: 'Arrendatario(a)' },
      { text: 'Aparcero(a) / Mediería' },
      { text: 'Comodato / Préstamo' },
      { text: 'Tierra colectiva (resguardo / comunidad)' },
      { text: 'Otro', isOther: true },
    ]);

    const viviendasGate = await saveQuestion(manager, {
      text: '1.15 — ¿Hay vivienda(s) en la unidad productiva?',
      type: types.yes_no,
      isRequired: false,
      order: order++,
      section: sec12,
    });

    await saveQuestion(manager, {
      text: '1.16 — ¿Cuántas viviendas hay? (Verificar en visita del técnico)',
      type: types.numeric,
      isRequired: false,
      order: order++,
      section: sec12,
      conditionQuestion: viviendasGate,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: '1.17 ★ — Hectáreas totales del predio (ha)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec12,
    });

    await saveQuestion(manager, {
      text: '1.18 ★ — Hectáreas actualmente cultivadas con las cadenas del proyecto (ha)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec12,
    });

    const tamanoQ = await saveQuestion(manager, {
      text: '1.19 ★ — Tamaño de la operación (según área cultivada en cadenas del proyecto)',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec12,
    });
    await saveOptions(manager, tamanoQ, [
      { text: 'Pequeña (≤ 5 ha)' },
      { text: 'Mediana (5–10 ha)' },
      { text: 'Grande (> 10 ha)' },
    ]);

    await saveQuestion(manager, {
      text: '1.20 — Número de lotes en que se distribuye la producción',
      type: types.numeric,
      isRequired: false,
      order: order++,
      section: sec12,
    });
  }

  // ── Sección 1.3 ──────────────────────────────────────────────────────────────
  {
    let order = 1;

    const deptoQ = await saveQuestion(manager, {
      text: '1.21 ★ — Departamento',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec13,
    });
    await saveOptions(manager, deptoQ, [
      { text: 'Meta' },
      { text: 'La Guajira' },
      { text: 'Norte de Santander' },
      { text: 'Chocó' },
      { text: 'Caquetá' },
      { text: 'Antioquia' },
      { text: 'Otro', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: '1.22 ★ — Municipio',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec13,
    });

    await saveQuestion(manager, {
      text: '1.23 — Corregimiento (si aplica)',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec13,
    });

    await saveQuestion(manager, {
      text: '1.24 ★ — Vereda / Sector',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec13,
    });

    await saveQuestion(manager, {
      text: '1.25 — Altitud (m.s.n.m.) — usar altímetro o GPS',
      type: types.numeric,
      isRequired: false,
      order: order++,
      section: sec13,
    });

    await saveQuestion(manager, {
      text: '1.26a ★ — Latitud GPS (coordenada decimal, ej: 3.8612)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec13,
    });

    await saveQuestion(manager, {
      text: '1.26b ★ — Longitud GPS (coordenada decimal, ej: -73.0345)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec13,
    });
  }

  // ── Sección 1.4 ──────────────────────────────────────────────────────────────
  {
    let order = 1;

    await saveQuestion(manager, {
      text: '1.27 ★ — Municipio de referencia más cercano',
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec14,
    });

    await saveQuestion(manager, {
      text: '1.28 ★ — Distancia desde el casco urbano hasta la finca (km)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec14,
    });

    await saveQuestion(manager, {
      text: '1.29 ★ — Tiempo de desplazamiento hasta la finca (horas)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec14,
    });

    const accesoQ = await saveQuestion(manager, {
      text: '1.30 ★ — Medio de acceso principal',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec14,
    });
    await saveOptions(manager, accesoQ, [
      { text: 'Carretera pavimentada' },
      { text: 'Carretera sin pavimentar' },
      { text: 'Trocha / camino de herradura' },
      { text: 'Vía fluvial' },
      { text: 'Mixto' },
      { text: 'Otro', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: '1.31 ★ — ¿Es accesible la vía durante todo el año (incluyendo épocas de lluvia)? (Clave para visitas del equipo)',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec14,
    });

    await saveQuestion(manager, {
      text: '1.32 — Observaciones sobre el acceso',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec14,
    });
  }

  // ── Sección 1.5 ──────────────────────────────────────────────────────────────
  {
    let order = 1;

    await saveQuestion(manager, {
      text: '1.33 — Tipo de relieve predominante de la finca',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    await saveQuestion(manager, {
      text: '1.34 — ¿Hay erosión visible en los terrenos?',
      type: types.yes_no,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    await saveQuestion(manager, {
      text: '1.35 — ¿El campo tiene sistema de drenaje?',
      type: types.yes_no,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    await saveQuestion(manager, {
      text: '1.36 — ¿Se usan tractores o maquinaria pesada en la finca?',
      type: types.yes_no,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    await saveQuestion(manager, {
      text: '1.37 — ¿Hay obras de construcción activas cerca de la finca?',
      type: types.yes_no,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    await saveQuestion(manager, {
      text: '1.38 — ¿Qué tipo de actividad económica realizan en la zona aledaña? (ej: ganadera, mismo cultivo, fábricas)',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec15,
    });

    // 1.39: single_choice gate → open_text condicional por optionId de "Sí"
    const contaminacionQ = await saveQuestion(manager, {
      text: '1.39 ★ — ¿Existen cultivos vecinos que puedan generar contaminación cruzada? (Importante para cannabis/cáñamo)',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: order++,
      section: sec15,
    });
    const contaminacionOpts = await saveOptions(manager, contaminacionQ, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);

    await saveQuestion(manager, {
      text: '1.39b — ¿Cuáles cultivos vecinos generan o podrían generar contaminación cruzada?',
      type: types.open_text,
      isRequired: false,
      order: order++,
      section: sec15,
      conditionQuestion: contaminacionQ,
      conditionValue: contaminacionOpts.get('Sí')!,
    });
  }

  console.log(
    `[seed] Instrumento "${INSTRUMENT_NAME}" insertado (41 preguntas en 5 secciones).`,
  );
}
