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

const NAME = `S2.6: Bloque Cannabis`;
const VERSION = 1;

export async function seedInstrumentoS26BloqueCannabis(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["numeric", "open_text", "single_choice", "yes_no"];
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
    sectionRepo.create({ name: `2.6 Información del Cultivo de Cannabis`, order: 1, instrument }),
  );

  // ── 2.6 Información del Cultivo de Cannabis ──
  {
    let o = 1;

    const q_7a0f5971_c616_4be5_9c90_41349f1aed73 = await saveQuestion(manager, {
      text: `2.6.1 ★ — Sistema de cultivo de cannabis`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_7a0f5971_c616_4be5_9c90_41349f1aed73, [
      { text: `Aeroponía` },
      { text: `Hidroponía` },
      { text: `Mixto` },
      { text: `Otro`, isOther: true },
      { text: `Suelo` },
      { text: `Sustrato` },
    ]);

    const q_f788867e_032c_4996_a9aa_c1a4c359e3f9 = await saveQuestion(manager, {
      text: `2.6.2 ★ — Condición de cultivo de cannabis`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f788867e_032c_4996_a9aa_c1a4c359e3f9, [
      { text: `Campo abierto` },
      { text: `Indoor (cuarto de cultivo)` },
      { text: `Invernadero` },
      { text: `Mixto` },
    ]);

    await saveQuestion(manager, {
      text: `2.6.3 ★ — Área cultivada en cannabis (Indique valor y unidad: ha o m²)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.6.4 ★ — Material genético / variedad de cannabis (nombre comercial o código)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f5e22266_8e67_4a20_b147_a8b8c1eb5c76 = await saveQuestion(manager, {
      text: `2.6.5 — ¿Tiene más de una variedad de cannabis?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Liste cada variedad con su porcentaje`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_f5e22266_8e67_4a20_b147_a8b8c1eb5c76,
      conditionValue: 'true',
    });

    const q_d1b916a6_a77b_4761_8ef8_49bf905d1090 = await saveQuestion(manager, {
      text: `2.6.6 ★ — Tipo de producción predominante en cannabis`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d1b916a6_a77b_4761_8ef8_49bf905d1090, [
      { text: `Extractos` },
      { text: `Flor seca` },
      { text: `Mixto` },
      { text: `Semillas` },
    ]);

    await saveQuestion(manager, {
      text: `2.6.7 — Ciclos de producción de cannabis por año`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.6.8 ★ — Producción promedio de cannabis (Indique valor y unidad: kg flor seca o extracto / año)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_14c73380_825c_42ef_950c_4f821a35b0f7 = await saveQuestion(manager, {
      text: `¿Cuenta con licencia vigente de cannabis?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_14c73380_825c_42ef_950c_4f821a35b0f7, [
      { text: `En trámite` },
      { text: `No tiene licencia` },
      { text: `Semillas / Material vegetal (ICA)` },
      { text: `Uso adulto (Ley 2204/2022)` },
      { text: `Uso médico y científico (Ley 1787/2016)` },
    ]);

    const q_d6a3aed1_81b1_428b_b439_8ed98502f259 = await saveQuestion(manager, {
      text: `¿Cuenta con alguna certificación o está en proceso?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d6a3aed1_81b1_428b_b439_8ed98502f259, [
      { text: `Denominación de Origen` },
      { text: `Fair Trade / Comercio Justo` },
      { text: `Ninguna` },
      { text: `Orgánico NTC / USDA` },
      { text: `Otro`, isOther: true },
      { text: `Rainforest Alliance` },
      { text: `UTZ` },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene registros productivos históricos de cannabis?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (12 preguntas).`);
}
