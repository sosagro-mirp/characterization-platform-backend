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

const NAME = `S8A: Infraestructura de Poscosecha Cacao`;
const VERSION = 1;

export async function seedInstrumentoS8aInfraestructuraDePoscosechaCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "single_choice", "yes_no"];
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
    sectionRepo.create({ name: `8A Infraestructura de Poscosecha — Cacao`, order: 1, instrument }),
  );

  // ── 8A Infraestructura de Poscosecha — Cacao ──
  {
    let o = 1;

    const q_33de0422_c44d_4bed_bca0_aa94220ffc9f = await saveQuestion(manager, {
      text: `¿Con cuál de las siguientes instalaciones para cacao cuenta en su finca?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_33de0422_c44d_4bed_bca0_aa94220ffc9f, [
      { text: `Bodega / almacén para cacao seco` },
      { text: `Báscula o balanza` },
      { text: `Cajones de fermentación de madera` },
      { text: `Clasificadora / seleccionadora de grano` },
      { text: `Higrómetro (medidor de humedad)` },
      { text: `Marquesina plástica para secado` },
      { text: `Patio de cemento para secado` },
      { text: `Sacos / cajas para fermentación` },
      { text: `Secador mecánico` },
      { text: `Secador solar tipo domo / carpa` },
      { text: `Termómetro (para fermentación y/o secado)` },
      { text: `Área de empaque y etiquetado` },
      { text: `Área de recepción y clasificación de mazorcas` },
    ]);

    await saveQuestion(manager, {
      text: `8A.2 ★ — Capacidad de los cajones de fermentación (valor numérico)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_ddff4b78_434f_4945_888e_938274a0ea3f = await saveQuestion(manager, {
      text: `8A.2b ★ — Unidad de capacidad de los cajones`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_ddff4b78_434f_4945_888e_938274a0ea3f, [
      { text: `kg` },
      { text: `litros` },
    ]);

    await saveQuestion(manager, {
      text: `8A.3 ★ — Número de cajones de fermentación disponibles`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Los cajones tienen tapas / cubiertas para mantener temperatura?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8A.5 ★ — Área de secado disponible (m²)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8A.6 ★ — Capacidad de almacenamiento de cacao seco (kg)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8A.7 ★ — ¿La bodega tiene control de humedad y temperatura?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Tiene tomas eléctricas disponibles en el área de poscosecha?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (9 preguntas).`);
}
