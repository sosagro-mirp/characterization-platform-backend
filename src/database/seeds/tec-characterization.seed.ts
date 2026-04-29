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
  isOther?: boolean;
}

interface QuestionDef {
  key: string;
  text: string;
  type: string;
  isRequired: boolean;
  order: number;
  options?: OptionDef[];
}

interface SectionDef {
  name: string;
  order: number;
  questions: QuestionDef[];
}

interface InstrumentDef {
  name: string;
  version: number;
  sections: SectionDef[];
}

// ---------------------------------------------------------------------------
// Opciones likert reutilizables
// ---------------------------------------------------------------------------

const LIKERT_5: OptionDef[] = [
  { text: 'Totalmente en desacuerdo', value: 1 },
  { text: 'En desacuerdo', value: 2 },
  { text: 'Ni de acuerdo, ni en desacuerdo', value: 3 },
  { text: 'De acuerdo', value: 4 },
  { text: 'Totalmente de acuerdo', value: 5 },
];

// ---------------------------------------------------------------------------
// Definición de los 4 instrumentos
// ---------------------------------------------------------------------------

const INSTRUMENTS: InstrumentDef[] = [
  // =========================================================================
  // Instrumento 1 — Perfil del productor
  // Cubre: información personal, hogar y dependencia económica del productor.
  // =========================================================================
  {
    name: 'Caracterización tecnológica — Perfil del productor',
    version: 1,
    sections: [
      {
        name: 'Información del contacto y ubicación',
        order: 1,
        questions: [
          {
            key: 'tp1_ub_q01',
            text: 'Departamento',
            type: 'open_text',
            isRequired: true,
            order: 1,
          },
          {
            key: 'tp1_ub_q02',
            text: 'Municipio',
            type: 'open_text',
            isRequired: true,
            order: 2,
          },
          {
            key: 'tp1_ub_q03',
            text: 'Vereda',
            type: 'open_text',
            isRequired: false,
            order: 3,
          },
          {
            key: 'tp1_ub_q04',
            text: 'Nombre de la unidad productora (finca)',
            type: 'open_text',
            isRequired: true,
            order: 4,
          },
          {
            key: 'tp1_ub_q05',
            text: 'Nombre del propietario',
            type: 'open_text',
            isRequired: true,
            order: 5,
          },
          {
            key: 'tp1_ub_q06',
            text: 'Número de celular del propietario',
            type: 'open_text',
            isRequired: false,
            order: 6,
          },
          {
            key: 'tp1_ub_q07',
            text: 'Correo electrónico del propietario',
            type: 'open_text',
            isRequired: false,
            order: 7,
          },
          {
            key: 'tp1_ub_q08',
            text: 'Nombre de la persona encargada del cultivo',
            type: 'open_text',
            isRequired: false,
            order: 8,
          },
          {
            key: 'tp1_ub_q09',
            text: 'Número de celular de la persona encargada del cultivo',
            type: 'open_text',
            isRequired: false,
            order: 9,
          },
          {
            key: 'tp1_ub_q10',
            text: 'Hectáreas del predio',
            type: 'numeric',
            isRequired: false,
            order: 10,
          },
          {
            key: 'tp1_ub_q11',
            text: 'Hay vivienda(s) en la unidad productora (finca)',
            type: 'yes_no',
            isRequired: false,
            order: 11,
          },
          {
            key: 'tp1_ub_q12',
            text: 'Cuántas viviendas hay en la unidad productora',
            type: 'numeric',
            isRequired: false,
            order: 12,
          },
          {
            key: 'tp1_ub_q13',
            text: 'Distancia de la finca al pueblo',
            type: 'open_text',
            isRequired: false,
            order: 13,
          },
          {
            key: 'tp1_ub_q14',
            text: 'Coordenadas',
            type: 'open_text',
            isRequired: false,
            order: 14,
          },
        ],
      },
      {
        name: 'Información general del productor',
        order: 2,
        questions: [
          {
            key: 'tp1_q1',
            text: '¿Cuál es la edad del productor?',
            type: 'numeric',
            isRequired: true,
            order: 1,
          },
          {
            key: 'tp1_q2',
            text: '¿Cuál es el género del productor?',
            type: 'single_choice',
            isRequired: true,
            order: 2,
            options: [
              { text: 'Hombre' },
              { text: 'Mujer' },
              { text: 'Prefiere no responder' },
            ],
          },
          {
            key: 'tp1_q3',
            text: '¿Cuál es el nivel educativo del productor?',
            type: 'single_choice',
            isRequired: false,
            order: 3,
            options: [
              { text: 'Sin escolaridad' },
              { text: 'Primaria' },
              { text: 'Secundaria' },
              { text: 'Técnica' },
              { text: 'Universitaria' },
            ],
          },
          {
            key: 'tp1_q4',
            text: '¿Cuántos años lleva practicando la actividad productiva?',
            type: 'numeric',
            isRequired: false,
            order: 4,
          },
        ],
      },
      {
        name: 'Características del hogar',
        order: 3,
        questions: [
          {
            key: 'tp1_q5',
            text: '¿Cuántas personas conforman el hogar?',
            type: 'numeric',
            isRequired: false,
            order: 1,
          },
          {
            key: 'tp1_q6',
            text: '¿La actividad agrícola es la principal fuente de ingresos?',
            type: 'yes_no',
            isRequired: false,
            order: 2,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // Instrumento 2 — Finca y capital social
  // Cubre: tenencia de la tierra, cultivos principales y vínculos
  // institucionales del productor.
  // =========================================================================
  {
    name: 'Caracterización tecnológica — Finca y capital social',
    version: 1,
    sections: [
      {
        name: 'Características productivas de la finca',
        order: 1,
        questions: [
          {
            key: 'tp2_q1',
            text: '¿Cuál es la forma de tenencia de la tierra en la que desarrolla su actividad productiva?',
            type: 'single_choice',
            isRequired: false,
            order: 1,
            options: [
              { text: 'Propietario(a) con título formal' },
              { text: 'Propietario(a) sin título formal' },
              { text: 'Arrendatario(a)' },
              { text: 'Aparcero(a) / Mediería' },
              { text: 'Comodato / Préstamo' },
              { text: 'Tierra colectiva (resguardo, comunidad, asociación)' },
              { text: 'Otro', isOther: true },
            ],
          },
          {
            key: 'tp2_q2',
            text: '¿Cuáles son los principales cultivos con los que trabaja?',
            type: 'multiple_choice',
            isRequired: false,
            order: 2,
            options: [
              { text: 'Café' },
              { text: 'Cacao' },
              { text: 'Cannabis' },
              { text: 'Cáñamo' },
              { text: 'Otro', isOther: true },
            ],
          },
        ],
      },
      {
        name: 'Capital social e institucional',
        order: 2,
        questions: [
          {
            key: 'tp2_q3',
            text: '¿Pertenece a alguna asociación, cooperativa o gremio?',
            type: 'yes_no',
            isRequired: false,
            order: 1,
          },
          {
            key: 'tp2_q4',
            text: '¿Recibe asistencia técnica o extensión agrícola?',
            type: 'single_choice',
            isRequired: false,
            order: 2,
            options: [
              { text: 'Nunca' },
              { text: 'Ocasional' },
              { text: 'Frecuente' },
            ],
          },
          {
            key: 'tp2_q5',
            text: '¿Ha participado en capacitaciones en los últimos 2 años?',
            type: 'yes_no',
            isRequired: false,
            order: 3,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // Instrumento 3 — Infraestructura digital
  // Cubre: tipo de conexión, calidad de señal, dispositivos disponibles
  // y estabilidad eléctrica. Informa el diseño técnico de la aplicación
  // (sincronización asincrónica, canal de despliegue, almacenamiento local).
  // =========================================================================
  {
    name: 'Caracterización tecnológica — Infraestructura digital',
    version: 1,
    sections: [
      {
        name: 'Infraestructura y conectividad',
        order: 1,
        questions: [
          {
            key: 'tp3_q1',
            text: '¿Cuenta con acceso a internet?',
            type: 'single_choice',
            isRequired: false,
            order: 1,
            options: [
              { text: 'No' },
              { text: 'Datos móviles' },
              { text: 'WiFi fijo' },
            ],
          },
          {
            key: 'tp3_q2',
            text: '¿Qué tal es la señal móvil en la finca?',
            type: 'likert',
            isRequired: false,
            order: 2,
            options: [
              { text: 'Mala', value: 1 },
              { text: 'Regular', value: 2 },
              { text: 'Buena', value: 3 },
            ],
          },
          {
            key: 'tp3_q3',
            text: '¿Utiliza algunos de estos dispositivos?',
            type: 'multiple_choice',
            isRequired: false,
            order: 3,
            options: [
              { text: 'Smartphone' },
              { text: 'Tablet' },
              { text: 'Computador' },
              { text: 'No utilizo ninguno de estos dispositivos' },
            ],
          },
          {
            key: 'tp3_q4',
            text: '¿Posee conexión a la red eléctrica estable?',
            type: 'yes_no',
            isRequired: false,
            order: 4,
          },
        ],
      },
    ],
  },

  // =========================================================================
  // Instrumento 4 — Adopción tecnológica
  // Cubre: tecnologías en uso, alfabetización digital, percepciones
  // (utilidad, riesgo, innovación), barreras y requerimientos funcionales.
  // =========================================================================
  {
    name: 'Caracterización tecnológica — Adopción tecnológica',
    version: 1,
    sections: [
      {
        name: 'Uso actual de tecnologías',
        order: 1,
        questions: [
          {
            key: 'tp4_q1',
            text: '¿Utiliza alguna de las siguientes tecnologías en su actividad productiva?',
            type: 'multiple_choice',
            isRequired: false,
            order: 1,
            options: [
              { text: 'Fertilización técnica' },
              { text: 'Riego tecnificado' },
              { text: 'Software de contabilidad' },
              { text: 'Aplicaciones móviles agrícolas' },
              { text: 'Sensores o IoT' },
              { text: 'Ninguna' },
              { text: 'Otra', isOther: true },
            ],
          },
          {
            key: 'tp4_q2',
            text: '¿Utiliza alguna de las siguientes tecnologías de software?',
            type: 'multiple_choice',
            isRequired: false,
            order: 2,
            options: [
              { text: 'WhatsApp' },
              { text: 'Instagram' },
              { text: 'ChatGPT' },
              { text: 'Facebook' },
              { text: 'Youtube' },
              { text: 'Google' },
            ],
          },
          // Alfabetización digital (I18)
          {
            key: 'tp4_q3',
            text: 'Alfabetización digital — Me siento cómodo(a) utilizando aplicaciones móviles',
            type: 'likert',
            isRequired: false,
            order: 3,
            options: LIKERT_5,
          },
          {
            key: 'tp4_q4',
            text: 'Alfabetización digital — Uso internet regularmente para actividades productivas',
            type: 'likert',
            isRequired: false,
            order: 4,
            options: LIKERT_5,
          },
          // Percepción de Utilidad (I19)
          {
            key: 'tp4_q5',
            text: 'Percepción de utilidad — La tecnología me ayuda a tomar mejores decisiones',
            type: 'likert',
            isRequired: false,
            order: 5,
            options: LIKERT_5,
          },
          {
            key: 'tp4_q6',
            text: 'Percepción de utilidad — La tecnología aumenta mis ingresos potenciales',
            type: 'likert',
            isRequired: false,
            order: 6,
            options: LIKERT_5,
          },
          // Percepción de Riesgo (I20)
          {
            key: 'tp4_q7',
            text: 'Percepción de riesgo — Considero que la tecnología puede fallar fácilmente',
            type: 'likert',
            isRequired: false,
            order: 7,
            options: LIKERT_5,
          },
          {
            key: 'tp4_q8',
            text: 'Percepción de riesgo — Temo perder dinero al invertir en tecnología',
            type: 'likert',
            isRequired: false,
            order: 8,
            options: LIKERT_5,
          },
          // Actitud hacia la Innovación (I21)
          {
            key: 'tp4_q9',
            text: 'Actitud hacia la innovación — Me gusta probar nuevas tecnologías',
            type: 'likert',
            isRequired: false,
            order: 9,
            options: LIKERT_5,
          },
          {
            key: 'tp4_q10',
            text: 'Actitud hacia la innovación — Estoy dispuesto(a) a cambiar mis métodos tradicionales',
            type: 'likert',
            isRequired: false,
            order: 10,
            options: LIKERT_5,
          },
        ],
      },
      {
        name: 'Barreras percibidas',
        order: 2,
        questions: [
          {
            key: 'tp4_q11',
            text: '¿Cuáles considera usted son las principales barreras para adoptar tecnologías digitales?',
            type: 'multiple_choice',
            isRequired: false,
            order: 1,
            options: [
              { text: 'Falta de dinero' },
              { text: 'Falta de conocimiento' },
              { text: 'Falta de confianza' },
              { text: 'Mala conectividad' },
              { text: 'No lo considero necesario' },
              { text: 'Otro', isOther: true },
            ],
          },
        ],
      },
      {
        name: 'Requerimientos específicos para el software',
        order: 3,
        questions: [
          {
            key: 'tp4_q12',
            text: '¿Qué le gustaría que una herramienta digital le ayudara a gestionar?',
            type: 'multiple_choice',
            isRequired: false,
            order: 1,
            options: [
              {
                text: 'Registro y control de producción (cultivos o animales)',
              },
              { text: 'Gestión de costos, ingresos y rentabilidad' },
              { text: 'Control sanitario y manejo de plagas/enfermedades' },
              { text: 'Información climática y alertas tempranas' },
              { text: 'Comercialización y consulta de precios de mercado' },
              { text: 'Acceso a crédito y servicios financieros' },
              {
                text: 'Monitoreo mediante sensores (suelo, clima, producción)',
              },
              {
                text: 'Automatización de procesos (riego, alimentación, control ambiental)',
              },
              {
                text: 'Recomendaciones inteligentes basadas en datos (fertilización, riego, manejo productivo)',
              },
              { text: 'Predicción y análisis de rendimiento o ganancias' },
            ],
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Función principal del seed
// ---------------------------------------------------------------------------

export async function seedTecCharacterization(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const questionRepo = manager.getRepository(Question);
  const typeRepo = manager.getRepository(TypeOfQuestion);
  const optionRepo = manager.getRepository(OptionQuestion);
  const actorTypeRepo = manager.getRepository(ActorType);

  // Cargar los tres tipos de actor (aplican a todos los instrumentos de caracterización)
  const allActorTypes = await actorTypeRepo.find({
    where: { name: In(['propietario', 'extensionista', 'productor']) },
  });

  // Cargar tipos de pregunta en un mapa { name → TypeOfQuestion }
  const allTypes = await typeRepo.find();
  const typeMap = new Map<string, TypeOfQuestion>(
    allTypes.map((t) => [t.name, t]),
  );

  for (const instrDef of INSTRUMENTS) {
    // Idempotencia: omitir si ya existe
    const existing = await instrumentRepo.findOne({
      where: { name: instrDef.name, version: instrDef.version },
    });

    if (existing) {
      console.log(
        `[seed] "${instrDef.name}" v${instrDef.version} ya existe. Se omite.`,
      );
      continue;
    }

    // Crear instrumento
    const instrument = instrumentRepo.create({
      name: instrDef.name,
      version: instrDef.version,
      publishDate: '2025-01-01',
      isActive: true,
      actorTypes: allActorTypes,
    });
    await instrumentRepo.save(instrument);
    console.log(`[seed] Instrumento creado: ${instrDef.name}`);

    for (const sectionDef of instrDef.sections) {
      const section = sectionRepo.create({
        name: sectionDef.name,
        order: sectionDef.order,
        instrument,
      });
      await sectionRepo.save(section);

      for (const qDef of sectionDef.questions) {
        const type = typeMap.get(qDef.type);
        if (!type) {
          throw new Error(
            `[seed] Tipo de pregunta no encontrado: "${qDef.type}" (key: ${qDef.key})`,
          );
        }

        const question = questionRepo.create({
          text: qDef.text,
          type,
          isRequired: qDef.isRequired,
          order: qDef.order,
          section,
        });
        await questionRepo.save(question);

        if (qDef.options && qDef.options.length > 0) {
          const options = optionRepo.create(
            qDef.options.map((o) => ({
              text: o.text,
              value: o.value,
              isOther: o.isOther ?? false,
              question,
            })),
          );
          await optionRepo.save(options);
        }
      }
    }

    const totalQ = instrDef.sections.reduce(
      (s, sec) => s + sec.questions.length,
      0,
    );
    console.log(
      `[seed]   → ${instrDef.sections.length} secciones, ${totalQ} preguntas`,
    );
  }
}
