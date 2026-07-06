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

const NAME = `S4.2: Poscosecha Café`;
const VERSION = 1;

export async function seedInstrumentoS42PoscosechaCafe(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "multiple_choice", "numeric", "single_choice", "yes_no"];
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
    sectionRepo.create({ name: `4.2 Café — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.2 Café — Poscosecha ──
  {
    let o = 1;

    const q_239c01e6_b68e_4622_8645_546db8d58046 = await saveQuestion(manager, {
      text: `Actividades de poscosecha que realiza en café`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_239c01e6_b68e_4622_8645_546db8d58046, [
      { text: `Lavado` },
      { text: `Secado` },
      { text: `Recolección selectiva (solo cerezas maduras)` },
      { text: `Trillado` },
      { text: `Tostión` },
      { text: `Clasificación de grano` },
      { text: `Despulpado` },
      { text: `Fermentación (vía húmeda)` },
    ]);

    const q_cbc03f25_3c19_4836_8178_eb8c5d03d909 = await saveQuestion(manager, {
      text: `Método de beneficio predominante`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_cbc03f25_3c19_4836_8178_eb8c5d03d909, [
      { text: `Mixto` },
      { text: `Vía húmeda (fermentación + lavado)` },
      { text: `Vía seca (natural / honey)` },
      { text: `Semi-húmedo (honey)` },
    ]);

    await saveQuestion(manager, {
      text: `Tiempo de fermentación (horas)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_639c6e23_d846_4bd9_91f7_adba59827e98 = await saveQuestion(manager, {
      text: `¿Controla la humedad del café pergamino seco?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Valor habitual de humedad del pergamino seco (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_639c6e23_d846_4bd9_91f7_adba59827e98,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Realiza catación / evaluación sensorial?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Puntaje promedio en taza (SCA score)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_0e0959cb_7dc1_4a6d_93e4_aac1d60a350f = await saveQuestion(manager, {
      text: `¿Conoce la Norma de Calidad de la FNC / NTC 2090?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_0e0959cb_7dc1_4a6d_93e4_aac1d60a350f, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_3f74dee2_7c36_4b67_9151_0364e92cee57 = await saveQuestion(manager, {
      text: `Tipo de café que comercializa actualmente`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3f74dee2_7c36_4b67_9151_0364e92cee57, [
      { text: `Café cereza` },
      { text: `Café especial` },
      { text: `Café tostado` },
      { text: `Café trillado / excelso` },
      { text: `Café pergamino seco` },
      { text: `Café pergamino húmedo` },
    ]);

    const q_79b8853a_a154_4125_9861_a06e9e2d3e26 = await saveQuestion(manager, {
      text: `¿Tiene alguna certificación?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_79b8853a_a154_4125_9861_a06e9e2d3e26, [
      { text: `Ninguna` },
      { text: `Rainforest Alliance` },
      { text: `Otro`, isOther: true },
      { text: `UTZ` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `Orgánico NTC/USDA` },
      { text: `Denominación de Origen` },
    ]);

    await saveQuestion(manager, {
      text: `Precio promedio de venta (COP / carga pergamino seco)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular una alerta cuando el tiempo de beneficio o fermentación del café configurado haya terminado, para evitar sobre-fermentación.`,
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
      text: `Me gustaría registrar en una app los parámetros de secado del café (temperatura, tiempo, humedad final del pergamino) de cada lote, para mejorar proceso a proceso.`,
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
      text: `Me sería útil tener en una aplicación tablas de referencia de humedad óptima del café pergamino seco y tutoriales de buenas prácticas de beneficio.`,
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
      text: `Me sería útil que la app me mostrara el precio de referencia del café pergamino seco actualizado para negociar mejor con compradores o intermediarios.`,
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
      text: `Me gustaría llevar un registro digital de cada venta de café realizada (cantidad, precio, comprador) para consultar mi historial de comercialización sin depender de anotaciones en papel.`,
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

  console.log(`[seed] "${NAME}" insertado (16 preguntas).`);
}
