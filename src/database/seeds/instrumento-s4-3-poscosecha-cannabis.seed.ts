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

const NAME = `S4.3: Poscosecha Cannabis`;
const VERSION = 1;

export async function seedInstrumentoS43PoscosechaCannabis(manager: EntityManager): Promise<void> {
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
    sectionRepo.create({ name: `4.3 Cannabis — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.3 Cannabis — Poscosecha ──
  {
    let o = 1;

    const q_efb262d9_545d_4f3b_8a30_6f85e6d6a3b1 = await saveQuestion(manager, {
      text: `Actividades de poscosecha que realiza en cannabis`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_efb262d9_545d_4f3b_8a30_6f85e6d6a3b1, [
      { text: `Clasificación` },
      { text: `Empaque y embalaje` },
      { text: `Cosecha (corte de planta)` },
      { text: `Secado` },
      { text: `Curado` },
      { text: `Despalillado / Trimming` },
      { text: `Extracción (aceites, resinas, etc.)` },
    ]);

    const q_57edabc6_5022_43e5_a13b_32d8cf6c37ba = await saveQuestion(manager, {
      text: `¿Tipo de licencia con que opera?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_57edabc6_5022_43e5_a13b_32d8cf6c37ba, [
      { text: `No tiene licencia` },
      { text: `Semillas / material vegetal (ICA)` },
      { text: `Uso adulto (ley 2204/2022)` },
      { text: `Uso médico y científico (ley 1787/2016)` },
      { text: `En trámite` },
    ]);

    const q_be0ddfa6_d202_47dc_89be_72f7ebc7454e = await saveQuestion(manager, {
      text: `¿Controla el porcentaje de humedad en flor seca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Valor habitual de humedad en flor seca (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_be0ddfa6_d202_47dc_89be_72f7ebc7454e,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Mide el contenido de CBD y/o THC con análisis de laboratorio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Tiene análisis microbiológicos de sus productos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Realiza pruebas de pesticidas y metales pesados?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_14638379_14fc_4048_9045_239cfa9f60c9 = await saveQuestion(manager, {
      text: `¿Cuenta con Buenas Prácticas de Manufactura certificadas (INVIMA)?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_14638379_14fc_4048_9045_239cfa9f60c9, [
      { text: `Sí` },
      { text: `En trámite` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene alguna certificación de calidad?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_66114bae_41ec_48e4_ba7e_5a4a601e6681 = await saveQuestion(manager, {
      text: `Destino principal del producto`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_66114bae_41ec_48e4_ba7e_5a4a601e6681, [
      { text: `Comercializador nacional` },
      { text: `Industria / Transformador` },
      { text: `Venta directa local` },
      { text: `Intermediario / Acopiador` },
      { text: `Cooperativa / Asociación` },
      { text: `Exportación directa` },
      { text: `Otro`, isOther: true },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular una alerta cuando el tiempo de curado del cannabis configurado haya terminado, para evitar sobre-procesamiento de la flor.`,
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
      text: `Me gustaría registrar en una app los parámetros de secado de cannabis (temperatura, humedad relativa, días) de cada lote, para mejorar ciclo a ciclo.`,
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
      text: `Me sería útil tener en una aplicación tablas de referencia de humedad óptima de la flor seca y buenas prácticas INVIMA para la poscosecha de cannabis.`,
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
      text: `Me sería útil que la app me mostrara el precio de mercado actualizado de la flor seca de cannabis para negociar mejor con los compradores.`,
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
      text: `Me gustaría llevar un registro digital de cada venta de cannabis realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.`,
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

  console.log(`[seed] "${NAME}" insertado (15 preguntas).`);
}
