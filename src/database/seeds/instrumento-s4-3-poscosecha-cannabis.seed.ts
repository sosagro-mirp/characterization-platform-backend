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

  const typeNames = ["multiple_choice","single_choice","yes_no","numeric","open_text"];
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
    sectionRepo.create({ name: `4.3 Cannabis — Poscosecha`, order: 1, instrument }),
  );

  // ── 4.3 Cannabis — Poscosecha ──
  {
    let o = 1;

    const q_efb262d9_545d_4f3b_8a30_6f85e6d6a3b1 = await saveQuestion(manager, {
      text: `4.3 — Actividades de poscosecha que realiza en cannabis`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_efb262d9_545d_4f3b_8a30_6f85e6d6a3b1, [
      { text: `Extracción (aceites, resinas, etc.)` },
      { text: `Curado` },
      { text: `Despalillado / Trimming` },
      { text: `Clasificación` },
      { text: `Secado` },
      { text: `Empaque y embalaje` },
      { text: `Cosecha (corte de planta)` },
    ]);

    const q_57edabc6_5022_43e5_a13b_32d8cf6c37ba = await saveQuestion(manager, {
      text: `4.3.1 ★ — Tipo de licencia con que opera`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_57edabc6_5022_43e5_a13b_32d8cf6c37ba, [
      { text: `No tiene licencia` },
      { text: `Semillas / Material vegetal (ICA)` },
      { text: `Uso adulto (ley 2204/2022)` },
      { text: `En trámite` },
      { text: `Uso médico y científico (ley 1787/2016)` },
    ]);

    const q_be0ddfa6_d202_47dc_89be_72f7ebc7454e = await saveQuestion(manager, {
      text: `4.3.2 ★ — ¿Controla el porcentaje de humedad en flor seca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.3.2b — Valor habitual de humedad en flor seca (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_be0ddfa6_d202_47dc_89be_72f7ebc7454e,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `4.3.3 ★ — ¿Mide el contenido de CBD y/o THC con análisis de laboratorio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.3.4 ★ — ¿Tiene análisis microbiológicos de sus productos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `4.3.5 ★ — ¿Realiza pruebas de pesticidas y metales pesados?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_14638379_14fc_4048_9045_239cfa9f60c9 = await saveQuestion(manager, {
      text: `4.3.6 ★ — ¿Cuenta con Buenas Prácticas de Manufactura certificadas (INVIMA)?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_14638379_14fc_4048_9045_239cfa9f60c9, [
      { text: `Sí` },
      { text: `No` },
      { text: `En trámite` },
    ]);

    await saveQuestion(manager, {
      text: `4.3.7 — ¿Tiene alguna certificación de calidad?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_66114bae_41ec_48e4_ba7e_5a4a601e6681 = await saveQuestion(manager, {
      text: `4.3.8 ★ — Destino principal del producto`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_66114bae_41ec_48e4_ba7e_5a4a601e6681, [
      { text: `Otro`, isOther: true },
      { text: `Exportación directa` },
      { text: `Intermediario / Acopiador` },
      { text: `Industria / transformador` },
      { text: `Cooperativa / Asociación` },
      { text: `Comercializador nacional` },
      { text: `Venta directa local` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (10 preguntas).`);
}
