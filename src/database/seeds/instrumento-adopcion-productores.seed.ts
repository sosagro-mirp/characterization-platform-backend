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
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; isOther?: boolean }[],
): Promise<void> {
  const repo = manager.getRepository(OptionQuestion);
  for (const opt of options) {
    await repo.save(
      repo.create({ question, text: opt.text, isOther: opt.isOther ?? false }),
    );
  }
}

// ─── Constantes compartidas ───────────────────────────────────────────────────

const OPTS_LIKERT = [
  { text: '1' },
  { text: '2' },
  { text: '3' },
  { text: '4' },
  { text: '5' },
];

const OPTS_FRECUENCIA = [
  { text: 'Todos los días' },
  { text: 'Al menos una vez por semana' },
  { text: 'Al menos una vez al mes' },
  { text: 'Ocasionalmente' },
  { text: 'No utiliza' },
];

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S11. Adopción Tecnológica: Productores y Propietarios Residentes';
const VERSION = 1;

export async function seedInstrumentoAdopcionProductores(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = [
    'open_text',
    'numeric',
    'yes_no',
    'single_choice',
    'multiple_choice',
    'likert',
  ];
  const types: Record<string, TypeOfQuestion> = {};
  for (const n of typeNames) {
    const t = await typeRepo.findOne({ where: { name: n } });
    if (!t) throw new Error(`[seed] TypeOfQuestion "${n}" no encontrado.`);
    types[n] = t;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [secA, secB, secD, secF, secG] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: 'A. Información general del productor(a)',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: 'B. Características productivas de la finca',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: 'D. Habilidades y usos digitales',
        order: 3,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: 'F. Actitudes y percepciones tecnológicas',
        order: 4,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: 'G. Barreras percibidas y requerimientos de software',
        order: 5,
        instrument,
      }),
    ),
  ]);

  // ── A. Información general ────────────────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: 'A.1 ★ — ¿Cuál es la edad del productor(a)? (años)',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });

    const qA2 = await saveQuestion(manager, {
      text: 'A.2 ★ — ¿Cuál es el género del productor(a)?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });
    await saveOptions(manager, qA2, [
      { text: 'Hombre' },
      { text: 'Mujer' },
      { text: 'No binario / Otro' },
      { text: 'Prefiere no responder' },
    ]);

    const qA3 = await saveQuestion(manager, {
      text: 'A.3 ★ — ¿Cuál es el nivel educativo alcanzado?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });
    await saveOptions(manager, qA3, [
      { text: 'Sin escolaridad' },
      { text: 'Primaria (1°–5°)' },
      { text: 'Secundaria (6°–9°)' },
      { text: 'Media (10°–11°)' },
      { text: 'Técnico o tecnológico' },
      { text: 'Universitario' },
      { text: 'Posgrado' },
    ]);

    await saveQuestion(manager, {
      text: 'A.4 ★ — ¿Cuántos años lleva practicando la actividad productiva principal?',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });

    await saveQuestion(manager, {
      text: 'A.5 ★ — ¿Cuántas personas conforman su hogar?',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });

    await saveQuestion(manager, {
      text: 'A.6 ★ — ¿La actividad agrícola es la principal fuente de ingresos del hogar?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secA,
    });
  }

  // ── B. Características productivas ───────────────────────────────────────────
  // B.3 y B.4 omitidos — referencia cruzada con S2 (cultivos)
  {
    let o = 1;

    const qB1 = await saveQuestion(manager, {
      text: 'B.1 ★ — ¿Cuál es la forma de tenencia de la tierra?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secB,
    });
    await saveOptions(manager, qB1, [
      { text: 'Propietario(a) con título formal' },
      { text: 'Propietario(a) sin título formal' },
      { text: 'Arrendatario(a)' },
      { text: 'Aparcero(a) / Mediería' },
      { text: 'Comodato / Préstamo' },
      { text: 'Tierra colectiva (resguardo / comunidad)' },
      { text: 'Otro', isOther: true },
    ]);

    await saveQuestion(manager, {
      text: 'B.2 ★ — ¿Cuál es el área total de la unidad productiva (ha)?',
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secB,
    });
  }

  // ── D. Habilidades y usos digitales ──────────────────────────────────────────
  {
    let o = 1;

    const qD1 = await saveQuestion(manager, {
      text: 'D.1 ★ — ¿Cuáles de las siguientes habilidades digitales puede realizar?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secD,
    });
    await saveOptions(manager, qD1, [
      { text: 'Usar procesadores de texto (Word / Google Docs)' },
      { text: 'Copiar y pegar información entre documentos' },
      { text: 'Enviar correos electrónicos con archivos' },
      { text: 'Conectar dispositivos adicionales (impresora, módem)' },
      { text: 'Buscar, descargar e instalar aplicaciones' },
      { text: 'Transferir archivos entre dispositivos o por internet' },
      { text: 'Verificar si información de internet es verdadera' },
      {
        text: 'Usar herramientas de Inteligencia Artificial (ChatGPT, Gemini, etc.)',
      },
    ]);

    const qD2 = await saveQuestion(manager, {
      text: 'D.2 ★ — ¿Con qué frecuencia usa su teléfono celular?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secD,
    });
    await saveOptions(manager, qD2, OPTS_FRECUENCIA);

    const qD3 = await saveQuestion(manager, {
      text: 'D.3 ★ — ¿Para qué usa principalmente el teléfono celular?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secD,
    });
    await saveOptions(manager, qD3, [
      { text: 'Llamadas personales/familiares' },
      { text: 'WhatsApp' },
      { text: 'Navegar en internet' },
      { text: 'Redes sociales' },
      { text: 'Actividades productivas / gestión finca' },
      { text: 'Consultar precios o mercados agrícolas' },
      { text: 'Banca móvil' },
    ]);

    await saveQuestion(manager, {
      text: 'D.4 — ¿Para qué usa internet?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: secD,
    });

    const qD5 = await saveQuestion(manager, {
      text: 'D.5 ★ — ¿Cuáles plataformas o aplicaciones usa actualmente?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secD,
    });
    await saveOptions(manager, qD5, [
      { text: 'WhatsApp' },
      { text: 'Facebook' },
      { text: 'YouTube' },
      { text: 'Google (búsquedas)' },
      { text: 'Instagram' },
      { text: 'ChatGPT u otra IA' },
      { text: 'Apps de banca móvil' },
      { text: 'Apps agropecuarias (Agrosavia / AgroApp / otras)' },
      { text: 'Ninguna' },
    ]);

    const qD6 = await saveQuestion(manager, {
      text: 'D.6 ★ — ¿Con qué frecuencia usa computador o tableta?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secD,
    });
    await saveOptions(manager, qD6, OPTS_FRECUENCIA);

    await saveQuestion(manager, {
      text: 'D.7 — ¿Desde qué lugares accede principalmente a internet?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: secD,
    });
  }

  // ── F. Actitudes y percepciones tecnológicas ──────────────────────────────────
  {
    let o = 1;

    const likertQuestions = [
      'F.1 — Me siento cómodo(a) usando aplicaciones en el celular o computador.',
      'F.2 — Uso internet o el celular regularmente para actividades de mi producción.',
      'F.3 — La tecnología me ayudaría a tomar mejores decisiones en mi finca.',
      'F.4 — El uso de tecnología podría aumentar mis ingresos o mejorar mi producción.',
      'F.5 — Me genera desconfianza que la tecnología falle en momentos importantes.',
      'F.6 — Prefiero mantener mis métodos actuales antes de arriesgarme con tecnología nueva.',
      'F.7 — Me gusta probar nuevas herramientas y tecnologías cuando están disponibles.',
      'F.8 — Aprendería a usar una app nueva si alguien me enseña cómo funciona.',
    ];

    for (const text of likertQuestions) {
      const q = await saveQuestion(manager, {
        text,
        type: types.likert,
        isRequired: true,
        order: o++,
        section: secF,
      });
      await saveOptions(manager, q, OPTS_LIKERT);
    }
  }

  // ── G. Barreras percibidas y requerimientos de software ───────────────────────
  {
    let o = 1;

    const qG1 = await saveQuestion(manager, {
      text: 'G.1 ★ — ¿Cuáles de estas tecnologías usa actualmente en su finca?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secG,
    });
    await saveOptions(manager, qG1, [
      { text: 'Fertilización técnica con análisis de suelos' },
      { text: 'Riego tecnificado' },
      { text: 'Software de contabilidad o inventarios' },
      { text: 'Apps móviles agrícolas' },
      { text: 'Sensores / IoT' },
      { text: 'Drones' },
      { text: 'Cámaras de monitoreo' },
      { text: 'Ninguna' },
    ]);

    const qG2 = await saveQuestion(manager, {
      text: 'G.2 ★ — ¿Cuáles son las principales barreras para adoptar tecnologías digitales? (máx. 3)',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secG,
    });
    await saveOptions(manager, qG2, [
      { text: 'Falta de dinero para equipos' },
      { text: 'Alto costo del internet/datos' },
      { text: 'Mala señal o sin cobertura' },
      { text: 'Falta de conocimiento para usar' },
      { text: 'Desconfianza en la tecnología' },
      { text: 'No veo beneficio claro' },
      { text: 'Falta de acompañamiento técnico' },
      { text: 'Edad / dificultad aprender' },
    ]);

    const qG3 = await saveQuestion(manager, {
      text: 'G.3 ★ — ¿Qué le gustaría que una herramienta digital le ayudara a gestionar en su finca?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secG,
    });
    await saveOptions(manager, qG3, [
      { text: 'Registro y control de producción' },
      { text: 'Gestión de costos, ingresos y rentabilidad' },
      { text: 'Control sanitario y manejo de plagas' },
      { text: 'Información climática y alertas tempranas' },
      { text: 'Consulta de precios de mercado' },
      { text: 'Acceso a crédito y servicios financieros' },
      { text: 'Monitoreo con sensores (suelo, clima, producción)' },
      { text: 'Recomendaciones inteligentes con IA' },
      { text: 'Predicción de rendimiento o ganancias' },
      { text: 'Comunicación con compradores o asociaciones' },
    ]);

    const qG4 = await saveQuestion(manager, {
      text: 'G.4 ★ — ¿Qué formato preferiría para recibir información o alertas sobre su producción?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secG,
    });
    await saveOptions(manager, qG4, [
      { text: 'SMS' },
      { text: 'WhatsApp (texto)' },
      { text: 'Llamada telefónica' },
      { text: 'Audio/voz' },
      { text: 'Imagen / infografía' },
      { text: 'Video corto' },
      { text: 'Notificación en app' },
    ]);
  }
}
