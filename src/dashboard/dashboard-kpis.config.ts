import {
  CONNECTIVITY_SOURCE,
  QuestionLocator,
} from './dashboard-response-filters.config';

/**
 * Spec 43 (Fase 4, D5): catálogo de KPIs curados. Cada entrada declara su
 * pregunta fuente (`QuestionLocator`, mismo mecanismo que Fase 3) y su
 * operación — nunca un valor hardcodeado del mockup, que era ilustrativo.
 *
 * Solo existen dos vistas curadas en el diseño (`1a` Resumen general, `2a`
 * Categoría de demanda digital): `getKpis` devuelve `OVERVIEW_KPIS` salvo
 * que `filters.categoryId === 'C14'`, en cuyo caso devuelve
 * `DIGITAL_DEMAND_KPIS`. Ninguna otra categoría tiene tira de KPIs propia
 * todavía (fuera de alcance de esta fase; ver nota en el spec).
 *
 * Nota (spec 66, Fase 3, D7, 2026-08-10): la categoría de demanda digital
 * era `C15` antes de fusionar "Perfil del productor" + "La finca" en una
 * sola categoría (C1) — la renumeración en cascada la dejó en `C14`. La
 * constante se renombró de `C15_KPIS` a `DIGITAL_DEMAND_KPIS` para no
 * mentir sobre a qué categoría corresponde.
 *
 * "Avance campaña" (KPI del mockup de `1a`) se **excluye**: `Campaign` no
 * tiene un campo de meta/objetivo en el esquema actual y este spec no agrega
 * columnas nuevas (ver "Alcance → No incluye"). Fabricar un número sin fuente
 * violaría D5.
 */

export type KpiOperation =
  | { type: 'yesPercentage'; source: QuestionLocator }
  | { type: 'likertAgreePercentage'; source: QuestionLocator; minScore: number }
  | {
      type: 'choiceAcceptedPercentage';
      source: QuestionLocator;
      acceptedOptionTexts: string[];
    }
  | { type: 'topChoiceOption'; source: QuestionLocator }
  | { type: 'acceptanceIndex' }
  | { type: 'distinctFarmerCount' }
  | { type: 'distinctFarmCount' }
  | { type: 'instrumentCatalog' };

export interface KpiDefinition {
  key: string;
  label: string;
  unit?: string;
  operation: KpiOperation;
}

const CON_INTERNET: KpiDefinition = {
  key: 'internetAccess',
  label: 'Internet en la finca',
  unit: '%',
  operation: {
    type: 'yesPercentage',
    source: { locate: 'systemField', systemField: 'farm.internetAccess' },
  },
};

const ACCEPTANCE_INDEX: KpiDefinition = {
  key: 'acceptanceIndex',
  label: 'Índice de aceptación',
  unit: '/5',
  operation: { type: 'acceptanceIndex' },
};

export const OVERVIEW_KPIS: KpiDefinition[] = [
  {
    key: 'farmerCount',
    label: 'Productores',
    operation: { type: 'distinctFarmerCount' },
  },
  {
    key: 'farmCount',
    label: 'Fincas',
    operation: { type: 'distinctFarmCount' },
  },
  {
    key: 'instrumentCatalog',
    label: 'Instrumentos',
    operation: { type: 'instrumentCatalog' },
  },
  CON_INTERNET,
  ACCEPTANCE_INDEX,
];

export const DIGITAL_DEMAND_KPIS: KpiDefinition[] = [
  ACCEPTANCE_INDEX,
  // DEBT: spec 66 (D12) — «¿Tiene y usa un smartphone…?» no existe en ningún
  // instrumento de producción: el KPI sale vacío. Decidir en la Fase 18 si se
  // reemplaza (p. ej. por «¿Qué dispositivos utiliza actualmente?») o se quita.
  {
    key: 'hasSmartphone',
    label: 'Con smartphone',
    unit: '%',
    operation: {
      type: 'yesPercentage',
      source: {
        locate: 'instrumentAndText',
        instrumentCode: 'S8E',
        questionText: '¿Tiene y usa un smartphone (teléfono inteligente)?',
      },
    },
  },
  CON_INTERNET,
  {
    key: 'wantsOfflineApp',
    label: 'Usaría app offline',
    unit: '%',
    operation: {
      type: 'likertAgreePercentage',
      minScore: 4,
      source: {
        locate: 'instrumentAndText',
        instrumentCode: 'S8E',
        questionText:
          'Me gustaría que la app pudiera usarse sin internet y sincronizara la información cuando recuperara señal, para no perder datos en zonas sin cobertura.',
      },
    },
  },
  {
    key: 'willingToPay',
    label: 'Dispuesto a pagar',
    unit: '%',
    operation: {
      type: 'choiceAcceptedPercentage',
      acceptedOptionTexts: [
        'Sí, pagaría hasta $20.000 COP/mes',
        'Sí, $20.001–$50.000 COP/mes',
        'Sí, más de $50.000 COP/mes',
      ],
      source: {
        locate: 'instrumentAndText',
        instrumentCode: 'S11-INV',
        questionText:
          '¿Estaría dispuesto a pagar por un servicio digital de monitoreo o gestión de su finca?',
      },
    },
  },
  {
    key: 'topBarrier',
    label: 'Barrera #1',
    operation: {
      type: 'topChoiceOption',
      source: {
        locate: 'instrumentAndText',
        instrumentCode: 'S11-DB',
        questionText:
          '¿Cuáles son las principales barreras para adoptar tecnologías digitales?',
      },
    },
  },
];

/** Fase 4: preguntas fuente de la vista "Demanda digital" (C14), fuera del
 * catálogo de filtros de Fase 3 porque no son filtros sino agregados. */
export const DIGITAL_DEMAND_SOURCES = {
  sDcuInstrumentCode: 'S_DCU',
  barrierSections: {
    b1: 'Barrera de Acceso y Conectividad (B1)',
    b2: 'Barrera Cognitiva (B2)',
    b3: 'Barrera Subjetiva (B3)',
  },
  institutionTrustSection: 'Confianza en Instituciones (Módulo E.5)',
  adoptionBarriers: {
    locate: 'instrumentAndText',
    instrumentCode: 'S11-DB',
    questionText:
      '¿Cuáles son las principales barreras para adoptar tecnologías digitales?',
  } satisfies QuestionLocator,
  // Spec 66 (D13): vigente en `S_AGRI` (y talleres), histórica en `S11-DB`.
  digitalSkills: {
    locate: 'anyOf',
    sources: [
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S_AGRI',
        questionText:
          '¿Cuáles de las siguientes habilidades digitales puede realizar?',
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S11-DB',
        questionText:
          '¿Cuáles de las siguientes habilidades digitales puede realizar?',
      },
    ],
  } satisfies QuestionLocator,
  platforms: {
    locate: 'anyOf',
    sources: [
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S_AGRI',
        questionText: '¿Cuáles plataformas o aplicaciones usa actualmente?',
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'TALLER',
        questionText:
          '¿Cuáles plataformas o aplicaciones usa actualmente? (puede marcar más de una opción)',
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'TALLER-TAB',
        questionText:
          '¿Cuáles plataformas o aplicaciones usa actualmente? (puede marcar más de una opción)',
      },
      {
        locate: 'instrumentAndText',
        instrumentCode: 'S11-DB',
        questionText: '¿Cuáles plataformas o aplicaciones usa actualmente?',
      },
    ],
  } satisfies QuestionLocator,
  // DEBT: spec 66 (D12) — esta pregunta no existe en ningún instrumento de
  // producción (`S11-RES` ya no existe): el corte sale vacío. Decidir en la
  // Fase 18 si se reemplaza o se quita.
  preferredChannel: {
    locate: 'instrumentAndText',
    instrumentCode: 'S11-RES',
    questionText:
      '¿Qué formato preferiría para recibir información o alertas sobre su producción?',
  } satisfies QuestionLocator,
  cutSources: {
    age: {
      locate: 'systemField',
      systemField: 'farmer.age',
    } satisfies QuestionLocator,
    education: {
      locate: 'systemField',
      systemField: 'farmer.educationLevel',
    } satisfies QuestionLocator,
    connectivity: CONNECTIVITY_SOURCE,
  },
};
