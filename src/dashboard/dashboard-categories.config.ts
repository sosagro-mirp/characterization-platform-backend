export interface DashboardCategoryInstrumentMapping {
  /** Código de instrumento (Instrument.code). */
  instrumentCode: string;
  /**
   * Si se define, la categoría solo agrega las preguntas de estas secciones
   * del instrumento (por Section.name, coincidencia exacta). Si se omite, se
   * agregan todas las secciones del instrumento. Necesario para instrumentos
   * que aportan a más de una categoría según la sección (ver spec 43 D1,
   * caso S1a → C1 + C2).
   */
  sectionNames?: string[];
}

export interface DashboardCategoryConfig {
  id: string;
  code: string;
  name: string;
  instruments: DashboardCategoryInstrumentMapping[];
  /** Tag opcional para vistas especiales consolidadas (ej. C15 "Demanda digital"). */
  tag?: string;
}

/**
 * Catálogo estático de categorías temáticas del dashboard público (spec 43,
 * decisión D1). Fuente: `docs/reports/dashboard.md §2` (Categorías simples) y
 * `§4` (Mapeo por instrumento). Los `instrumentCode` referencian
 * `Instrument.code`, backfillado por la migración
 * `BackfillInstrumentCodes1782568700000` (antes solo 3 de 40 instrumentos
 * tenían `code` poblado).
 *
 * Nota S11: `dashboard.md §2` lista "S11 (×3)" para C15, pero la base tiene 4
 * instrumentos con nombre "S11: Adopción Tecnológica — …"; el diseño no
 * documentó "Productores y Propietarios Residentes" en su §4. Se incluyen
 * los 4 aquí porque los cuatro son instrumentos de adopción tecnológica —
 * excluir uno por omisión del documento de diseño sería más arbitrario que
 * incluirlo.
 */
export const DASHBOARD_CATEGORIES: DashboardCategoryConfig[] = [
  {
    id: 'C1',
    code: 'C1',
    name: 'Perfil del productor',
    instruments: [
      {
        instrumentCode: 'S1a',
        sectionNames: ['Identificación del encuestado/propietario/productor'],
      },
    ],
  },
  {
    id: 'C2',
    code: 'C2',
    name: 'Ubicación y acceso',
    instruments: [
      {
        instrumentCode: 'S1a',
        sectionNames: ['Ubicación', 'Acceso desde el Casco Urbano'],
      },
      { instrumentCode: 'S13' },
    ],
  },
  {
    id: 'C3',
    code: 'C3',
    name: 'La finca',
    instruments: [{ instrumentCode: 'S1b' }],
  },
  {
    id: 'C4',
    code: 'C4',
    name: 'Cultivos y variedades',
    instruments: [
      { instrumentCode: 'S2' },
      { instrumentCode: 'S2.4' },
      { instrumentCode: 'S2.5' },
      { instrumentCode: 'S2.6' },
      { instrumentCode: 'S2.7' },
      { instrumentCode: 'S3B' },
    ],
  },
  {
    id: 'C5',
    code: 'C5',
    name: 'Suelo, clima y fertilización',
    instruments: [{ instrumentCode: 'S3' }],
  },
  {
    id: 'C6',
    code: 'C6',
    name: 'Sanidad vegetal',
    instruments: [{ instrumentCode: 'S3.4.1' }, { instrumentCode: 'S12' }],
  },
  {
    id: 'C7',
    code: 'C7',
    name: 'Poscosecha y calidad',
    instruments: [
      { instrumentCode: 'S4.1' },
      { instrumentCode: 'S4.2' },
      { instrumentCode: 'S4.3' },
      { instrumentCode: 'S4.4' },
      { instrumentCode: 'S5' },
    ],
  },
  {
    id: 'C8',
    code: 'C8',
    name: 'Energía y equipos',
    instruments: [{ instrumentCode: 'S4.5' }],
  },
  {
    id: 'C9',
    code: 'C9',
    name: 'Residuos y valorización',
    instruments: [
      { instrumentCode: 'S6A' },
      { instrumentCode: 'S6B' },
      { instrumentCode: 'S6C' },
      { instrumentCode: 'S6D' },
    ],
  },
  {
    id: 'C10',
    code: 'C10',
    name: 'Agua',
    instruments: [
      { instrumentCode: 'S7A' },
      { instrumentCode: 'S7B' },
      { instrumentCode: 'S7C' },
    ],
  },
  {
    id: 'C11',
    code: 'C11',
    name: 'Infraestructura productiva',
    instruments: [
      { instrumentCode: 'S8A' },
      { instrumentCode: 'S8B' },
      { instrumentCode: 'S8C' },
      { instrumentCode: 'S8D' },
    ],
  },
  {
    id: 'C12',
    code: 'C12',
    name: 'Servicios y conectividad',
    instruments: [{ instrumentCode: 'S8E' }],
  },
  {
    id: 'C13',
    code: 'C13',
    name: 'Comercialización y asociatividad',
    instruments: [{ instrumentCode: 'S9' }],
  },
  {
    id: 'C14',
    code: 'C14',
    name: 'Participación en el proyecto',
    instruments: [{ instrumentCode: 'S10' }],
  },
  {
    id: 'C15',
    code: 'C15',
    name: 'Adopción tecnológica e interés digital',
    tag: 'digital-demand',
    instruments: [
      { instrumentCode: 'S11-DB' },
      { instrumentCode: 'S11-INV' },
      { instrumentCode: 'S11-EXT' },
      { instrumentCode: 'S11-RES' },
      { instrumentCode: 'S_DCU' },
    ],
  },
];
