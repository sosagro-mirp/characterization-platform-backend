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

const NAME = `S4.4: Poscosecha Cáñamo`;
const VERSION = 1;

export async function seedInstrumentoS44PoscosechaCanamo(manager: EntityManager): Promise<void> {
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
    sectionRepo.create({ name: `4.4 Cáñamo — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.4 Cáñamo — Poscosecha ──
  {
    let o = 1;

    const q_2267bc3f_7a29_497a_a1bc_71c33691aef9 = await saveQuestion(manager, {
      text: `Actividades de poscosecha que realiza en cáñamo`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_2267bc3f_7a29_497a_a1bc_71c33691aef9, [
      { text: `Secado de fibra / semilla / flor` },
      { text: `Empaque` },
      { text: `Prensado de semilla / aceite` },
      { text: `Extracción de CBD` },
      { text: `Clasificación de fibra` },
      { text: `Desfibrado` },
      { text: `Cosecha mecánica / manual` },
    ]);

    const q_63497df5_35dd_4ef4_bd85_3eca40d24fc3 = await saveQuestion(manager, {
      text: `Tipo de licencia con que opera`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_63497df5_35dd_4ef4_bd85_3eca40d24fc3, [
      { text: `Uso médico y científico (ley 1787/2016)` },
      { text: `Uso adulto (ley 2204/2022)` },
      { text: `Semillas / material vegetal (ICA)` },
      { text: `En trámite` },
      { text: `No tiene licencia` },
    ]);

    const q_e2952f86_0c05_4795_9a8c_62f0fc5eb618 = await saveQuestion(manager, {
      text: `Producto principal obtenido`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_e2952f86_0c05_4795_9a8c_62f0fc5eb618, [
      { text: `CBD` },
      { text: `Semilla` },
      { text: `Fibra` },
      { text: `Múltiple` },
    ]);

    const q_144f9486_6a48_41f2_ab8f_b5c7472b8ef3 = await saveQuestion(manager, {
      text: `¿Mide contenido de CBD en materia seca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Valor habitual de CBD en materia seca (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_144f9486_6a48_41f2_ab8f_b5c7472b8ef3,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Verifica que el THC sea ≤ 1% (requisito legal)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_b0e9fe5f_2130_43aa_992d_82e547c354d6 = await saveQuestion(manager, {
      text: `¿Controla la humedad en el secado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Valor objetivo de humedad en el secado (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b0e9fe5f_2130_43aa_992d_82e547c354d6,
      conditionValue: 'true',
    });

    const q_7664ecc9_a891_4311_a7ce_e38973583706 = await saveQuestion(manager, {
      text: `¿Tiene alguna certificación?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_7664ecc9_a891_4311_a7ce_e38973583706, [
      { text: `Ninguna` },
      { text: `Otro`, isOther: true },
      { text: `Denominación de Origen` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `UTZ` },
      { text: `Rainforest Alliance` },
      { text: `Orgánico NTC/USDA` },
    ]);

    const q_d063fe28_f736_4ec1_9e01_01d9df8ba097 = await saveQuestion(manager, {
      text: `Destino principal del producto`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d063fe28_f736_4ec1_9e01_01d9df8ba097, [
      { text: `Venta directa local` },
      { text: `Cooperativa / Asociación` },
      { text: `Intermediario / Acopiador` },
      { text: `Exportación directa` },
      { text: `Industria / Transformador` },
      { text: `Comercializador nacional` },
      { text: `Otro`, isOther: true },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil recibir en mi celular una alerta cuando el proceso de secado de cáñamo configurado haya terminado, para evitar deterioro del producto.`,
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
      text: `Me gustaría registrar en una app los parámetros de secado de fibra, semilla o flor de cáñamo por lote, para mejorar el proceso ciclo a ciclo.`,
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
      text: `Me sería útil que la app me indicara el precio de mercado actualizado de la fibra, semilla o CBD de cáñamo para negociar mejor con los compradores.`,
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
      text: `Me gustaría llevar un registro digital de cada venta de cáñamo realizada (cantidad, precio, comprador) para consultar mi historial de comercialización.`,
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

  }

  console.log(`[seed] "${NAME}" insertado (14 preguntas).`);
}
