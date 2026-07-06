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
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
      metadataId: opt.metadataId,
    }));
    map.set(opt.text, saved.optionId);
  }
  return map;
}

const NAME = `S11: Adopción Tecnológica — Diagnóstico de Barreras`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaDiagnosticoDeBarreras(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "multiple_choice", "open_text", "single_choice"];
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
      publishDate: '2026-06-25',
      isActive: false,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `Barreras de habilidades digitales`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Barreras de percepción y confianza`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Otras barreras`, order: 3, instrument }))
  ]);

  // ── Barreras de habilidades digitales ──
  {
    let o = 1;

    const q_b4361b92_977b_4504_ba3f_84b8dde6299c = await saveQuestion(manager, {
      text: `Nivel educativo alcanzado por el productor`,
      type: types.single_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.educationLevel',
    });
    await saveOptions(manager, q_b4361b92_977b_4504_ba3f_84b8dde6299c, [
      { text: `Sin escolaridad` },
      { text: `Primaria (1°–5°)` },
      { text: `Secundaria (6°–9°)` },
      { text: `Media (10°–11°)` },
      { text: `Técnico o tecnológico` },
      { text: `Universitario` },
      { text: `Posgrado` },
    ]);

    const q_e3e1736d_554f_4b99_a492_27bc4db508b3 = await saveQuestion(manager, {
      text: `¿Cuáles de las siguientes habilidades digitales puede realizar?`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_e3e1736d_554f_4b99_a492_27bc4db508b3, [
      { text: `Enviar correos electrónicos con archivos` },
      { text: `Buscar, descargar e instalar aplicaciones` },
      { text: `Copiar y pegar información entre documentos` },
      { text: `Transferir archivos entre dispositivos o por internet` },
      { text: `Verificar si información de internet es verdadera` },
      { text: `Usar herramientas de Inteligencia Artificial (ChatGPT, Gemini, etc.)` },
      { text: `Usar procesadores de texto (Word / Google Docs)` },
      { text: `Conectar dispositivos adicionales (impresora, módem)` },
    ]);

    const q_bf23243a_ced0_4e78_9fd0_620ed1bd5964 = await saveQuestion(manager, {
      text: `¿Para qué usa principalmente el teléfono celular?`,
      type: types.multiple_choice,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_bf23243a_ced0_4e78_9fd0_620ed1bd5964, [
      { text: `Actividades productivas / gestión finca` },
      { text: `Consultar precios o mercados agrícolas` },
      { text: `WhatsApp` },
      { text: `Llamadas personales/familiares` },
      { text: `Banca móvil` },
      { text: `Navegar en internet` },
      { text: `Redes sociales` },
    ]);

    await saveQuestion(manager, {
      text: `¿Para qué usa internet?`,
      type: types.open_text,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Desde qué lugares accede principalmente a internet?`,
      type: types.open_text,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

    const q_2fc46adc_7673_49c1_a089_6480e8f9016c = await saveQuestion(manager, {
      text: `¿Cuáles plataformas o aplicaciones usa actualmente?`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_2fc46adc_7673_49c1_a089_6480e8f9016c, [
      { text: `Facebook` },
      { text: `WhatsApp` },
      { text: `YouTube` },
      { text: `Google (búsquedas)` },
      { text: `Instagram` },
      { text: `ChatGPT u otra IA` },
      { text: `Apps de banca móvil (Nequi, Bancolombia, etc.)` },
      { text: `Apps agropecuarias` },
      { text: `Ninguna` },
      { text: `Otros`, isOther: true },
    ]);

    const q_8c7b2b56_90b0_4245_84d8_f0265a589725 = await saveQuestion(manager, {
      text: `¿Cuáles de estas tecnologías usa actualmente en su finca?`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8c7b2b56_90b0_4245_84d8_f0265a589725, [
      { text: `Software de contabilidad o inventarios` },
      { text: `Apps móviles agrícolas` },
      { text: `Sensores / IoT` },
      { text: `Drones` },
      { text: `Cámaras de monitoreo` },
      { text: `Fertilización técnica con análisis de suelos` },
      { text: `Riego tecnificado` },
      { text: `Ninguna` },
      { text: `Otros`, isOther: true },
    ]);

  }

  // ── Barreras de percepción y confianza ──
  {
    let o = 1;

    const q_7617ed37_2e51_485c_b2a5_9099ac917150 = await saveQuestion(manager, {
      text: `Me siento cómodo(a) usando aplicaciones en el celular o computador.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_7617ed37_2e51_485c_b2a5_9099ac917150, [
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `En desacuerdo`, value: 2 },
      { text: `De acuerdo`, value: 4 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_412dcdcd_b09f_4785_b42e_8ffefa8fd324 = await saveQuestion(manager, {
      text: `La tecnología me ayudaría a tomar mejores decisiones en mi finca.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_412dcdcd_b09f_4785_b42e_8ffefa8fd324, [
      { text: `De acuerdo`, value: 4 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_b60c9c69_f84b_4006_ab7c_88f16c33de37 = await saveQuestion(manager, {
      text: `El uso de tecnología podría aumentar mis ingresos o mejorar mi producción.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_b60c9c69_f84b_4006_ab7c_88f16c33de37, [
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
    ]);

    const q_e10c2dee_4b42_4837_99fc_35ac549f1d22 = await saveQuestion(manager, {
      text: `Me genera desconfianza que la tecnología falle en momentos importantes.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_e10c2dee_4b42_4837_99fc_35ac549f1d22, [
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_c1582ae7_26b5_4b9c_bab1_bccb549f9e4d = await saveQuestion(manager, {
      text: `Prefiero mantener mis métodos actuales antes de arriesgarme con tecnología nueva.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_c1582ae7_26b5_4b9c_bab1_bccb549f9e4d, [
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Totalmente en desacuerdo`, value: 1 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
    ]);

    const q_fe27e551_0d24_45f7_b098_962e7102a888 = await saveQuestion(manager, {
      text: `Aprendería a usar una app nueva si alguien me enseña cómo funciona.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_fe27e551_0d24_45f7_b098_962e7102a888, [
      { text: `Totalmente en desacuerdo`, value: 1 },
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
    ]);

    const q_8dfcc7c7_1f95_429e_8890_acd5d92bb05f = await saveQuestion(manager, {
      text: `Uso internet regularmente para actividades productivas.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_8dfcc7c7_1f95_429e_8890_acd5d92bb05f, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
    ]);

  }

  // ── Otras barreras ──
  {
    let o = 1;

    const q_b20e506a_b317_482b_b9c6_18524f38d4fa = await saveQuestion(manager, {
      text: `¿Cuáles son las principales barreras para adoptar tecnologías digitales?`,
      type: types.multiple_choice,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_b20e506a_b317_482b_b9c6_18524f38d4fa, [
      { text: `Falta de conocimiento para usar` },
      { text: `Falta de dinero para equipos` },
      { text: `Alto costo del internet/datos` },
      { text: `Mala señal o sin cobertura` },
      { text: `Desconfianza en la tecnología` },
      { text: `No veo beneficio claro` },
      { text: `Falta de acompañamiento técnico` },
      { text: `Edad / dificultad aprender` },
      { text: `Otros`, isOther: true },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `De las posibles funciones de una app agrícola, el registro de producción y el acceso a precios de mercado serían las más valiosas para mí.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Estaría dispuesto(a) a invertir al menos una sesión de capacitación para aprender a usar una nueva app agrícola, si veo resultados concretos rápidamente.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Confiaría más en una app para gestionar mi finca si la recomienda mi extensionista o si está respaldada por una entidad que conozco.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Usaría una app aunque al inicio me resultara difícil de manejar, si me demuestra que puede aumentar mis ingresos aplicando sus recomendaciones.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (19 preguntas).`);
}
