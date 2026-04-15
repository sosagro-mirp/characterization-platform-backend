import { EntityManager, In } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';

// ---------------------------------------------------------------------------
// Tipos internos del seed
// ---------------------------------------------------------------------------

interface OptionDef {
  text: string;
  value?: number;
}

interface QuestionDef {
  key: string;
  text: string;
  type: string;
  isRequired: boolean;
  order: number;
  conditionKey?: string;
  conditionValue?: string;
  options?: OptionDef[];
}

interface SectionDef {
  name: string;
  order: number;
  questions: QuestionDef[];
}

// ---------------------------------------------------------------------------
// Definición completa del instrumento
// ---------------------------------------------------------------------------

const INSTRUMENT_NAME = 'Diagnóstico inicial de unidades productoras de Cacao';
const INSTRUMENT_VERSION = 1;

const SECTIONS: SectionDef[] = [
  // -------------------------------------------------------------------------
  // Sección 1 — Información del contacto y ubicación
  // -------------------------------------------------------------------------
  {
    name: 'Información del contacto y ubicación',
    order: 1,
    questions: [
      {
        key: 'q01',
        text: 'Departamento',
        type: 'open_text',
        isRequired: true,
        order: 1,
      },
      {
        key: 'q02',
        text: 'Municipio',
        type: 'open_text',
        isRequired: true,
        order: 2,
      },
      {
        key: 'q03',
        text: 'Vereda',
        type: 'open_text',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q04',
        text: 'Nombre de la unidad productora (finca)',
        type: 'open_text',
        isRequired: true,
        order: 4,
      },
      {
        key: 'q05',
        text: 'Nombre del propietario',
        type: 'open_text',
        isRequired: true,
        order: 5,
      },
      {
        key: 'q06',
        text: 'Número de celular del propietario',
        type: 'open_text',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q07',
        text: 'Correo electrónico del propietario',
        type: 'open_text',
        isRequired: false,
        order: 7,
      },
      {
        key: 'q08',
        text: 'Nombre de la persona encargada del cultivo',
        type: 'open_text',
        isRequired: false,
        order: 8,
      },
      {
        key: 'q09',
        text: 'Número de celular de la persona encargada del cultivo',
        type: 'open_text',
        isRequired: false,
        order: 9,
      },
      {
        key: 'q11',
        text: 'Hectáreas del predio',
        type: 'numeric',
        isRequired: false,
        order: 10,
      },
      {
        key: 'q12',
        text: 'Hay vivienda(s) en la unidad productora (finca)',
        type: 'yes_no',
        isRequired: false,
        order: 11,
      },
      {
        key: 'q13',
        text: 'Cuántas viviendas hay en la unidad productora',
        type: 'numeric',
        isRequired: false,
        order: 12,
        conditionKey: 'q12',
        conditionValue: 'true',
      },
      {
        key: 'q14',
        text: 'Distancia de la finca al pueblo',
        type: 'open_text',
        isRequired: false,
        order: 13,
      },
      {
        key: 'q15',
        text: 'Coordenadas',
        type: 'open_text',
        isRequired: false,
        order: 14,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 2 — Información de la unidad productora y datos climáticos
  // -------------------------------------------------------------------------
  {
    name: 'Información de la unidad productora y datos climáticos',
    order: 2,
    questions: [
      {
        key: 'q16',
        text: 'Altitud',
        type: 'numeric',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q17',
        text: 'Relieve montañoso',
        type: 'yes_no',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q18',
        text: 'Planicie',
        type: 'yes_no',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q19',
        text: 'Llanura de inundación',
        type: 'yes_no',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q20',
        text: 'Terrenos húmedos',
        type: 'yes_no',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q21',
        text: 'Terrenos secos',
        type: 'yes_no',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q22',
        text: 'Erosión',
        type: 'yes_no',
        isRequired: false,
        order: 7,
      },
      {
        key: 'q23',
        text: 'Lluvia',
        type: 'yes_no',
        isRequired: false,
        order: 8,
      },
      {
        key: 'q24',
        text: 'Vientos fuertes',
        type: 'yes_no',
        isRequired: false,
        order: 9,
      },
      {
        key: 'q25',
        text: 'Nubosidad',
        type: 'yes_no',
        isRequired: false,
        order: 10,
      },
      {
        key: 'q26',
        text: 'Neblina',
        type: 'yes_no',
        isRequired: false,
        order: 11,
      },
      {
        key: 'q27',
        text: 'Temperatura',
        type: 'open_text',
        isRequired: false,
        order: 12,
      },
      {
        key: 'q28',
        text: 'Presión atmosférica',
        type: 'open_text',
        isRequired: false,
        order: 13,
      },
      {
        key: 'q29',
        text: 'Humedad relativa',
        type: 'open_text',
        isRequired: false,
        order: 14,
      },
      {
        key: 'q30',
        text: 'Fuentes de agua cerca',
        type: 'yes_no',
        isRequired: false,
        order: 15,
      },
      {
        key: 'q31',
        text: 'Cuántas fuentes de agua hay cerca',
        type: 'numeric',
        isRequired: false,
        order: 16,
        conditionKey: 'q30',
        conditionValue: 'true',
      },
      {
        key: 'q32',
        text: 'Campo con drenaje',
        type: 'yes_no',
        isRequired: false,
        order: 17,
      },
      {
        key: 'q33',
        text: 'Uso de tractores o máquinas pesadas',
        type: 'yes_no',
        isRequired: false,
        order: 18,
      },
      {
        key: 'q34',
        text: 'Uso de caballos',
        type: 'yes_no',
        isRequired: false,
        order: 19,
      },
      {
        key: 'q35',
        text: 'Obras de construcción',
        type: 'yes_no',
        isRequired: false,
        order: 20,
      },
      {
        key: 'q36',
        text: 'Qué tipo de actividad económica realizan en la zona aledaña (ganadera, el mismo cultivo, otros cultivos, fábricas, etc.)',
        type: 'open_text',
        isRequired: false,
        order: 21,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 3 — Suelo y factores asociados al cultivo
  // -------------------------------------------------------------------------
  {
    name: 'Suelo y factores asociados al cultivo',
    order: 3,
    questions: [
      {
        key: 'q37',
        text: 'Registro nacional del ICA (predio exportador, vivero, BPA, etc.)',
        type: 'open_text',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q38',
        text: 'Asociación cacaotera',
        type: 'yes_no',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q39',
        text: 'Hectáreas sembradas de cacao',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q40',
        text: 'La producción de cacao está en varios lotes',
        type: 'open_text',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q41',
        text: 'En cuántos lotes está la producción',
        type: 'open_text',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q42',
        text: 'Sombrío',
        type: 'yes_no',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q43',
        text: 'Clones sembrados en el cultivo (nombre el clon y porcentaje sembrado de cada uno)',
        type: 'open_text',
        isRequired: false,
        order: 7,
      },
      {
        key: 'q44',
        text: 'Especie vegetal de sombrío',
        type: 'open_text',
        isRequired: false,
        order: 8,
        conditionKey: 'q42',
        conditionValue: 'true',
      },
      {
        key: 'q45',
        text: 'Sombrío transitorio',
        type: 'yes_no',
        isRequired: false,
        order: 9,
      },
      {
        key: 'q45b',
        text: 'Qué porcentaje de sombrío transitorio está sembrado',
        type: 'numeric',
        isRequired: false,
        order: 10,
        conditionKey: 'q45',
        conditionValue: 'true',
      },
      {
        key: 'q46',
        text: 'Sombrío permanente',
        type: 'yes_no',
        isRequired: false,
        order: 11,
      },
      {
        key: 'q46b',
        text: 'Qué porcentaje de sombrío permanente está sembrado',
        type: 'numeric',
        isRequired: false,
        order: 12,
        conditionKey: 'q46',
        conditionValue: 'true',
      },
      {
        key: 'q47',
        text: 'Cultivo transitorio',
        type: 'yes_no',
        isRequired: false,
        order: 13,
      },
      {
        key: 'q47b',
        text: 'Cuál cultivo transitorio tiene y en qué porcentaje está sembrado',
        type: 'open_text',
        isRequired: false,
        order: 14,
        conditionKey: 'q47',
        conditionValue: 'true',
      },
      {
        key: 'q48',
        text: 'Vegetación alta',
        type: 'yes_no',
        isRequired: false,
        order: 15,
      },
      {
        key: 'q48b',
        text: 'Cuál cultivo (vegetación alta) tiene y en qué porcentaje está sembrado',
        type: 'open_text',
        isRequired: false,
        order: 16,
        conditionKey: 'q48',
        conditionValue: 'true',
      },
      {
        key: 'q49',
        text: 'Vegetación baja',
        type: 'yes_no',
        isRequired: false,
        order: 17,
      },
      {
        key: 'q49b',
        text: 'Cuál cultivo (vegetación baja) tiene y en qué porcentaje está sembrado',
        type: 'open_text',
        isRequired: false,
        order: 18,
        conditionKey: 'q49',
        conditionValue: 'true',
      },
      {
        key: 'q50',
        text: 'Pastizales',
        type: 'yes_no',
        isRequired: false,
        order: 19,
      },
      {
        key: 'q51',
        text: 'Otros cultivos',
        type: 'yes_no',
        isRequired: false,
        order: 20,
      },
      {
        key: 'q51b',
        text: 'Cuál otro cultivo tiene, en qué porcentaje está sembrado y cuál(es) están cercanos al cultivo de cacao',
        type: 'open_text',
        isRequired: false,
        order: 21,
        conditionKey: 'q51',
        conditionValue: 'true',
      },
      {
        key: 'q52',
        text: 'Tipo de suelo',
        type: 'open_text',
        isRequired: false,
        order: 22,
      },
      {
        key: 'q53',
        text: 'Fisicoquímico — reporte la cantidad del último estudio de suelo (metales pesados, pesticidas, fertilidad completa)',
        type: 'open_text',
        isRequired: false,
        order: 23,
      },
      {
        key: 'q54',
        text: 'Microbiológico — reporte la cantidad del último estudio de suelo',
        type: 'open_text',
        isRequired: false,
        order: 24,
      },
      {
        key: 'q55',
        text: 'pH — reporte la cantidad del último estudio de suelo',
        type: 'open_text',
        isRequired: false,
        order: 25,
      },
      {
        key: 'q56',
        text: 'Otros estudios de suelo',
        type: 'yes_no',
        isRequired: false,
        order: 26,
      },
      {
        key: 'q56b',
        text: 'Qué tipo de otros estudios de suelo tiene',
        type: 'open_text',
        isRequired: false,
        order: 27,
        conditionKey: 'q56',
        conditionValue: 'true',
      },
      {
        key: 'q57',
        text: 'Tipo de fertilización',
        type: 'single_choice',
        isRequired: false,
        order: 28,
        options: [
          { text: 'Química orgánica y química de síntesis' },
          { text: 'Química de síntesis' },
          { text: 'Orgánica' },
        ],
      },
      {
        key: 'q58',
        text: 'Fertilizante empleado (escanear la ficha técnica)',
        type: 'open_text',
        isRequired: false,
        order: 29,
      },
      {
        key: 'q59',
        text: 'Frecuencia con la que se fertiliza',
        type: 'open_text',
        isRequired: false,
        order: 30,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 4 — Árbol
  // -------------------------------------------------------------------------
  {
    name: 'Árbol',
    order: 4,
    questions: [
      {
        key: 'q60',
        text: 'Variedad (Pedigrí)',
        type: 'single_choice',
        isRequired: false,
        order: 1,
        options: [
          { text: 'Trinitario' },
          { text: 'Híbrido por trinitario' },
          { text: 'Criollo' },
          { text: 'Trinitario por Criollo' },
        ],
      },
      {
        key: 'q61',
        text: 'Clon',
        type: 'open_text',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q62',
        text: 'Altura del árbol (metros)',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q63',
        text: 'Diámetro copa del árbol (metros)',
        type: 'numeric',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q64',
        text: 'Edad del árbol (años)',
        type: 'numeric',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q65',
        text: 'Perímetro del tronco DAP (cm)',
        type: 'numeric',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q66',
        text: 'Hábito',
        type: 'single_choice',
        isRequired: false,
        order: 7,
        options: [{ text: 'Erecto' }, { text: 'Decumbente' }],
      },
      {
        key: 'q67',
        text: 'Vigor del árbol',
        type: 'single_choice',
        isRequired: false,
        order: 8,
        options: [
          { text: 'Vigoroso' },
          { text: 'Intermedio' },
          { text: 'Escaso' },
        ],
      },
      {
        key: 'q68',
        text: 'Follaje sin poda',
        type: 'single_choice',
        isRequired: false,
        order: 9,
        options: [{ text: 'Abundante' }, { text: 'Escaso' }],
      },
      {
        key: 'q69',
        text: 'Frecuencia de poda',
        type: 'open_text',
        isRequired: false,
        order: 10,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 5 — Hoja
  // -------------------------------------------------------------------------
  {
    name: 'Hoja',
    order: 5,
    questions: [
      {
        key: 'q69h',
        text: 'Color hojas jóvenes (carta pantone)',
        type: 'open_text',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q70',
        text: 'Longitud de la hoja',
        type: 'numeric',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q71',
        text: 'Ancho de la hoja',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q72',
        text: 'Longitud de la base al punto más ancho de la hoja',
        type: 'numeric',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q73',
        text: 'Forma de la hoja',
        type: 'single_choice',
        isRequired: false,
        order: 5,
        options: [
          { text: 'Ovada' },
          { text: 'Obovada' },
          { text: 'Acuñada' },
          { text: 'Apicuñada' },
          { text: 'Ovoide' },
          { text: 'Elíptico' },
        ],
      },
      {
        key: 'q74',
        text: 'Forma del ápice de la hoja',
        type: 'single_choice',
        isRequired: false,
        order: 6,
        options: [
          { text: 'Agudo' },
          { text: 'Acuminado corto' },
          { text: 'Acuminado largo' },
        ],
      },
      {
        key: 'q75',
        text: 'Forma de la base de la hoja',
        type: 'single_choice',
        isRequired: false,
        order: 7,
        options: [
          { text: 'Obtuso' },
          { text: 'Redondeado' },
          { text: 'Agudo' },
        ],
      },
      {
        key: 'q76',
        text: 'Color del brote terminal de la hoja',
        type: 'single_choice',
        isRequired: false,
        order: 8,
        options: [
          { text: 'Rojo intermedio' },
          { text: 'Rojo brillante' },
          { text: 'Rojo oscuro' },
          { text: 'Rojo claro' },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 6 — Fruto
  // -------------------------------------------------------------------------
  {
    name: 'Fruto',
    order: 6,
    questions: [
      {
        key: 'q77',
        text: 'Constricción basal del fruto',
        type: 'single_choice',
        isRequired: false,
        order: 1,
        options: [
          { text: 'Ausente' },
          { text: 'Ligera' },
          { text: 'Intermedia' },
          { text: 'Pronunciada' },
        ],
      },
      {
        key: 'q78',
        text: 'Grosor del lomo del fruto (mm)',
        type: 'numeric',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q79',
        text: 'Profundidad surco primario del fruto (mm)',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q80',
        text: 'Profundidad surco secundario del fruto (mm)',
        type: 'numeric',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q81',
        text: 'Grosor de cáscara (mm)',
        type: 'numeric',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q82',
        text: 'Frutos de un árbol por año',
        type: 'numeric',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q83',
        text: 'Color fruto inmaduro',
        type: 'single_choice',
        isRequired: false,
        order: 7,
        options: [{ text: 'Rojo' }, { text: 'Verde' }, { text: 'Morado' }],
      },
      {
        key: 'q84',
        text: 'Color fruto maduro',
        type: 'single_choice',
        isRequired: false,
        order: 8,
        options: [{ text: 'Rojo' }, { text: 'Amarillo' }, { text: 'Naranja' }],
      },
      {
        key: 'q85',
        text: 'Forma del fruto',
        type: 'single_choice',
        isRequired: false,
        order: 9,
        options: [
          { text: 'Angoleta' },
          { text: 'Cundeamor' },
          { text: 'Amelonado' },
          { text: 'Calabacillo' },
        ],
      },
      {
        key: 'q86',
        text: 'Forma del ápice del fruto',
        type: 'single_choice',
        isRequired: false,
        order: 10,
        options: [
          { text: 'Obtuso' },
          { text: 'Mamiforme' },
          { text: 'Agudo y atenuado' },
        ],
      },
      {
        key: 'q87',
        text: 'Rugosidad del fruto',
        type: 'single_choice',
        isRequired: false,
        order: 11,
        options: [
          { text: 'Intermedia' },
          { text: 'Ligera' },
          { text: 'Intensa' },
        ],
      },
      {
        key: 'q88',
        text: 'Longitud del fruto',
        type: 'open_text',
        isRequired: false,
        order: 12,
      },
      {
        key: 'q89',
        text: 'Diámetro del fruto',
        type: 'open_text',
        isRequired: false,
        order: 13,
      },
      {
        key: 'q90',
        text: 'Rendimiento (Kg/Ha/año)',
        type: 'open_text',
        isRequired: false,
        order: 14,
      },
      {
        key: 'q91',
        text: 'Tamaño de la mazorca — reporte promedio por clon (ej. CCN51, ICS-40, FEC-2)',
        type: 'open_text',
        isRequired: false,
        order: 15,
      },
      {
        key: 'q92',
        text: 'Número de mazorcas sanas — reporte promedio por clon',
        type: 'open_text',
        isRequired: false,
        order: 16,
      },
      {
        key: 'q93',
        text: 'Peso de mazorca — reporte promedio por clon',
        type: 'open_text',
        isRequired: false,
        order: 17,
      },
      {
        key: 'q94',
        text: 'Índice de Mazorca (IM) — reporte promedio por clon (ej. CCN51 IM: 12, ICS-40 IM: 14)',
        type: 'open_text',
        isRequired: false,
        order: 18,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 7 — Semilla
  // -------------------------------------------------------------------------
  {
    name: 'Semilla',
    order: 7,
    questions: [
      {
        key: 'q95',
        text: 'Color de la semilla',
        type: 'single_choice',
        isRequired: false,
        order: 1,
        options: [{ text: 'Violeta' }, { text: 'Morado' }, { text: 'Blanco' }],
      },
      {
        key: 'q96',
        text: 'Peso húmedo de la semilla',
        type: 'numeric',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q97',
        text: 'Longitud de la semilla',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q98',
        text: 'Diámetro de la semilla',
        type: 'numeric',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q99',
        text: 'Grosor de la semilla',
        type: 'numeric',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q100',
        text: '% de cascarilla',
        type: 'numeric',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q101',
        text: 'Tamaño del grano',
        type: 'open_text',
        isRequired: false,
        order: 7,
      },
      {
        key: 'q102',
        text: 'Índice de Grano (IG) — reporte promedio por clon (ej. CCN51 IG: 1.6, ICS-40 IG: 1.4)',
        type: 'open_text',
        isRequired: false,
        order: 8,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 8 — Flor
  // -------------------------------------------------------------------------
  {
    name: 'Flor',
    order: 8,
    questions: [
      {
        key: 'q103',
        text: 'Longitud del estaminodio',
        type: 'numeric',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q104',
        text: 'Longitud del ovario de la flor',
        type: 'numeric',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q105',
        text: 'Longitud del estilo de la flor',
        type: 'numeric',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q106',
        text: 'Número de óvulos por ovario',
        type: 'numeric',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q107',
        text: 'Color de la flor',
        type: 'single_choice',
        isRequired: false,
        order: 5,
        options: [
          { text: 'Rosado' },
          { text: 'Verde ligero' },
          { text: 'Blanco' },
          { text: 'Rojo' },
        ],
      },
      {
        key: 'q108',
        text: 'Antocianina en sépalos de la flor',
        type: 'single_choice',
        isRequired: false,
        order: 6,
        options: [
          { text: 'Ligera' },
          { text: 'Intensa' },
          { text: 'Intermedia' },
          { text: 'Ausente' },
        ],
      },
      {
        key: 'q109',
        text: 'Color del pedúnculo de la flor',
        type: 'single_choice',
        isRequired: false,
        order: 7,
        options: [
          { text: 'Rojizo' },
          { text: 'Verde rojizo' },
          { text: 'Verde' },
        ],
      },
      {
        key: 'q110',
        text: 'Antocianina en el limbo del pétalo de la flor',
        type: 'single_choice',
        isRequired: false,
        order: 8,
        options: [{ text: 'Ausente' }, { text: 'Presente' }],
      },
      {
        key: 'q111',
        text: 'Tipo de floración',
        type: 'single_choice',
        isRequired: false,
        order: 9,
        options: [{ text: 'Discontinua' }, { text: 'Continua' }],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 9 — Enfermedades y plagas
  // -------------------------------------------------------------------------
  {
    name: 'Enfermedades y plagas',
    order: 9,
    questions: [
      {
        key: 'q112',
        text: 'Susceptibilidad a la escoba de bruja',
        type: 'yes_no',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q113',
        text: 'Susceptibilidad a la Fitoftoria',
        type: 'yes_no',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q114',
        text: 'Susceptibilidad al Mal rosado',
        type: 'yes_no',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q115',
        text: 'Susceptibilidad a la monilia',
        type: 'yes_no',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q116',
        text: 'Reacción a monilia',
        type: 'single_choice',
        isRequired: false,
        order: 5,
        options: [{ text: 'MS' }, { text: 'MR' }, { text: 'R' }, { text: 'S' }],
      },
      {
        key: 'q117',
        text: 'Tipo de control de enfermedades',
        type: 'single_choice',
        isRequired: false,
        order: 6,
        options: [{ text: 'Manual' }, { text: 'Manual y química de síntesis' }],
      },
      {
        key: 'q118',
        text: 'Tipo de control de plagas',
        type: 'single_choice',
        isRequired: false,
        order: 7,
        options: [
          { text: 'Manual' },
          { text: 'Química de síntesis' },
          { text: 'Manual y química de síntesis' },
        ],
      },
      {
        key: 'q119',
        text: 'Tipo de plagas',
        type: 'open_text',
        isRequired: false,
        order: 8,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 10 — Proceso poscosecha — Fermentación
  // -------------------------------------------------------------------------
  {
    name: 'Proceso poscosecha — Fermentación',
    order: 10,
    questions: [
      {
        key: 'q120',
        text: 'Fermentación',
        type: 'yes_no',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q121',
        text: 'En qué se fermenta',
        type: 'open_text',
        isRequired: false,
        order: 2,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q122',
        text: 'Los clones se mezclan o son individuales',
        type: 'yes_no',
        isRequired: false,
        order: 3,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q123',
        text: 'Los clones en fermentación',
        type: 'open_text',
        isRequired: false,
        order: 4,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q124',
        text: 'Duración promedio de la fermentación',
        type: 'single_choice',
        isRequired: false,
        order: 5,
        conditionKey: 'q120',
        conditionValue: 'true',
        options: [{ text: 'Buena' }, { text: 'Regular' }, { text: 'Mala' }],
      },
      {
        key: 'q125',
        text: 'Características del grano para saber que está bien fermentado',
        type: 'open_text',
        isRequired: false,
        order: 6,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q126',
        text: 'Mediciones realizadas durante la fermentación',
        type: 'open_text',
        isRequired: false,
        order: 7,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q127',
        text: 'Análisis de control de calidad realizados en la finca al cacao final fermentado',
        type: 'open_text',
        isRequired: false,
        order: 8,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q128',
        text: 'Análisis de control de calidad al cacao final fermentado que manda hacer',
        type: 'open_text',
        isRequired: false,
        order: 9,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
      {
        key: 'q129',
        text: 'Calidad sensorial de la fermentación',
        type: 'single_choice',
        isRequired: false,
        order: 10,
        conditionKey: 'q120',
        conditionValue: 'true',
        options: [{ text: 'Buena' }, { text: 'Regular' }, { text: 'Mala' }],
      },
      {
        key: 'q130',
        text: 'Comercialización del grano fermentado',
        type: 'open_text',
        isRequired: false,
        order: 11,
        conditionKey: 'q120',
        conditionValue: 'true',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 11 — Proceso poscosecha — Secado
  // -------------------------------------------------------------------------
  {
    name: 'Proceso poscosecha — Secado',
    order: 11,
    questions: [
      {
        key: 'q131',
        text: 'Secado',
        type: 'yes_no',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q132',
        text: 'En qué seca',
        type: 'open_text',
        isRequired: false,
        order: 2,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q133',
        text: 'Realiza volteos',
        type: 'yes_no',
        isRequired: false,
        order: 3,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q134',
        text: 'Frecuencia de volteos',
        type: 'open_text',
        isRequired: false,
        order: 4,
        conditionKey: 'q133',
        conditionValue: 'true',
      },
      {
        key: 'q135',
        text: 'Duración promedio del secado',
        type: 'open_text',
        isRequired: false,
        order: 5,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q136',
        text: 'Características del grano para saber que está bien seco',
        type: 'open_text',
        isRequired: false,
        order: 6,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q137',
        text: 'Mediciones realizadas durante el secado',
        type: 'open_text',
        isRequired: false,
        order: 7,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q138',
        text: 'Análisis de control de calidad realizados en la finca al cacao final seco',
        type: 'open_text',
        isRequired: false,
        order: 8,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q139',
        text: 'Análisis de control de calidad al cacao final seco que manda hacer',
        type: 'open_text',
        isRequired: false,
        order: 9,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q140',
        text: 'Calidad sensorial del secado',
        type: 'open_text',
        isRequired: false,
        order: 10,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
      {
        key: 'q141',
        text: 'Comercialización del grano seco',
        type: 'open_text',
        isRequired: false,
        order: 11,
        conditionKey: 'q131',
        conditionValue: 'true',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Sección 12 — Residuos y biomasa
  // -------------------------------------------------------------------------
  {
    name: 'Residuos y biomasa',
    order: 12,
    questions: [
      {
        key: 'q142',
        text: 'Tipos de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 1,
      },
      {
        key: 'q143',
        text: 'Cantidad de biomasa/residuo por tipo',
        type: 'open_text',
        isRequired: false,
        order: 2,
      },
      {
        key: 'q144',
        text: 'Disposición por tipo de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 3,
      },
      {
        key: 'q145',
        text: 'Tratamiento antes de la disposición por tipo de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 4,
      },
      {
        key: 'q146',
        text: 'Valorización por tipo de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 5,
      },
      {
        key: 'q147',
        text: 'Tipo de valorización por tipo de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 6,
      },
      {
        key: 'q148',
        text: 'Efectos negativos generados por los residuos por tipo de biomasa/residuo',
        type: 'open_text',
        isRequired: false,
        order: 7,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Función principal del seed
// ---------------------------------------------------------------------------

export async function seedCacaoInstrument(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const questionRepo = manager.getRepository(Question);
  const typeRepo = manager.getRepository(TypeOfQuestion);
  const optionRepo = manager.getRepository(OptionQuestion);
  const actorTypeRepo = manager.getRepository(ActorType);

  // 1. Idempotencia: abortar si el instrumento ya existe
  const existing = await instrumentRepo.findOne({
    where: { name: INSTRUMENT_NAME, version: INSTRUMENT_VERSION },
  });

  if (existing) {
    console.log(
      `[seed] El instrumento "${INSTRUMENT_NAME}" v${INSTRUMENT_VERSION} ya existe. Se omite el seed.`,
    );
    return;
  }

  // 2. Cargar tipos de pregunta en un mapa { name → TypeOfQuestion }
  const allTypes = await typeRepo.find();
  const typeMap = new Map<string, TypeOfQuestion>(
    allTypes.map((t) => [t.name, t]),
  );

  const requiredTypes = [
    'open_text',
    'numeric',
    'yes_no',
    'single-choice',
    'multiple_choice',
    'likert',
  ];
  for (const typeName of requiredTypes) {
    if (!typeMap.has(typeName)) {
      console.warn(
        `[seed] Advertencia: el tipo de pregunta "${typeName}" no existe en la base de datos.`,
      );
    }
  }

  // 3. Cargar tipos de actor
  const actorTypes = await actorTypeRepo.find({
    where: { name: In(['extensionista', 'productor']) },
  });

  // 4. Crear el instrumento
  const instrument = instrumentRepo.create({
    name: INSTRUMENT_NAME,
    version: INSTRUMENT_VERSION,
    publishDate: '2025-01-01',
    isActive: true,
    actorTypes,
  });
  await instrumentRepo.save(instrument);
  console.log(`[seed] Instrumento creado: ${instrument.instrumentId}`);

  // Mapa clave → Question para resolver condiciones en tiempo de creación
  const questionMap = new Map<string, Question>();

  // 4. Crear secciones y preguntas en orden
  for (const sectionDef of SECTIONS) {
    const section = sectionRepo.create({
      name: sectionDef.name,
      order: sectionDef.order,
      instrument,
    });
    await sectionRepo.save(section);
    console.log(`[seed]   Sección ${sectionDef.order}: ${sectionDef.name}`);

    for (const qDef of sectionDef.questions) {
      const type = typeMap.get(qDef.type);
      if (!type) {
        throw new Error(
          `[seed] Tipo de pregunta no encontrado: "${qDef.type}" (pregunta key: ${qDef.key})`,
        );
      }

      // Resolver conditionQuestion si aplica
      let conditionQuestion: Question | undefined;
      if (qDef.conditionKey) {
        conditionQuestion = questionMap.get(qDef.conditionKey);
        if (!conditionQuestion) {
          throw new Error(
            `[seed] conditionKey "${qDef.conditionKey}" no encontrado al crear pregunta "${qDef.key}". ` +
              `Asegúrese de que las preguntas estén en orden correcto.`,
          );
        }
      }

      const question = questionRepo.create({
        text: qDef.text,
        type,
        isRequired: qDef.isRequired,
        order: qDef.order,
        section,
        conditionQuestion,
        conditionValue: qDef.conditionValue,
      });
      await questionRepo.save(question);
      questionMap.set(qDef.key, question);

      // 5. Crear opciones si las hay
      if (qDef.options && qDef.options.length > 0) {
        const options = optionRepo.create(
          qDef.options.map((o) => ({
            text: o.text,
            value: o.value,
            isOther: false,
            question,
          })),
        );
        await optionRepo.save(options);
      }
    }
  }

  const totalQuestions = SECTIONS.reduce(
    (sum, s) => sum + s.questions.length,
    0,
  );
  console.log(
    `[seed] Completado: ${SECTIONS.length} secciones, ${totalQuestions} preguntas creadas.`,
  );
}
