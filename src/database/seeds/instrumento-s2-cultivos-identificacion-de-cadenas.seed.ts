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
    systemField?: string;
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
    systemField: def.systemField,
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

const NAME = `S2. Cultivos — Identificación de Cadenas`;
const VERSION = 1;

export async function seedInstrumentoS2CultivosIdentificacionDeCadenas(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["yes_no","multiple_choice","single_choice"];
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
      code: 'S2',
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `2.1 Cultivos y Etapas de la Cadena`, order: 1, instrument }),
  );

  // ── 2.1 Cultivos y Etapas de la Cadena ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `2.1a ★ — ¿Cultiva actualmente Cacao?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.Cacao',
    });

    await saveQuestion(manager, {
      text: `2.1b ★ — ¿Cultiva actualmente Café?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.Café',
    });

    await saveQuestion(manager, {
      text: `2.1c ★ — ¿Cultiva actualmente Cannabis?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.Cannabis',
    });

    await saveQuestion(manager, {
      text: `2.1d ★ — ¿Cultiva actualmente Cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.Cáñamo',
    });

    const q_bb845c10_5def_41be_aac1_46d7dabcfb05 = await saveQuestion(manager, {
      text: `2.2 ★ — ¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_bb845c10_5def_41be_aac1_46d7dabcfb05, [
      { text: `Exportación` },
      { text: `Cultivo / producción en campo` },
      { text: `Cosecha` },
      { text: `Transformación industrial` },
      { text: `Poscosecha / procesamiento` },
      { text: `Comercialización directa` },
    ]);

    const q_b05d66f7_404e_46a6_aac8_5774b5bc777f = await saveQuestion(manager, {
      text: `2.3 — ¿Procesa materia prima propia, de terceros o ambas?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_b05d66f7_404e_46a6_aac8_5774b5bc777f, [
      { text: `Propia` },
      { text: `Ambas` },
      { text: `De terceros` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (6 preguntas).`);
}
