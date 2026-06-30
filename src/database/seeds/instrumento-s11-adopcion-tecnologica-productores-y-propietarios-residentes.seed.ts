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

const NAME = `S11: Adopción Tecnológica — Productores y Propietarios Residentes`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaProductoresYPropietariosResidentes(manager: EntityManager): Promise<void> {
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
      publishDate: '2025-05-13',
      isActive: false,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `D. Habilidades y usos digitales`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `F. Actitudes y percepciones tecnológicas`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `G. Barreras percibidas y requerimientos de software`, order: 3, instrument }))
  ]);

  // ── D. Habilidades y usos digitales ──
  {
    let o = 1;

    const q_5df2fa25_84e8_4a21_8b2c_c0e2084948e0 = await saveQuestion(manager, {
      text: `¿Cuáles de las siguientes habilidades digitales puede realizar?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5df2fa25_84e8_4a21_8b2c_c0e2084948e0, [
      { text: `Conectar dispositivos adicionales (impresora, módem)` },
      { text: `Usar procesadores de texto (Word / Google Docs)` },
      { text: `Copiar y pegar información entre documentos` },
      { text: `Enviar correos electrónicos con archivos` },
      { text: `Buscar, descargar e instalar aplicaciones` },
      { text: `Transferir archivos entre dispositivos o por internet` },
      { text: `Verificar si información de internet es verdadera` },
      { text: `Usar herramientas de Inteligencia Artificial (ChatGPT, Gemini, etc.)` },
    ]);

    const q_4eaadce7_e66d_4725_977e_e6f590c23eaa = await saveQuestion(manager, {
      text: `¿Con qué frecuencia usa su teléfono celular?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_4eaadce7_e66d_4725_977e_e6f590c23eaa, [
      { text: `Al menos una vez por semana` },
      { text: `Todos los días` },
      { text: `No utiliza` },
      { text: `Ocasionalmente` },
      { text: `Al menos una vez al mes` },
    ]);

    const q_a9df2d70_f673_4dfd_a6b7_6a3694581460 = await saveQuestion(manager, {
      text: `¿Para qué usa principalmente el teléfono celular?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a9df2d70_f673_4dfd_a6b7_6a3694581460, [
      { text: `Llamadas personales/familiares` },
      { text: `Banca móvil` },
      { text: `Consultar precios o mercados agrícolas` },
      { text: `Actividades productivas / gestión finca` },
      { text: `Redes sociales` },
      { text: `Navegar en internet` },
      { text: `WhatsApp` },
    ]);

    await saveQuestion(manager, {
      text: `¿Para qué usa internet?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_67b0269e_a506_4b2c_91c0_e41d6da49abb = await saveQuestion(manager, {
      text: `¿Cuáles plataformas o aplicaciones usa actualmente?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_67b0269e_a506_4b2c_91c0_e41d6da49abb, [
      { text: `YouTube` },
      { text: `Facebook` },
      { text: `WhatsApp` },
      { text: `Ninguna` },
      { text: `Apps agropecuarias (Agrosavia / AgroApp / otras)` },
      { text: `Apps de banca móvil` },
      { text: `ChatGPT u otra IA` },
      { text: `Google (búsquedas)` },
      { text: `Instagram` },
    ]);

    const q_1f758c88_37ef_4085_ace4_205a37cc71db = await saveQuestion(manager, {
      text: `¿Con qué frecuencia usa computador o tableta?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_1f758c88_37ef_4085_ace4_205a37cc71db, [
      { text: `Ocasionalmente` },
      { text: `No utiliza` },
      { text: `Al menos una vez al mes` },
      { text: `Al menos una vez por semana` },
      { text: `Todos los días` },
    ]);

    await saveQuestion(manager, {
      text: `¿Desde qué lugares accede principalmente a internet?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── F. Actitudes y percepciones tecnológicas ──
  {
    let o = 1;

    const q_b8c5a0f2_933f_43a5_b28a_4783ba56034e = await saveQuestion(manager, {
      text: `Me siento cómodo(a) usando aplicaciones en el celular o computador.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_b8c5a0f2_933f_43a5_b28a_4783ba56034e, [
      { text: `3` },
      { text: `4` },
      { text: `5` },
      { text: `2` },
      { text: `1` },
    ]);

    const q_98d70990_078a_443c_aa6b_ff1fc89ebce4 = await saveQuestion(manager, {
      text: `Uso internet o el celular regularmente para actividades de mi producción.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_98d70990_078a_443c_aa6b_ff1fc89ebce4, [
      { text: `5` },
      { text: `1` },
      { text: `2` },
      { text: `3` },
      { text: `4` },
    ]);

    const q_9c1467db_7ee8_4584_9447_1b1d71dda46d = await saveQuestion(manager, {
      text: `La tecnología me ayudaría a tomar mejores decisiones en mi finca.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_9c1467db_7ee8_4584_9447_1b1d71dda46d, [
      { text: `5` },
      { text: `4` },
      { text: `3` },
      { text: `2` },
      { text: `1` },
    ]);

    const q_e712d588_b830_4683_8c67_81996ced4bd9 = await saveQuestion(manager, {
      text: `El uso de tecnología podría aumentar mis ingresos o mejorar mi producción.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_e712d588_b830_4683_8c67_81996ced4bd9, [
      { text: `2` },
      { text: `5` },
      { text: `3` },
      { text: `4` },
      { text: `1` },
    ]);

    const q_63e71f7b_f1f8_42da_8104_b96529e94ee0 = await saveQuestion(manager, {
      text: `Me genera desconfianza que la tecnología falle en momentos importantes.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_63e71f7b_f1f8_42da_8104_b96529e94ee0, [
      { text: `5` },
      { text: `3` },
      { text: `2` },
      { text: `1` },
      { text: `4` },
    ]);

    const q_5dc974b0_508d_41eb_aa39_7aaae6ce9388 = await saveQuestion(manager, {
      text: `Prefiero mantener mis métodos actuales antes de arriesgarme con tecnología nueva.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_5dc974b0_508d_41eb_aa39_7aaae6ce9388, [
      { text: `1` },
      { text: `3` },
      { text: `4` },
      { text: `5` },
      { text: `2` },
    ]);

    const q_91c1d0f4_d65c_4d52_9633_f09c2e4cbf85 = await saveQuestion(manager, {
      text: `Me gusta probar nuevas herramientas y tecnologías cuando están disponibles.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_91c1d0f4_d65c_4d52_9633_f09c2e4cbf85, [
      { text: `1` },
      { text: `3` },
      { text: `4` },
      { text: `5` },
      { text: `2` },
    ]);

    const q_807670d7_b459_4443_abc2_d653f19b4de9 = await saveQuestion(manager, {
      text: `Aprendería a usar una app nueva si alguien me enseña cómo funciona.`,
      type: types.likert,
      isRequired: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_807670d7_b459_4443_abc2_d653f19b4de9, [
      { text: `3` },
      { text: `1` },
      { text: `2` },
      { text: `4` },
      { text: `5` },
    ]);

  }

  // ── G. Barreras percibidas y requerimientos de software ──
  {
    let o = 1;

    const q_f2b621df_9a5f_4122_8583_57507cba47c6 = await saveQuestion(manager, {
      text: `¿Cuáles de estas tecnologías usa actualmente en su finca?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_f2b621df_9a5f_4122_8583_57507cba47c6, [
      { text: `Software de contabilidad o inventarios` },
      { text: `Fertilización técnica con análisis de suelos` },
      { text: `Ninguna` },
      { text: `Riego tecnificado` },
      { text: `Cámaras de monitoreo` },
      { text: `Drones` },
      { text: `Sensores / IoT` },
      { text: `Apps móviles agrícolas` },
    ]);

    const q_06dea5b3_a886_49c9_8e5c_c771a72586ee = await saveQuestion(manager, {
      text: `¿Cuáles son las principales barreras para adoptar tecnologías digitales?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_06dea5b3_a886_49c9_8e5c_c771a72586ee, [
      { text: `No veo beneficio claro` },
      { text: `Desconfianza en la tecnología` },
      { text: `Falta de dinero para equipos` },
      { text: `Falta de conocimiento para usar` },
      { text: `Mala señal o sin cobertura` },
      { text: `Edad / dificultad aprender` },
      { text: `Falta de acompañamiento técnico` },
      { text: `Alto costo del internet/datos` },
    ]);

    const q_a284e3ef_eb52_4cf3_b792_184ebefb4220 = await saveQuestion(manager, {
      text: `¿Qué le gustaría que una herramienta digital le ayudara a gestionar en su finca?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_a284e3ef_eb52_4cf3_b792_184ebefb4220, [
      { text: `Consulta de precios de mercado` },
      { text: `Registro y control de producción` },
      { text: `Gestión de costos, ingresos y rentabilidad` },
      { text: `Control sanitario y manejo de plagas` },
      { text: `Información climática y alertas tempranas` },
      { text: `Acceso a crédito y servicios financieros` },
      { text: `Monitoreo con sensores (suelo, clima, producción)` },
      { text: `Comunicación con compradores o asociaciones` },
      { text: `Predicción de rendimiento o ganancias` },
      { text: `Recomendaciones inteligentes con IA` },
    ]);

    const q_234b2c7e_76a3_455b_9573_bac74747363f = await saveQuestion(manager, {
      text: `¿Qué formato preferiría para recibir información o alertas sobre su producción?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_234b2c7e_76a3_455b_9573_bac74747363f, [
      { text: `WhatsApp (texto)` },
      { text: `Audio/voz` },
      { text: `Imagen / infografía` },
      { text: `Video corto` },
      { text: `Notificación en app` },
      { text: `SMS` },
      { text: `Llamada telefónica` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (19 preguntas).`);
}
