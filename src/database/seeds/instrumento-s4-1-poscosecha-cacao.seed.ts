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
    order: number;
    section: Section;
    conditionQuestion?: Question;
    conditionValue?: string;
  },
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(repo.create({
    text: def.text,
    type: def.type,
    isRequired: def.isRequired,
    isSelectionCriteria: def.isSelectionCriteria ?? false,
    order: def.order,
    section: def.section,
    conditionQuestion: def.conditionQuestion,
    conditionValue: def.conditionValue,
  }));
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; value?: number; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(repo.create({
      question,
      text: opt.text,
      value: opt.value,
      isOther: opt.isOther ?? false,
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

  const typeNames = ["multiple_choice","yes_no","single_choice","open_text","numeric"];
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

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `4.1 Cacao — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.1 Cacao — Poscosecha ──
  {
    let o = 1;

    const q_d4839467_79af_4f9d_8005_87906942004e = await saveQuestion(manager, {
      text: `4.1 — Actividades de poscosecha que realiza en cacao`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d4839467_79af_4f9d_8005_87906942004e, [
      { text: `Transformación del grano` },
      { text: `Cosecha selectiva por madurez` },
      { text: `Empaque y etiquetado` },
      { text: `Secado` },
      { text: `Fermentación` },
      { text: `Clasificación / selección de grano` },
      { text: `Almacenamiento` },
      { text: `Desgrane / apertura de mazorcas` },
    ]);

    await saveQuestion(manager, {
      text: `4.1.1 ★ — ¿Realiza fermentación?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_195a4961_8455_4872_9236_283c1f05c447 = await saveQuestion(manager, {
      text: `4.1.2 ★ — ¿En qué tipo de recipiente fermenta?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_195a4961_8455_4872_9236_283c1f05c447, [
      { text: `Sacos de yute` },
      { text: `No realiza fermentación` },
      { text: `Montón` },
      { text: `Cajones de madera` },
      { text: `Otro`, isOther: true },
    ]);

    const q_442d6940_34f0_41e7_8565_5ebc23bb4e6a = await saveQuestion(manager, {
      text: `4.1.3 ★ — ¿Los clones se fermentan por separado o mezclados?`,
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
      text: `4.1.4 — Clones en fermentación actualmente`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.5 ★ — Duración promedio de la fermentación (días)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.6 ★ — ¿Cómo sabe que el grano está bien fermentado? (características visuales, olfativas)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.7 ★ — ¿Qué mediciones realiza durante la fermentación?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.8 ★ — Análisis de control de calidad en finca al cacao fermentado`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.9 — Análisis de control de calidad que manda hacer a laboratorio (fermentado)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.10 — Calidad sensorial habitual de la fermentación`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.11 — ¿Comercializa el grano en estado fermentado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.12 ★ — ¿Realiza secado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f43580a4_cd2c_4707_8480_7920fa7ab24f = await saveQuestion(manager, {
      text: `4.1.13 ★ — Tipo de secado que utiliza`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f43580a4_cd2c_4707_8480_7920fa7ab24f, [
      { text: `Patio de cemento` },
      { text: `Otro`, isOther: true },
      { text: `Marquesina plástica` },
      { text: `Al sol directo sobre lonas` },
      { text: `Secador solar tipo domo` },
      { text: `Secador mecánico` },
    ]);

    await saveQuestion(manager, {
      text: `4.1.14 — ¿Realiza volteos durante el secado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.15 — Frecuencia de volteos durante el secado`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.16 ★ — Duración promedio del secado (días)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.17 ★ — ¿Cómo sabe que el grano está bien seco?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_e1930248_4388_405f_8098_d6af937e3b14 = await saveQuestion(manager, {
      text: `4.1.18 ★ — ¿Mide la humedad final del grano seco?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.18b — Instrumento utilizado para medir humedad`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_e1930248_4388_405f_8098_d6af937e3b14,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `4.1.19 ★ — Humedad final habitual del grano seco (%)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.20 ★ — Análisis de calidad en finca al cacao seco`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.21 — Análisis de calidad al cacao seco que manda a laboratorio`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_10ccd666_6438_4ca0_9da7_168ca30ce88a = await saveQuestion(manager, {
      text: `4.1.22 ★ — ¿Conoce y cumple la NTC 1252?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_10ccd666_6438_4ca0_9da7_168ca30ce88a, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `4.1.23 — ¿Mide el índice de mazorca (IM)?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_51cdca21_1c1d_4ba7_a138_78f8bf49b748 = await saveQuestion(manager, {
      text: `4.1.24 ★ — ¿Mide el peso de 100 granos secos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.1.24b — Valor habitual del peso de 100 granos secos (g)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_51cdca21_1c1d_4ba7_a138_78f8bf49b748,
      conditionValue: 'true',
    });

    const q_6c369f58_5f1a_4b96_9ad9_cb0e425ca2a5 = await saveQuestion(manager, {
      text: `4.1.25 — ¿Comercializa el grano seco? Indique ámbito`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_6c369f58_5f1a_4b96_9ad9_cb0e425ca2a5, [
      { text: `Nacional` },
      { text: `Regional` },
      { text: `Internacional` },
      { text: `Todas las anteriores` },
    ]);

    const q_5430b235_1587_4519_8427_84bf0905e29c = await saveQuestion(manager, {
      text: `4.1.26 ★ — Canal de comercialización del cacao`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5430b235_1587_4519_8427_84bf0905e29c, [
      { text: `Otro`, isOther: true },
      { text: `Comercializador nacional` },
      { text: `Exportación directa` },
      { text: `Cooperativa / Asociación` },
      { text: `Venta directa local` },
      { text: `Industria / transformador` },
      { text: `Intermediario / Acopiador` },
    ]);

    const q_f95b8042_dd15_47fc_971c_75373cff8e14 = await saveQuestion(manager, {
      text: `4.1.27 — ¿Tiene alguna certificación?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f95b8042_dd15_47fc_971c_75373cff8e14, [
      { text: `Denominación de Origen` },
      { text: `Otro`, isOther: true },
      { text: `Orgánico NTC/USDA` },
      { text: `Ninguna` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `Rainforest Alliance` },
      { text: `UTZ` },
    ]);

    await saveQuestion(manager, {
      text: `4.1.28 — Precio promedio de venta (COP / kg cacao seco)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (31 preguntas).`);
}
