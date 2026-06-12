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

  const typeNames = ["multiple_choice","single_choice","numeric","yes_no"];
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
    sectionRepo.create({ name: `4.2 Café — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.2 Café — Poscosecha ──
  {
    let o = 1;

    const q_239c01e6_b68e_4622_8645_546db8d58046 = await saveQuestion(manager, {
      text: `4.2 — Actividades de poscosecha que realiza en café`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_239c01e6_b68e_4622_8645_546db8d58046, [
      { text: `Trillado` },
      { text: `Fermentación (vía húmeda)` },
      { text: `Recolección selectiva (solo cerezas maduras)` },
      { text: `Despulpado` },
      { text: `Tostión` },
      { text: `Lavado` },
      { text: `Secado` },
      { text: `Clasificación de grano` },
    ]);

    const q_cbc03f25_3c19_4836_8178_eb8c5d03d909 = await saveQuestion(manager, {
      text: `4.2.1 ★ — Método de beneficio predominante`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_cbc03f25_3c19_4836_8178_eb8c5d03d909, [
      { text: `Vía húmeda (fermentación + lavado)` },
      { text: `Mixto` },
      { text: `Vía seca (natural / honey)` },
      { text: `Semi-húmedo (honey)` },
    ]);

    await saveQuestion(manager, {
      text: `4.2.2 ★ — Tiempo de fermentación (horas)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_639c6e23_d846_4bd9_91f7_adba59827e98 = await saveQuestion(manager, {
      text: `4.2.3 ★ — ¿Controla la humedad del café pergamino seco?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.2.3b — Valor habitual de humedad del pergamino seco (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_639c6e23_d846_4bd9_91f7_adba59827e98,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `4.2.4 ★ — ¿Realiza catación / evaluación sensorial?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.2.5 — Puntaje promedio en taza (SCA score)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_0e0959cb_7dc1_4a6d_93e4_aac1d60a350f = await saveQuestion(manager, {
      text: `4.2.6 ★ — ¿Conoce la Norma de Calidad de la FNC / NTC 2090?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_0e0959cb_7dc1_4a6d_93e4_aac1d60a350f, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);

    const q_3f74dee2_7c36_4b67_9151_0364e92cee57 = await saveQuestion(manager, {
      text: `4.2.7 ★ — Tipo de café que comercializa actualmente`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3f74dee2_7c36_4b67_9151_0364e92cee57, [
      { text: `Café tostado` },
      { text: `Café cereza` },
      { text: `Café pergamino húmedo` },
      { text: `Café especial` },
      { text: `Café trillado / excelso` },
      { text: `Café pergamino seco` },
    ]);

    const q_79b8853a_a154_4125_9861_a06e9e2d3e26 = await saveQuestion(manager, {
      text: `4.2.8 — ¿Tiene alguna certificación?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_79b8853a_a154_4125_9861_a06e9e2d3e26, [
      { text: `UTZ` },
      { text: `Orgánico NTC/USDA` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `Otro`, isOther: true },
      { text: `Denominación de Origen` },
      { text: `Rainforest Alliance` },
      { text: `Ninguna` },
    ]);

    await saveQuestion(manager, {
      text: `4.2.9 — Precio promedio de venta (COP / carga pergamino seco)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (11 preguntas).`);
}
