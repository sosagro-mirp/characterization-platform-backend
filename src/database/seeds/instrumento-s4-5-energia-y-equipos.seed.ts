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

const NAME = `S4.5: Energía y Equipos`;
const VERSION = 1;

export async function seedInstrumentoS45EnergiaYEquipos(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice"];
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
    sectionRepo.create({ name: `4.5 Energía y equipos utilizados en el proceso`, order: 1, instrument }),
  );

  // ── 4.5 Energía y equipos utilizados en el proceso ──
  {
    let o = 1;

    const q_14f4a76c_9bfe_43ef_a64d_4dfd004e01c0 = await saveQuestion(manager, {
      text: `¿Qué equipos utiliza en sus procesos?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_14f4a76c_9bfe_43ef_a64d_4dfd004e01c0, [
      { text: `Calderas` },
      { text: `Hornos` },
      { text: `Ninguno` },
      { text: `Otro`, isOther: true },
      { text: `Secadores` },
      { text: `Tostadores` },
    ]);

    const q_3977b8d0_cc99_423f_9e69_078f09b219da = await saveQuestion(manager, {
      text: `¿Qué combustibles utiliza en los procesos?`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3977b8d0_cc99_423f_9e69_078f09b219da, [
      { text: `Biogás / biocombustible` },
      { text: `Carbón` },
      { text: `Electricidad` },
      { text: `Gas natural / propano` },
      { text: `Leña` },
      { text: `Otro`, isOther: true },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (2 preguntas).`);
}
