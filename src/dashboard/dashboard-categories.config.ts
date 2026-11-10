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
  /**
   * Spec 84 — fuente histórica: se incluye aunque el instrumento esté
   * inactivo (`isActive: false`). Pensado para S1a/S1b una vez que se
   * desactiven al promover el instrumento de Registro (`S_REG`) en H1/H8 del
   * spec 83: sus respuestas ya existentes no deben desaparecer de C1-C3 solo
   * porque el instrumento dejó de aplicarse en campo. Una fuente sin esta
   * marca (el caso normal, incluido `S_REG`) solo cuenta mientras esté activa.
   */
  historic?: boolean;
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
    // Spec 66 (Fase 3, D7, 2026-08-10): fusión de "Perfil del productor"
    // (antes C1) y "La finca" (antes C3) en una sola categoría, a pedido
    // del usuario — ver D7 para la justificación y la renumeración en
    // cascada de las categorías siguientes (C4→C3 … C15→C14).
    name: 'Perfil del productor y la finca',
    instruments: [
      {
        instrumentCode: 'S1a',
        sectionNames: ['Identificación del encuestado/propietario/productor'],
        historic: true,
      },
      // Spec 66 (D7): S1b entra completo por la fusión con «La finca». Desde
      // el spec 84 está inactivo, así que va como fuente histórica.
      { instrumentCode: 'S1b', historic: true },
      // Spec 84 — instrumento de Registro (S_REG), Fase 8: nace con una
      // sección llamada exactamente "Identificación" para esta categoría.
      { instrumentCode: 'S_REG', sectionNames: ['Identificación'] },
      // Spec 84 — Fase 8: sección "Finca y cultivo" del Registro (nombre de
      // la finca y cultivo principal), que antes iba en «La finca» (C3).
      // DEBT: spec 66 — revalidar esta fuente en la Fase 1 (inventario).
      { instrumentCode: 'S_REG', sectionNames: ['Finca y cultivo'] },
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
        historic: true,
      },
      { instrumentCode: 'S13' },
      // Spec 84 — Fase 8: sección "Ubicación" del Registro (departamento,
      // municipio, vereda, corregimiento).
      { instrumentCode: 'S_REG', sectionNames: ['Ubicación'] },
    ],
  },
  {
    id: 'C3',
    code: 'C3',
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
    id: 'C4',
    code: 'C4',
    name: 'Suelo, clima y fertilización',
    instruments: [{ instrumentCode: 'S3' }],
  },
  {
    id: 'C5',
    code: 'C5',
    name: 'Sanidad vegetal',
    instruments: [{ instrumentCode: 'S3.4.1' }, { instrumentCode: 'S12' }],
  },
  {
    id: 'C6',
    code: 'C6',
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
    id: 'C7',
    code: 'C7',
    name: 'Energía y equipos',
    instruments: [{ instrumentCode: 'S4.5' }],
  },
  {
    id: 'C8',
    code: 'C8',
    name: 'Residuos y valorización',
    instruments: [
      { instrumentCode: 'S6A' },
      { instrumentCode: 'S6B' },
      { instrumentCode: 'S6C' },
      { instrumentCode: 'S6D' },
    ],
  },
  {
    id: 'C9',
    code: 'C9',
    name: 'Agua',
    instruments: [
      { instrumentCode: 'S7A' },
      { instrumentCode: 'S7B' },
      { instrumentCode: 'S7C' },
    ],
  },
  {
    id: 'C10',
    code: 'C10',
    name: 'Infraestructura productiva',
    instruments: [
      { instrumentCode: 'S8A' },
      { instrumentCode: 'S8B' },
      { instrumentCode: 'S8C' },
      { instrumentCode: 'S8D' },
    ],
  },
  {
    id: 'C11',
    code: 'C11',
    name: 'Servicios y conectividad',
    instruments: [{ instrumentCode: 'S8E' }],
  },
  {
    id: 'C12',
    code: 'C12',
    name: 'Comercialización y asociatividad',
    instruments: [{ instrumentCode: 'S9' }],
  },
  {
    id: 'C13',
    code: 'C13',
    name: 'Participación en el proyecto',
    instruments: [{ instrumentCode: 'S10' }],
  },
  {
    id: 'C14',
    code: 'C14',
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
