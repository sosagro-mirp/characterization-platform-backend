import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

async function saveQuestion(
  manager: EntityManager,
  def: {
    text: string;
    type: TypeOfQuestion;
    isRequired: boolean;
    isSelectionCriteria?: boolean;
    isKeyQuestion?: boolean;
    order: number;
    section: Section;
    conditionQuestion?: Question;
    conditionValue?: string;
    systemField?: string;
  },
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    isKeyQuestion: def.isKeyQuestion ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
    systemField: def.systemField,
  }));
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean; metadataId?: string }[],
): Promise<void> {
  const repo = manager.getRepository(OptionQuestion);
  for (const opt of options) {
    await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
      metadataId: opt.metadataId,
    }));
  }
}

const LIKERT_OPTIONS = [
  { text: `Totalmente en desacuerdo`, value: 1 },
  { text: `En desacuerdo`, value: 2 },
  { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
  { text: `De acuerdo`, value: 4 },
  { text: `Totalmente de acuerdo`, value: 5 },
];

const NAME = `S_DCU: Diagnóstico de Barreras de Adopción Digital — DCU`;
const VERSION = 1;

export async function seedInstrumentoSDcuDiagnosticoBarrerasAdopcionDigital(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ['likert', 'open_text', 'single_choice', 'multiple_choice'];
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
      publishDate: '2026-07-01',
      isActive: true,
      code: 'S_DCU',
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3, sec4, sec5, sec6] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `Barrera de Acceso y Conectividad (B1)`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Barrera Cognitiva (B2)`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Barrera Subjetiva (B3)`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Prácticas Actuales y Mapeo de Fricciones (Módulo C)`, order: 4, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Necesidades y Valoración de la Solución (Módulo D)`, order: 5, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Confianza en Instituciones (Módulo E.5)`, order: 6, instrument })),
  ]);

  // ── Sección 1: Barrera de Acceso y Conectividad (B1) ──
  {
    let o = 1;

    const b1_1 = await saveQuestion(manager, {
      text: `En mi finca tengo buena señal de internet para usar el celular.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
    });
    await saveOptions(manager, b1_1, LIKERT_OPTIONS);

    const b1_2 = await saveQuestion(manager, {
      text: `La conexión de internet es estable la mayor parte del día.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
    });
    await saveOptions(manager, b1_2, LIKERT_OPTIONS);

    // DEBT: campo isInverted no existe en la entidad Question.
    // Se usa systemField con prefijo 'inverted:' como marcación provisional.
    const b1_3 = await saveQuestion(manager, {
      text: `Pagar por datos o internet no me causa problema económico.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
      systemField: 'inverted:B1.3',
    });
    await saveOptions(manager, b1_3, LIKERT_OPTIONS);

    const b1_4 = await saveQuestion(manager, {
      text: `Tengo un celular con suficiente espacio y capacidad para descargar aplicaciones.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
    });
    await saveOptions(manager, b1_4, LIKERT_OPTIONS);

    const b1_5 = await saveQuestion(manager, {
      text: `Tengo acceso a electricidad confiable para cargar mis dispositivos.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
    });
    await saveOptions(manager, b1_5, LIKERT_OPTIONS);

    const b1_6 = await saveQuestion(manager, {
      text: `Si necesitara un crédito o apoyo para comprar tecnología, podría conseguirlo.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec1,
    });
    await saveOptions(manager, b1_6, LIKERT_OPTIONS);

    await saveQuestion(manager, {
      text: `Observaciones / contexto sobre acceso y conectividad.`,
      type: types.open_text, isRequired: false, order: o++, section: sec1,
    });
  }

  // ── Sección 2: Barrera Cognitiva (B2) ──
  {
    let o = 1;

    const b2_1 = await saveQuestion(manager, {
      text: `Me siento capaz de aprender a usar una aplicación nueva en el celular.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec2,
    });
    await saveOptions(manager, b2_1, LIKERT_OPTIONS);

    const b2_2 = await saveQuestion(manager, {
      text: `Ya he usado aplicaciones en el celular para mi trabajo o cultivo.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec2,
    });
    await saveOptions(manager, b2_2, LIKERT_OPTIONS);

    const b2_3 = await saveQuestion(manager, {
      text: `Escribir y leer mensajes en el celular se me hace fácil.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec2,
    });
    await saveOptions(manager, b2_3, LIKERT_OPTIONS);

    const b2_4 = await saveQuestion(manager, {
      text: `He recibido capacitación o entrenamiento en el uso de herramientas digitales.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec2,
    });
    await saveOptions(manager, b2_4, LIKERT_OPTIONS);

    const b2_5 = await saveQuestion(manager, {
      text: `Entiendo para qué me serviría una herramienta digital en mi cultivo.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec2,
    });
    await saveOptions(manager, b2_5, LIKERT_OPTIONS);

    await saveQuestion(manager, {
      text: `Observaciones / contexto sobre capacidad cognitiva y alfabetización digital.`,
      type: types.open_text, isRequired: false, order: o++, section: sec2,
    });
  }

  // ── Sección 3: Barrera Subjetiva (B3) ──
  {
    let o = 1;

    const b3_1 = await saveQuestion(manager, {
      text: `Confío en que una herramienta digital me dé información correcta sobre mi cultivo.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
    });
    await saveOptions(manager, b3_1, LIKERT_OPTIONS);

    // DEBT: campo isInverted no existe en la entidad Question.
    const b3_2 = await saveQuestion(manager, {
      text: `Me preocupa qué hacen con mis datos personales las aplicaciones.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
      systemField: 'inverted:B3.2',
    });
    await saveOptions(manager, b3_2, LIKERT_OPTIONS);

    const b3_3 = await saveQuestion(manager, {
      text: `Confío en la persona o entidad que me recomienda o entrega la tecnología (extensionista, cooperativa, universidad).`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
    });
    await saveOptions(manager, b3_3, LIKERT_OPTIONS);

    const b3_4 = await saveQuestion(manager, {
      text: `Si la gente de mi comunidad, familia o vecinos la usan, yo me animaría a usarla.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
    });
    await saveOptions(manager, b3_4, LIKERT_OPTIONS);

    const b3_5 = await saveQuestion(manager, {
      text: `Una herramienta así me sería útil para mejorar mi producción o reducir costos.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
    });
    await saveOptions(manager, b3_5, LIKERT_OPTIONS);

    // DEBT: campo isInverted no existe en la entidad Question.
    const b3_6 = await saveQuestion(manager, {
      text: `Me da temor cometer errores con la herramienta o que me dé un mal consejo.`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec3,
      systemField: 'inverted:B3.6',
    });
    await saveOptions(manager, b3_6, LIKERT_OPTIONS);

    await saveQuestion(manager, {
      text: `Observaciones / contexto sobre confianza y percepción subjetiva.`,
      type: types.open_text, isRequired: false, order: o++, section: sec3,
    });
  }

  // ── Sección 4: Prácticas Actuales y Mapeo de Fricciones (Módulo C) ──
  {
    let o = 1;

    const c1a = await saveQuestion(manager, {
      text: `Cuando tiene una duda técnica sobre su cultivo (plagas, fertilización, riego, etc.), ¿a quién o a qué acude primero?`,
      type: types.single_choice, isRequired: true, isKeyQuestion: true, order: o++, section: sec4,
    });
    await saveOptions(manager, c1a, [
      { text: `Extensionista / técnico` },
      { text: `Vecino o amigo` },
      { text: `Familia` },
      { text: `Internet o app` },
      { text: `TV o radio` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Por qué acude a esa fuente en primer lugar?`,
      type: types.open_text, isRequired: false, order: o++, section: sec4,
    });

    await saveQuestion(manager, {
      text: `Cuénteme la última vez que buscó información para tomar una decisión en su cultivo (cuándo sembrar, qué hacer con una plaga, si regar, etc.). ¿Cómo le fue?`,
      type: types.open_text, isRequired: true, isKeyQuestion: true, order: o++, section: sec4,
    });

    const c2b = await saveQuestion(manager, {
      text: `¿Cuál fue el resultado de esa búsqueda de información?`,
      type: types.single_choice, isRequired: true, order: o++, section: sec4,
    });
    await saveOptions(manager, c2b, [
      { text: `Satisfecho` },
      { text: `Parcialmente satisfecho` },
      { text: `Insatisfecho` },
    ]);

    await saveQuestion(manager, {
      text: `¿Ha intentado usar alguna app o herramienta digital en el celular (para su cultivo o trabajo) y la dejó de usar? ¿Qué lo frustró?`,
      type: types.open_text, isRequired: false, isKeyQuestion: true, order: o++, section: sec4,
    });

    const c4a = await saveQuestion(manager, {
      text: `¿En qué momentos del ciclo de su cultivo siente que le falta más información, apoyo o seguridad para tomar decisiones?`,
      type: types.multiple_choice, isRequired: false, isKeyQuestion: true, order: o++, section: sec4,
    });
    await saveOptions(manager, c4a, [
      { text: `Preparación` },
      { text: `Siembra` },
      { text: `Crecimiento` },
      { text: `Cosecha` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué le falta en esos momentos del ciclo productivo?`,
      type: types.open_text, isRequired: false, order: o++, section: sec4,
    });

    await saveQuestion(manager, {
      text: `¿Qué papel juega el extensionista o la cooperativa / asociación en sus decisiones sobre el cultivo?`,
      type: types.open_text, isRequired: false, isKeyQuestion: true, order: o++, section: sec4,
    });
  }

  // ── Sección 5: Necesidades y Valoración de la Solución (Módulo D) ──
  {
    let o = 1;

    const d1 = await saveQuestion(manager, {
      text: `Si tuviera un asistente en el celular que responde dudas sobre su cultivo, ¿cómo preferiría hablarle?`,
      type: types.single_choice, isRequired: true, isKeyQuestion: true, order: o++, section: sec5,
    });
    await saveOptions(manager, d1, [
      { text: `Por voz / hablando (llamada o nota de voz)` },
      { text: `Escribiendo / mensajes de texto` },
      { text: `Ambos, sin importancia` },
      { text: `No sé / depende de la situación` },
    ]);

    const d3 = await saveQuestion(manager, {
      text: `¿Qué temas le gustaría poder consultarle a ese asistente?`,
      type: types.multiple_choice, isRequired: false, isKeyQuestion: true, order: o++, section: sec5,
    });
    await saveOptions(manager, d3, [
      { text: `Plagas y enfermedades (identificar, cómo controlar)` },
      { text: `Clima y cuándo regar` },
      { text: `Precios y mercados (cuándo vender, dónde)` },
      { text: `Fertilización y nutrición de plantas` },
      { text: `Normativa y trámites (registros, certificaciones)` },
      { text: `Cosecha y pos-cosecha (cómo y cuándo)` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué tendría que hacer ese asistente para que usted confíe en sus respuestas?`,
      type: types.open_text, isRequired: true, isKeyQuestion: true, order: o++, section: sec5,
    });

    const d5a = await saveQuestion(manager, {
      text: `En una escala de 1 a 5, ¿cuánto se animaría a probar esta herramienta en su día a día?`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec5,
    });
    await saveOptions(manager, d5a, LIKERT_OPTIONS);

    await saveQuestion(manager, {
      text: `¿Por qué ese número? ¿Qué le daría más confianza para usarla?`,
      type: types.open_text, isRequired: false, order: o++, section: sec5,
    });
  }

  // ── Sección 6: Confianza en Instituciones (Módulo E.5) ──
  {
    let o = 1;

    const e5_1 = await saveQuestion(manager, {
      text: `Nivel de confianza en: Gobierno (UMATA, secretaría de agricultura, etc.)`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec6,
    });
    await saveOptions(manager, e5_1, LIKERT_OPTIONS);

    const e5_2 = await saveQuestion(manager, {
      text: `Nivel de confianza en: Cooperativa / asociación de productores`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec6,
    });
    await saveOptions(manager, e5_2, LIKERT_OPTIONS);

    const e5_3 = await saveQuestion(manager, {
      text: `Nivel de confianza en: Universidad / proyecto de investigación`,
      type: types.likert, isRequired: true, isKeyQuestion: true, order: o++, section: sec6,
    });
    await saveOptions(manager, e5_3, LIKERT_OPTIONS);
  }

  console.log(`[seed] "${NAME}" insertado (36 preguntas).`);
}
