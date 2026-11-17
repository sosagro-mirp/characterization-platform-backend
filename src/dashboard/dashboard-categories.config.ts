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
 * Spec 66 — remapeo por sección (D12/D13, aprobado por el usuario el
 * 2026-11-11). Tras el spec 84 la mayoría de las respuestas vive en los
 * instrumentos nuevos (`S_REG`, `S_FINCA`, `S_AGRI`, `S_CULT`, `S6-GEN`,
 * `S7-GEN`) y en los dos de talleres de co-creación (`TALLER`, `TALLER-TAB`),
 * que se reparten por sección entre las categorías. Los instrumentos
 * inactivos con respuestas entran como fuente histórica. `S2`, `S3.4.1` y
 * `S11-RES` salieron del mapa: ya no existen en producción.
 */
export const DASHBOARD_CATEGORIES: DashboardCategoryConfig[] = [
  {
    id: 'C1',
    code: 'C1',
    name: 'Perfil del productor y la finca',
    instruments: [
      {
        instrumentCode: 'S_REG',
        sectionNames: ['Identificación', 'Finca y cultivo'],
      },
      {
        instrumentCode: 'S_FINCA',
        sectionNames: ['Tenencia', 'Tamaño y vivienda'],
      },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Identificación del encuestado', 'La unidad productiva'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Identificación del encuestado', 'La unidad productiva'],
      },
      {
        instrumentCode: 'S1a',
        sectionNames: ['Identificación del encuestado/propietario/productor'],
        historic: true,
      },
      { instrumentCode: 'S1b', historic: true },
    ],
  },
  {
    id: 'C2',
    code: 'C2',
    name: 'Ubicación y acceso',
    instruments: [
      { instrumentCode: 'S_REG', sectionNames: ['Ubicación'] },
      {
        instrumentCode: 'S_FINCA',
        sectionNames: ['Acceso desde el casco urbano'],
      },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Ubicación y acceso a la finca'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Ubicación y acceso a la finca'],
      },
      { instrumentCode: 'S13' },
      {
        instrumentCode: 'S1a',
        sectionNames: ['Ubicación', 'Acceso desde el Casco Urbano'],
        historic: true,
      },
    ],
  },
  {
    id: 'C3',
    code: 'C3',
    name: 'Cultivos y variedades',
    instruments: [
      { instrumentCode: 'S2.4' },
      { instrumentCode: 'S2.5' },
      { instrumentCode: 'S2.6' },
      { instrumentCode: 'S2.7' },
      { instrumentCode: 'S3B' },
      {
        instrumentCode: 'S_CULT',
        sectionNames: ['Sombra y cultivos asociados', 'Entorno del cultivo'],
      },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Cultivo — específico por cultivo'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Cultivo — específico por cultivo'],
      },
    ],
  },
  {
    id: 'C4',
    code: 'C4',
    name: 'Suelo, clima y fertilización',
    instruments: [
      { instrumentCode: 'S_FINCA', sectionNames: ['Suelo', 'Entorno y clima'] },
      { instrumentCode: 'S_CULT', sectionNames: ['Registros y fertilización'] },
      { instrumentCode: 'TALLER', sectionNames: ['Suelos y fertilización'] },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Suelos y fertilización'],
      },
      { instrumentCode: 'S3', historic: true },
    ],
  },
  {
    id: 'C5',
    code: 'C5',
    name: 'Sanidad vegetal',
    instruments: [
      { instrumentCode: 'S_CULT', sectionNames: ['Sanidad'] },
      { instrumentCode: 'S12', historic: true },
    ],
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
      { instrumentCode: 'S_FINCA', sectionNames: ['Certificaciones y normas'] },
      { instrumentCode: 'TALLER', sectionNames: ['Poscosecha y calidad'] },
      { instrumentCode: 'TALLER-TAB', sectionNames: ['Poscosecha y calidad'] },
    ],
  },
  {
    id: 'C7',
    code: 'C7',
    name: 'Energía y equipos',
    instruments: [
      { instrumentCode: 'S_FINCA', sectionNames: ['Equipos y tecnología'] },
      { instrumentCode: 'S4.5', historic: true },
    ],
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
      { instrumentCode: 'S6-GEN' },
      {
        instrumentCode: 'TALLER',
        sectionNames: [
          'Generación y manejo de residuos',
          'Interés en valorización de residuos',
        ],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: [
          'Generación y manejo de residuos',
          'Interés en valorización de residuos',
        ],
      },
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
      { instrumentCode: 'S7-GEN' },
      { instrumentCode: 'TALLER', sectionNames: ['Uso y manejo del agua'] },
      { instrumentCode: 'TALLER-TAB', sectionNames: ['Uso y manejo del agua'] },
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
    instruments: [
      { instrumentCode: 'S_FINCA', sectionNames: ['Servicios'] },
      {
        instrumentCode: 'TALLER',
        sectionNames: [
          'Servicios: energía y agua',
          'Conectividad y habilidades digitales',
        ],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: [
          'Servicios: energía y agua',
          'Conectividad y habilidades digitales',
        ],
      },
      { instrumentCode: 'S8E', historic: true },
    ],
  },
  {
    id: 'C12',
    code: 'C12',
    name: 'Comercialización y asociatividad',
    instruments: [
      {
        instrumentCode: 'S_AGRI',
        sectionNames: [
          'Participación en la cadena y comercialización',
          'Organizaciones y asistencia técnica',
        ],
      },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Cadena productiva y asociatividad'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Cadena productiva y asociatividad'],
      },
      { instrumentCode: 'S9', historic: true },
    ],
  },
  {
    id: 'C13',
    code: 'C13',
    name: 'Participación en el proyecto',
    instruments: [
      {
        instrumentCode: 'S_REG',
        sectionNames: ['Participación en el proyecto'],
      },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Interés y compromiso con el proyecto'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Interés y compromiso con el proyecto'],
      },
      { instrumentCode: 'S10', historic: true },
    ],
  },
  {
    id: 'C14',
    code: 'C14',
    name: 'Adopción tecnológica e interés digital',
    tag: 'digital-demand',
    instruments: [
      { instrumentCode: 'S11-EXT' },
      { instrumentCode: 'S_AGRI', sectionNames: ['Educación y uso digital'] },
      {
        instrumentCode: 'TALLER',
        sectionNames: ['Preguntas para extensionistas y técnicos'],
      },
      {
        instrumentCode: 'TALLER-TAB',
        sectionNames: ['Preguntas para extensionistas y técnicos'],
      },
      { instrumentCode: 'S11-DB', historic: true },
      { instrumentCode: 'S11-INV', historic: true },
      { instrumentCode: 'S_DCU', historic: true },
    ],
  },
];
