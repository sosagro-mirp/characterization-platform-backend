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

const NAME = `S4.1: Poscosecha Cacao`;
const VERSION = 1;

export async function seedInstrumentoS41PoscosechaCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "multiple_choice", "numeric", "open_text", "single_choice", "yes_no"];
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

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `4.1 Cacao — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.1 Cacao — Poscosecha ──
  {
    let o = 1;

    const q_d4839467_79af_4f9d_8005_87906942004e = await saveQuestion(manager, {
      text: `Actividades de poscosecha que realiza en cacao`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d4839467_79af_4f9d_8005_87906942004e, [
      { text: `Transformación del grano` },
      { text: `Almacenamiento` },
      { text: `Empaque y etiquetado` },
      { text: `Fermentación` },
      { text: `Clasificación / selección de grano` },
      { text: `Cosecha selectiva por madurez` },
      { text: `Desgrane / apertura de mazorcas` },
      { text: `Secado` },
    ]);

    await saveQuestion(manager, {
      text: `¿Realiza fermentación?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_195a4961_8455_4872_9236_283c1f05c447 = await saveQuestion(manager, {
      text: `¿En qué tipo de recipiente fermenta?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_195a4961_8455_4872_9236_283c1f05c447, [
      { text: `Cajones de madera` },
      { text: `Sacos de yute` },
      { text: `Montón` },
      { text: `Otro`, isOther: true },
      { text: `No realiza fermentación` },
    ]);

    const q_442d6940_34f0_41e7_8565_5ebc23bb4e6a = await saveQuestion(manager, {
      text: `¿Los clones se fermentan por separado o mezclados?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_442d6940_34f0_41e7_8565_5ebc23bb4e6a, [
      { text: `Mezclados` },
      { text: `Por separado` },
    ]);

    await saveQuestion(manager, {
      text: `Clones en fermentación actualmente`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Duración promedio de la fermentación (días)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cómo sabe que el grano está bien fermentado? (características visuales, olfativas)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Qué mediciones realiza durante la fermentación?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Análisis de control de calidad en finca al cacao fermentado`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Análisis de control de calidad que manda hacer a laboratorio (fermentado)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Calidad sensorial habitual de la fermentación`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Comercializa el grano en estado fermentado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Realiza secado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f43580a4_cd2c_4707_8480_7920fa7ab24f = await saveQuestion(manager, {
      text: `Tipo de secado que utiliza`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f43580a4_cd2c_4707_8480_7920fa7ab24f, [
      { text: `Marquesina plástica` },
      { text: `Patio de cemento` },
      { text: `Secador solar tipo domo` },
      { text: `Secador mecánico` },
      { text: `Al sol directo sobre lonas` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Realiza volteos durante el secado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Frecuencia de volteos durante el secado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Duración promedio del secado (días)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cómo sabe que el grano está bien seco?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_e1930248_4388_405f_8098_d6af937e3b14 = await saveQuestion(manager, {
      text: `¿Mide la humedad final del grano seco?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Instrumento utilizado para medir humedad`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e1930248_4388_405f_8098_d6af937e3b14,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Humedad final habitual del grano seco (%)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Análisis de calidad en finca al cacao seco`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Análisis de calidad al cacao seco que manda a laboratorio`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_10ccd666_6438_4ca0_9da7_168ca30ce88a = await saveQuestion(manager, {
      text: `¿Conoce y cumple la NTC 1252?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_10ccd666_6438_4ca0_9da7_168ca30ce88a, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Mide el índice de mazorca (IM)?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_51cdca21_1c1d_4ba7_a138_78f8bf49b748 = await saveQuestion(manager, {
      text: `¿Mide el peso de 100 granos secos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Valor habitual del peso de 100 granos secos (g)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_51cdca21_1c1d_4ba7_a138_78f8bf49b748,
      conditionValue: 'true',
    });

    const q_6c369f58_5f1a_4b96_9ad9_cb0e425ca2a5 = await saveQuestion(manager, {
      text: `¿Comercializa el grano seco? Indique ámbito`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_6c369f58_5f1a_4b96_9ad9_cb0e425ca2a5, [
      { text: `Nacional` },
      { text: `Todas las anteriores` },
      { text: `Regional` },
      { text: `Internacional` },
    ]);

    const q_5430b235_1587_4519_8427_84bf0905e29c = await saveQuestion(manager, {
      text: `Canal de comercialización del cacao`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5430b235_1587_4519_8427_84bf0905e29c, [
      { text: `Otro`, isOther: true },
      { text: `Industria / Transformador` },
      { text: `Venta directa local` },
      { text: `Intermediario / Acopiador` },
      { text: `Cooperativa / Asociación` },
      { text: `Exportación directa` },
      { text: `Comercializador nacional` },
    ]);

    const q_f95b8042_dd15_47fc_971c_75373cff8e14 = await saveQuestion(manager, {
      text: `¿Tiene alguna certificación?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f95b8042_dd15_47fc_971c_75373cff8e14, [
      { text: `Otro`, isOther: true },
      { text: `Ninguna` },
      { text: `Denominación de Origen` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `Orgánico NTC/USDA` },
      { text: `UTZ` },
      { text: `Rainforest Alliance` },
    ]);

    await saveQuestion(manager, {
      text: `Precio promedio de venta (COP / kg cacao seco)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular una alerta cuando el tiempo de fermentación configurado haya terminado, para evitar sobre-procesamiento del cacao.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me gustaría registrar en una app los parámetros de secado de cacao (temperatura, tiempo, humedad final) de cada lote, para comparar y mejorar de lote a lote.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Me sería útil tener disponible en una aplicación tablas de referencia de humedad y tiempo de fermentación, y tutoriales de buenas prácticas de poscosecha de cacao.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Me sería útil que la app me mostrara el precio de mercado actualizado del cacao seco para negociar mejor con el comprador.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_5 = await saveQuestion(manager, {
      text: `Me gustaría llevar un registro digital de cada venta de cacao realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_strat_5, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (36 preguntas).`);
}
