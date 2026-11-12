/**
 * Spec 66 (Fase 3, D15): fusión de preguntas equivalentes entre instrumentos.
 *
 * Una fuente nueva (talleres, `S_REG`, `S_AGRI`) repite preguntas que ya
 * existían con las mismas opciones. En vez de dos tarjetas con la mitad de los
 * datos cada una, el dashboard las junta en **una sola gráfica**: se cuenta
 * por encuesta y las opciones se agrupan por texto (igual que los destinos
 * con varias preguntas del spec 97, ver `DestinationQuestion`).
 *
 * La fusión es **explícita** (nada se une por coincidencia automática): cada
 * grupo lista sus miembros por instrumento y texto exacto, el mismo locator
 * de `dashboard-question-curation.config.ts`. Solo aplica a la categoría
 * indicada.
 *
 * `external: true` marca un miembro que vive en una sección de **otra**
 * categoría: se trae directamente (no pasa por la lista de esa categoría).
 * Su categoría de origen debe ocultarlo en la curaduría para que no salga dos
 * veces.
 */

import {
  CHAIN_STAGE_TALLER_TEXT,
  CHAIN_STAGE_TEXT,
} from './dashboard-response-filters.config';

export interface QuestionMergeMember {
  instrumentCode: string;
  questionText: string;
  /** El miembro no está en las secciones de la categoría del grupo. */
  external?: boolean;
  /**
   * Es la pregunta que representa al grupo (da título, tipo, instrumento de
   * origen y posición en la grilla). Debe haber exactamente una por grupo y no
   * puede ser `external`. Así el resultado no depende del orden en que la base
   * devuelve los instrumentos.
   */
  representative?: boolean;
}

export interface QuestionMergeGroup {
  /** Categoría donde se muestra la gráfica fusionada. */
  categoryId: string;
  /** Nombre estable del grupo, para trazabilidad y pruebas. */
  key: string;
  members: QuestionMergeMember[];
  note: string;
}

const MAIN_CROP_TALLER_TEXT =
  '¿Qué cultiva actualmente? (Seleccione el cultivo principal)';

export const QUESTION_MERGE_GROUPS: QuestionMergeGroup[] = [
  {
    categoryId: 'C1',
    key: 'main-crop',
    members: [
      {
        instrumentCode: 'S_REG',
        questionText: 'Cultivo principal',
        representative: true,
      },
      { instrumentCode: 'TALLER', questionText: MAIN_CROP_TALLER_TEXT },
      { instrumentCode: 'TALLER-TAB', questionText: MAIN_CROP_TALLER_TEXT },
    ],
    note:
      'C1 (spec 66, Fase 3, D15, 2026-11-11): mismas 4 opciones ' +
      '(Café/Cacao/Cáñamo/Cannabis) en el registro y en los talleres.',
  },
  {
    categoryId: 'C1',
    key: 'chain-stages',
    members: [
      {
        instrumentCode: 'TALLER',
        questionText: CHAIN_STAGE_TALLER_TEXT,
        representative: true,
      },
      { instrumentCode: 'TALLER-TAB', questionText: CHAIN_STAGE_TALLER_TEXT },
      { instrumentCode: 'S1b', questionText: CHAIN_STAGE_TEXT },
      {
        instrumentCode: 'S_AGRI',
        questionText: CHAIN_STAGE_TEXT,
        external: true,
      },
    ],
    note:
      'C1 (spec 66, Fase 3, D15, 2026-11-11): las 7 etapas son idénticas en ' +
      'talleres, S1b y S_AGRI. La copia de S_AGRI (C12) se oculta en la ' +
      'curaduría y se trae aquí.',
  },
  {
    categoryId: 'C1',
    key: 'gender',
    members: [
      {
        instrumentCode: 'S_REG',
        questionText: 'Género del productor(a)',
        representative: true,
      },
      { instrumentCode: 'S1a', questionText: 'Género del productor(a)' },
    ],
    note:
      'C1 (spec 66, Fase 3, D13.6/D15, 2026-11-12): misma pregunta y ' +
      'opciones en el registro vigente y en S1a (histórico).',
  },
  {
    categoryId: 'C1',
    key: 'age',
    members: [
      {
        instrumentCode: 'S_REG',
        questionText: 'Edad del productor(a)',
        representative: true,
      },
      { instrumentCode: 'S1a', questionText: 'Edad del productor(a)' },
    ],
    note:
      'C1 (spec 66, Fase 3, D13.6/D15, 2026-11-12): misma pregunta numérica ' +
      'en el registro vigente y en S1a (histórico).',
  },
  {
    categoryId: 'C1',
    key: 'tenure',
    members: [
      {
        instrumentCode: 'S_FINCA',
        questionText: 'La unidad productiva es:',
        representative: true,
      },
      { instrumentCode: 'S1b', questionText: 'La unidad productiva es:' },
    ],
    note:
      'C1 (spec 66, Fase 3, D13.6/D15, 2026-11-12): tenencia de la tierra en ' +
      'la finca vigente y en S1b (histórico).',
  },
];

export function mergeGroupsForCategory(
  categoryId: string,
): QuestionMergeGroup[] {
  return QUESTION_MERGE_GROUPS.filter((g) => g.categoryId === categoryId);
}
