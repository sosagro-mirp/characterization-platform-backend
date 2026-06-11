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

const NAME = `S2.7: Bloque Cáñamo`;
const VERSION = 1;

export async function seedInstrumentoS27BloqueCanamo(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["single_choice","numeric","open_text","yes_no"];
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
    sectionRepo.create({ name: `2.7 Información del Cultivo de Cáñamo`, order: 1, instrument }),
  );

  // ── 2.7 Información del Cultivo de Cáñamo ──
  {
    let o = 1;

    const q_b7a83883_6cdb_4741_9259_39566983e0af = await saveQuestion(manager, {
      text: `2.7.1 ★ — Sistema de cultivo de cáñamo`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_b7a83883_6cdb_4741_9259_39566983e0af, [
      { text: `Otro`, isOther: true },
      { text: `Aeroponía` },
      { text: `Suelo` },
      { text: `Sustrato` },
      { text: `Hidroponía` },
      { text: `Mixto` },
    ]);

    const q_b90f538b_adfc_41a4_ad76_5865ac994c1d = await saveQuestion(manager, {
      text: `2.7.2 ★ — Condición de cultivo de cáñamo`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_b90f538b_adfc_41a4_ad76_5865ac994c1d, [
      { text: `Mixto` },
      { text: `Invernadero` },
      { text: `Indoor (cuarto de cultivo)` },
      { text: `Campo abierto` },
    ]);

    await saveQuestion(manager, {
      text: `2.7.3 ★ — Área cultivada en cáñamo (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.7.4 ★ — Variedad / material genético de cáñamo`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_80779c39_1cb6_4bd3_a0ec_174c06dbdd6b = await saveQuestion(manager, {
      text: `2.7.5 — ¿Tiene más de una variedad de cáñamo?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.7.5b — Liste cada variedad con su porcentaje`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_80779c39_1cb6_4bd3_a0ec_174c06dbdd6b,
      conditionValue: 'true',
    });

    const q_2a190c64_0a32_40dd_b5e5_8220de02406b = await saveQuestion(manager, {
      text: `2.7.6 ★ — Producto principal del cultivo de cáñamo`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_2a190c64_0a32_40dd_b5e5_8220de02406b, [
      { text: `Fibra` },
      { text: `Semilla` },
      { text: `Múltiple` },
      { text: `CBD` },
    ]);

    await saveQuestion(manager, {
      text: `2.7.7 — Ciclos de producción de cáñamo por año`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.7.8 ★ — Producción promedio de cáñamo (kg / ha / año)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f3623856_df19_4a46_8135_713efc476f7d = await saveQuestion(manager, {
      text: `2.7.9 ★ — ¿Cuenta con licencia vigente de cáñamo? (Adjuntar documento)`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f3623856_df19_4a46_8135_713efc476f7d, [
      { text: `En trámite` },
      { text: `No tiene licencia` },
      { text: `Uso adulto (Ley 2204/2022)` },
      { text: `Semillas / Material vegetal (ICA)` },
      { text: `Uso médico y científico (Ley 1787/2016)` },
    ]);

    await saveQuestion(manager, {
      text: `2.7.10 ★ — ¿Verifica que el contenido de THC sea ≤ 1%? (Requisito legal)`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.7.11 ★ — ¿Tiene registros productivos de cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (12 preguntas).`);
}
