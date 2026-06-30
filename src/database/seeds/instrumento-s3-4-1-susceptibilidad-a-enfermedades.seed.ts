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

const NAME = `S3.4.1: Susceptibilidad a Enfermedades`;
const VERSION = 1;

export async function seedInstrumentoS341SusceptibilidadAEnfermedades(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["open_text", "single_choice"];
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
    sectionRepo.create({ name: `3.4.1 Susceptibilidad a enfermedades — Cacao`, order: 1, instrument }),
  );

  // ── 3.4.1 Susceptibilidad a enfermedades — Cacao ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Susceptibilidad a enfermedad o plaga — ¿Cuál?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_19d5fb5a_3ac9_4d49_a200_57618b5dda6a = await saveQuestion(manager, {
      text: `Susceptibilidad a Fitóftora / Monilia`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_19d5fb5a_3ac9_4d49_a200_57618b5dda6a, [
      { text: `MS (Muy susceptible)` },
      { text: `MR (Moderadamente resistente)` },
      { text: `S (Susceptible)` },
      { text: `R (Resistente)` },
    ]);

    const q_3fe8f7dd_201a_4580_baa8_bfd957a53b65 = await saveQuestion(manager, {
      text: `Susceptibilidad a Escoba de Bruja`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3fe8f7dd_201a_4580_baa8_bfd957a53b65, [
      { text: `S (Susceptible)` },
      { text: `MS (Muy susceptible)` },
      { text: `MR (Moderadamente resistente)` },
      { text: `R (Resistente)` },
    ]);

    const q_55c9d143_7a24_4967_9529_10da3df29401 = await saveQuestion(manager, {
      text: `Susceptibilidad a Monilia`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_55c9d143_7a24_4967_9529_10da3df29401, [
      { text: `MR (Moderadamente resistente)` },
      { text: `MS (Muy susceptible)` },
      { text: `S (Susceptible)` },
      { text: `R (Resistente)` },
    ]);

    const q_bf6689c1_3517_4817_a5c7_1b3aaa9680cf = await saveQuestion(manager, {
      text: `Susceptibilidad a Mal Rosado`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_bf6689c1_3517_4817_a5c7_1b3aaa9680cf, [
      { text: `S (Susceptible)` },
      { text: `MS (Muy susceptible)` },
      { text: `MR (Moderadamente resistente)` },
      { text: `R (Resistente)` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (5 preguntas).`);
}
