import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Constantes de opciones reutilizables ────────────────────────────────────

const OPTS_SI_NO_NSA = [
  { text: 'Sí' },
  { text: 'No' },
  { text: 'No sabe / No aplica' },
];

const OPTS_SI_NO = [{ text: 'Sí' }, { text: 'No' }];

const OPTS_UNIDAD = [{ text: 'kg' }, { text: 't' }, { text: 'L' }];

const OPTS_MANEJO = [
  { text: 'Abandono en campo' },
  { text: 'Quema' },
  { text: 'Incorporación al suelo / compostaje' },
  { text: 'Alimentación animal' },
  { text: 'Venta o donación' },
  { text: 'Aprovechamiento energético' },
  { text: 'Ningún manejo especial' },
  { text: 'Otro', isOther: true },
];

const OPTS_MATERIAL = [
  { text: 'Fibroso' },
  { text: 'Denso' },
  { text: 'Mixto' },
];

const OPTS_ALMACENAMIENTO = [
  { text: 'A la intemperie' },
  { text: 'Bajo techo sin control' },
  { text: 'En silos' },
  { text: 'Contacto directo con suelo' },
  { text: 'En cuarto controlado' },
];

const OPTS_AZUCARES = [
  { text: 'Hexosas (C6): glucosa, fructosa' },
  { text: 'Pentosas (C5): xilosa' },
  { text: 'No sabe' },
];

const OPTS_USOS_VALORIZACION = [
  { text: 'Fertilizantes / abonos' },
  { text: 'Producción de energía (biochar, biogás)' },
  { text: 'Tratamiento de agua (filtros, carbón activado)' },
  { text: 'Materiales / empaques' },
  { text: 'Ingredientes funcionales / cosméticos' },
];

// ─── Grupos de residuos para la Sección 6.1 ──────────────────────────────────

interface ResidueGroup {
  code: string;
  name: string;
  isOtro?: boolean;
}

const RESIDUES_CACAO: ResidueGroup[] = [
  { code: '6.1.1', name: 'Cáscara / cascarilla de mazorca de cacao' },
  { code: '6.1.2', name: 'Mucílago / baba de cacao' },
  { code: '6.1.3', name: 'Semillas defectuosas / cacao de baja calidad' },
  { code: '6.1.4', name: 'Aguas mieles del beneficio húmedo de cacao' },
  { code: '6.1.5', name: 'Restos de poda de cacao' },
  { code: '6.1.6', name: 'Cascarilla de cacao tostado' },
  {
    code: '6.1.otro-cacao',
    name: 'otro residuo de cacao no listado',
    isOtro: true,
  },
];

const RESIDUES_CAFE: ResidueGroup[] = [
  { code: '6.1.7', name: 'Pulpa de café (despulpado)' },
  { code: '6.1.8', name: 'Mucílago de café' },
  { code: '6.1.9', name: 'Aguas mieles de café' },
  { code: '6.1.10', name: 'Cisco / cascarilla de café' },
  { code: '6.1.11', name: 'Café de segunda (granos defectuosos)' },
  { code: '6.1.12', name: 'Restos de poda de café' },
];

const RESIDUES_CANNABIS: ResidueGroup[] = [
  { code: '6.1.13', name: 'Tallos y hojas de descarte de cannabis' },
  {
    code: '6.1.14',
    name: 'Material vegetal post-extracción (bagazo) de cannabis',
  },
  { code: '6.1.15', name: 'Aguas de limpieza / lixiviados de cannabis' },
  { code: '6.1.16', name: 'Residuos de empaque de cannabis' },
];

const RESIDUES_CANAMO: ResidueGroup[] = [
  { code: '6.1.17', name: 'Cáscara / agramiza (fibra corta de cáñamo)' },
  { code: '6.1.18', name: 'Semillas partidas o imperfectas de cáñamo' },
  { code: '6.1.19', name: 'Torta de semilla post-prensado de cáñamo' },
  { code: '6.1.20', name: 'Aguas de proceso de cáñamo' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Función para sección 6.1 ─────────────────────────────────────────────────

async function seedSection61(
  manager: EntityManager,
  section: Section,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  let order = 1;

  const allGroups: { cropLabel: string; residues: ResidueGroup[] }[] = [
    { cropLabel: 'CACAO', residues: RESIDUES_CACAO },
    { cropLabel: 'CAFÉ', residues: RESIDUES_CAFE },
    { cropLabel: 'CANNABIS', residues: RESIDUES_CANNABIS },
    { cropLabel: 'CÁÑAMO', residues: RESIDUES_CANAMO },
  ];

  for (const { residues } of allGroups) {
    for (const residue of residues) {
      const gateText = residue.isOtro
        ? `${residue.code} — ¿Genera algún ${residue.name}?`
        : `${residue.code} — ¿Genera ${residue.name}?`;

      const gate = await saveQuestion(manager, {
        text: gateText,
        type: types.yes_no,
        isRequired: !residue.isOtro,
        order: order++,
        section,
      });

      if (residue.isOtro) {
        await saveQuestion(manager, {
          text: `${residue.code} — ¿Cuál es el nombre del residuo?`,
          type: types.open_text,
          isRequired: false,
          order: order++,
          section,
          conditionQuestion: gate,
          conditionValue: 'true',
        });
      }

      await saveQuestion(manager, {
        text: `${residue.code} — Cantidad estimada por año de ${residue.name}`,
        type: types.numeric,
        isRequired: false,
        order: order++,
        section,
        conditionQuestion: gate,
        conditionValue: 'true',
      });

      const unidadQ = await saveQuestion(manager, {
        text: `${residue.code} — Unidad de medida para ${residue.name}`,
        type: types.single_choice,
        isRequired: false,
        order: order++,
        section,
        conditionQuestion: gate,
        conditionValue: 'true',
      });
      await saveOptions(manager, unidadQ, OPTS_UNIDAD);

      const manejoQ = await saveQuestion(manager, {
        text: `${residue.code} — Manejo actual de ${residue.name}`,
        type: types.single_choice,
        isRequired: false,
        order: order++,
        section,
        conditionQuestion: gate,
        conditionValue: 'true',
      });
      await saveOptions(manager, manejoQ, OPTS_MANEJO);

      await saveQuestion(manager, {
        text: `${residue.code} — Efectos negativos observados de ${residue.name}`,
        type: types.open_text,
        isRequired: false,
        order: order++,
        section,
        conditionQuestion: gate,
        conditionValue: 'true',
      });
    }
  }
}

// ─── Función para sección 6.2 ─────────────────────────────────────────────────

async function seedSection62(
  manager: EntityManager,
  section: Section,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  let order = 1;

  // 6.2a — Preguntas generales

  await saveQuestion(manager, {
    text: '6.2.1 ★ — ¿Cuál es la parte del cultivo que constituye el residuo o los residuos más abundantes? (Ej: cáscara de cacao, mucílago de café, tallos de cáñamo)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.2 — ¿El residuo es homogéneo o viene mezclado con otros materiales (tierra, piedras, plásticos)?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.3 — ¿Cómo es la forma y tamaño aproximado del residuo?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  const materialQ = await saveQuestion(manager, {
    text: '6.2.4 — ¿El material es fibroso o denso?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, materialQ, OPTS_MATERIAL);

  const caracterizacionQ = await saveQuestion(manager, {
    text: '6.2.5 ★ — ¿Se ha realizado algún análisis de caracterización al residuo (bromatológico, elemental C/H/O/N/S, u otro)?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  const caracterizacionOpts = await saveOptions(
    manager,
    caracterizacionQ,
    OPTS_SI_NO_NSA,
  );
  const caracterizacionSiId = caracterizacionOpts.get('Sí')!;

  const compartirResultadosQ = await saveQuestion(manager, {
    text: '6.2.6 — ¿Puede compartir los resultados de la caracterización con el proyecto? (Aplica solo si respondió Sí en 6.2.5)',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: caracterizacionQ,
    conditionValue: caracterizacionSiId,
  });
  await saveOptions(manager, compartirResultadosQ, OPTS_SI_NO);

  await saveQuestion(manager, {
    text: '6.2.7 — ¿Tiene idea del contenido de humedad del residuo al momento de la recolección?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.8 — ¿Cuánto tiempo transcurre desde la generación del residuo hasta que puede ser recolectado? ¿Observa señales de descomposición?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  const almacenamientoQ = await saveQuestion(manager, {
    text: '6.2.9 — ¿Bajo qué condiciones se almacena actualmente el residuo?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, almacenamientoQ, OPTS_ALMACENAMIENTO);

  const secadoQ = await saveQuestion(manager, {
    text: '6.2.10 ★ — ¿Existe algún proceso de secado previo (solar o mecánico) antes de entregar / usar el residuo?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, secadoQ, OPTS_SI_NO_NSA);

  const enviarLabQ = await saveQuestion(manager, {
    text: '6.2.11 ★ — ¿Sería posible enviar los residuos secos al laboratorio del proyecto?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, enviarLabQ, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '6.2.12 ★ — ¿Se aplican agentes químicos durante el cultivo o poscosecha (pesticidas, fungicidas)? Liste los agentes empleados. (Clave para seguridad en valorización)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  // 6.2b — Café y Cacao (residuos líquidos)

  await saveQuestion(manager, {
    text: '6.2.13 ★ — [Café / Cacao] ¿Cómo es el proceso de beneficio: vía seca o húmeda?',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.14 ★ — [Café / Cacao] ¿Cuál es el volumen estimado de lixiviados o "aguas mieles" por tonelada de producto procesado? (L/t o m³/t)',
    type: types.numeric,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.15 — [Café / Cacao] ¿Se añade agua adicional durante el proceso de extracción o despulpado?',
    type: types.yes_no,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.16 — [Café / Cacao] ¿Cuál es el pH inicial aproximado de las fases líquidas obtenidas?',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  // 6.2c — Logística y estacionalidad

  await saveQuestion(manager, {
    text: '6.2.17 ★ — ¿El residuo se genera de manera constante o solo en meses específicos de cosecha? (Indique los meses si aplica)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.18 ★ — ¿Qué volumen o masa total genera por lote de producción? (Incluya cantidad y unidad: kg, t o L)',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.19 — ¿El residuo se recolecta de forma selectiva o se mezcla en un foso común?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.20 — ¿Cuánto tiempo máximo permanece almacenado el residuo antes de ser usado o despachado? (horas / días / semanas)',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  const lixiviacionQ = await saveQuestion(manager, {
    text: '6.2.21 — ¿Se observa lixiviación (pérdida de líquidos) durante el almacenamiento del residuo sólido?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, lixiviacionQ, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '6.2.22 — ¿Cuál es la temperatura promedio del área de almacenamiento? (°C)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  const metalesPesadosQ = await saveQuestion(manager, {
    text: '6.2.23 ★ — ¿Se ha evaluado la presencia de metales pesados (Pb, Cd, As, Hg) en el residuo? (Clave para seguridad en valorización energética y de materiales)',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  const metalesPesadosOpts = await saveOptions(
    manager,
    metalesPesadosQ,
    OPTS_SI_NO_NSA,
  );
  const metalesPesadosSiId = metalesPesadosOpts.get('Sí')!;

  const compartirMetalesQ = await saveQuestion(manager, {
    text: '6.2.23b — ¿Puede compartir los resultados de metales pesados con el proyecto? (Aplica solo si respondió Sí en 6.2.23)',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
    conditionQuestion: metalesPesadosQ,
    conditionValue: metalesPesadosSiId,
  });
  await saveOptions(manager, compartirMetalesQ, OPTS_SI_NO);

  // 6.2d — Café (residuos de fermentación)

  await saveQuestion(manager, {
    text: '6.2.24 ◆ — [Café] ¿Cuánto tiempo (horas) pasa desde que el residuo sale de la despulpadora hasta que se estabiliza?',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });

  const azucaresQ = await saveQuestion(manager, {
    text: '6.2.25 ◆ — [Café] Si conoce los azúcares del proceso de fermentación, ¿predominan hexosas (C6: glucosa, fructosa) o pentosas (C5: xilosa)?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, azucaresQ, OPTS_AZUCARES);

  // 6.2e — Cáñamo y Cacao (residuos fibrosos)

  await saveQuestion(manager, {
    text: '6.2.e — [Cáñamo / Cacao] ¿Qué residuos genera? Nombre todos los residuos de estos cultivos.',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.2.26 ◆ — [Cáñamo / Cacao] Si el residuo es fibroso (tallo de cáñamo, cáscara de cacao), ¿cuál es la longitud promedio de la fibra? (cm)',
    type: types.numeric,
    isRequired: false,
    order: order++,
    section,
  });
}

// ─── Función para sección 6.3 ─────────────────────────────────────────────────

async function seedSection63(
  manager: EntityManager,
  section: Section,
  types: Record<string, TypeOfQuestion>,
): Promise<void> {
  let order = 1;

  const dispuestoQ = await saveQuestion(manager, {
    text: '6.3.1 ★ — ¿Estaría dispuesto a reutilizar / valorizar sus residuos?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, dispuestoQ, OPTS_SI_NO_NSA);

  const usosQ = await saveQuestion(manager, {
    text: '6.3.2a ★ — ¿Para qué usos consideraría viable aprovechar sus residuos? (Marque todos los que apliquen)',
    type: types.multiple_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, usosQ, OPTS_USOS_VALORIZACION);

  const escuchadoEnergiaQ = await saveQuestion(manager, {
    text: '4.5.3 ★ — ¿Ha escuchado sobre la generación de energía a partir de residuos?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, escuchadoEnergiaQ, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '4.5.4 ★ — ¿Actualmente aprovecha algún residuo para generar energía?',
    type: types.yes_no,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  const interesGasQ = await saveQuestion(manager, {
    text: '4.5.5 ★ — ¿Estaría interesado en tecnologías para generar gas para usar en los procesos requeridos en su unidad productiva?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, interesGasQ, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '4.5.6 — ¿Qué uso le daría a esa energía?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });

  const biocharQ = await saveQuestion(manager, {
    text: '6.3.3 ★ — ¿Le interesaría usar sus residuos para producir biochar, biogás o bioaceite (pirólisis)?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, biocharQ, OPTS_SI_NO_NSA);

  const bioplasticosQ = await saveQuestion(manager, {
    text: '6.3.4 ★ — ¿Le interesaría producir bioplásticos o materiales de construcción con sus residuos?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, bioplasticosQ, OPTS_SI_NO_NSA);

  const tratamientoAguaQ = await saveQuestion(manager, {
    text: '6.3.5 ★ — ¿Le interesaría usar sus residuos para tratamiento de aguas?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, tratamientoAguaQ, OPTS_SI_NO_NSA);

  const funcionalQ = await saveQuestion(manager, {
    text: '6.3.6a — ¿Sus residuos podrían tener potencial para ingredientes funcionales (con beneficio para la salud)?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, funcionalQ, OPTS_SI_NO_NSA);

  const biocosmeticosQ = await saveQuestion(manager, {
    text: '6.3.6b — ¿Sus residuos podrían tener potencial para ingredientes biocosméticos?',
    type: types.single_choice,
    isRequired: false,
    order: order++,
    section,
  });
  await saveOptions(manager, biocosmeticosQ, OPTS_SI_NO_NSA);

  const filtrosQ = await saveQuestion(manager, {
    text: '6.3.7 ★ — ¿Le interesa utilizar filtros para mejorar la calidad del agua usando residuos de café / cacao / cannabis?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, filtrosQ, OPTS_SI_NO_NSA);

  const probarFiltrosQ = await saveQuestion(manager, {
    text: '6.3.8 ★ — ¿Estaría dispuesto a probar filtros fabricados a partir de sus propios residuos?',
    type: types.single_choice,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });
  await saveOptions(manager, probarFiltrosQ, OPTS_SI_NO_NSA);

  await saveQuestion(manager, {
    text: '6.3.9 ★ — ¿Qué factor considera más importante al evaluar una tecnología de valorización de residuos?',
    type: types.open_text,
    isRequired: true,
    isSelectionCriteria: true,
    order: order++,
    section,
  });

  await saveQuestion(manager, {
    text: '6.3 — ¿Ha incorporado alguna ruta de valorización? Si Sí: ¿Cuál? ¿Cómo le ha funcionado? Si No: ¿Cuál intentó sin éxito? ¿Por qué no funcionó? ¿Quién se la dio o vendió?',
    type: types.open_text,
    isRequired: false,
    order: order++,
    section,
  });
}

// ─── Función principal ────────────────────────────────────────────────────────

const INSTRUMENT_NAME = 'S6: Generación y Manejo de Residuos / Biomasa';
const INSTRUMENT_VERSION = 1;

export async function seedInstrumentoResiduos(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  const existing = await instrumentRepo.findOne({
    where: { name: INSTRUMENT_NAME, version: INSTRUMENT_VERSION },
  });
  if (existing) {
    console.log(
      `[seed] Instrumento "${INSTRUMENT_NAME}" v${INSTRUMENT_VERSION} ya existe. Se omite.`,
    );
    return;
  }

  // Cargar tipos de pregunta
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

  // Crear instrumento
  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: INSTRUMENT_NAME,
      version: INSTRUMENT_VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );
  console.log(
    `[seed] Instrumento creado: "${INSTRUMENT_NAME}" v${INSTRUMENT_VERSION}`,
  );

  // Crear secciones
  const sec61 = await sectionRepo.save(
    sectionRepo.create({
      name: '6.1 Tabla de Residuos por Cultivo',
      order: 1,
      instrument,
    }),
  );
  const sec62 = await sectionRepo.save(
    sectionRepo.create({
      name: '6.2 Caracterización Detallada de Residuos',
      order: 2,
      instrument,
    }),
  );
  const sec63 = await sectionRepo.save(
    sectionRepo.create({
      name: '6.3 Interés en Valorización de Residuos',
      order: 3,
      instrument,
    }),
  );

  console.log('[seed] Secciones creadas. Insertando preguntas...');
  await seedSection61(manager, sec61, types);
  console.log('[seed] Sección 6.1 lista.');
  await seedSection62(manager, sec62, types);
  console.log('[seed] Sección 6.2 lista.');
  await seedSection63(manager, sec63, types);
  console.log('[seed] Sección 6.3 lista.');

  console.log('[seed] Instrumento de residuos insertado correctamente.');
}
