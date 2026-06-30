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

const NAME = `S8B: Infraestructura de Poscosecha Café`;
const VERSION = 1;

export async function seedInstrumentoS8bInfraestructuraDePoscosechaCafe(manager: EntityManager): Promise<void> {
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
    sectionRepo.create({ name: `8B Infraestructura de Poscosecha — Café`, order: 1, instrument }),
  );

  // ── 8B Infraestructura de Poscosecha — Café ──
  {
    let o = 1;

    const q_4f2ed018_e8fc_420c_b0bb_fa9a9590ca11 = await saveQuestion(manager, {
      text: `¿Con cuál de las siguientes instalaciones para café cuenta en su finca?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_4f2ed018_e8fc_420c_b0bb_fa9a9590ca11, [
      { text: `Báscula / balanza` },
      { text: `Área de empaque y etiquetado` },
      { text: `Equipo de catación / cata en taza` },
      { text: `Bodega para café pergamino seco` },
      { text: `Tostadora` },
      { text: `Trilladora` },
      { text: `Secador mecánico / guardiola` },
      { text: `Patio de cemento para secado` },
      { text: `Marquesina para secado` },
      { text: `Canal de correteo` },
      { text: `Pilas de fermentación` },
      { text: `Despulpadora (cilíndrica o de disco)` },
      { text: `Beneficiadero (área completa de beneficio húmedo)` },
    ]);

    await saveQuestion(manager, {
      text: `Capacidad de la despulpadora (valor numérico)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_a7cfb090_9da0_4f3f_a602_4f6d339d63ba = await saveQuestion(manager, {
      text: `Unidad de capacidad de la despulpadora`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a7cfb090_9da0_4f3f_a602_4f6d339d63ba, [
      { text: `kg / hora` },
      { text: `cargas / día` },
    ]);

    await saveQuestion(manager, {
      text: `Capacidad de las pilas de fermentación (valor numérico)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_8a0a36a1_fe54_4b10_b544_4265f0b1578b = await saveQuestion(manager, {
      text: `Unidad de capacidad de las pilas de fermentación`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8a0a36a1_fe54_4b10_b544_4265f0b1578b, [
      { text: `L` },
      { text: `kg` },
    ]);

    await saveQuestion(manager, {
      text: `Área de secado disponible (m²)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Capacidad de almacenamiento de café pergamino seco (valor numérico)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_caff962f_d16d_4228_91e4_d9ecbc0b096d = await saveQuestion(manager, {
      text: `Unidad de capacidad de almacenamiento`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_caff962f_d16d_4228_91e4_d9ecbc0b096d, [
      { text: `kg` },
      { text: `cargas` },
    ]);

    await saveQuestion(manager, {
      text: `¿La bodega tiene control de humedad?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Tiene tomas eléctricas disponibles en el área de beneficio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil contar con un inventario digital de mi infraestructura de beneficio de café (beneficiadero, despulpadora, marquesinas, bodega), al que pueda acceder desde el celular para gestionar apoyos de mejora.`,
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
      text: `Me gustaría recibir alertas de mantenimiento de mis equipos de beneficio de café según el ciclo de uso que yo mismo registre.`,
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
      text: `Me sería útil una guía digital que me indicara las especificaciones técnicas ideales de infraestructura de beneficio de café para cumplir estándares NTC 2090.`,
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
      text: `Me sería útil que una app me calculara cuánto café puedo beneficiar por ciclo con mi infraestructura actual, para planear mejor la cosecha.`,
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
