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

const NAME = `S10: Interés en Participar en el Proyecto`;
const VERSION = 1;

export async function seedInstrumentoS10InteresEnParticiparEnElProyecto(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "open_text", "single_choice", "yes_no"];
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

  const [sec1, sec2, sec3] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `Socialización del proyecto`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Modalidad de participación deseada`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Condiciones de participación`, order: 3, instrument }))
  ]);

  // ── Socialización del proyecto ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Antes de este taller, ¿conocía el proyecto SOS AGRO?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cómo se enteró del proyecto?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_8e0d7c60_892f_40c0_9728_35a55107e56e = await saveQuestion(manager, {
      text: `Después de la socialización de hoy, ¿el proyecto responde a sus necesidades?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8e0d7c60_892f_40c0_9728_35a55107e56e, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué aspecto del proyecto le parece más útil para su actividad?`,
      type: types.open_text,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

  }

  // ── Modalidad de participación deseada ──
  {
    let o = 1;

    const q_9acaf637_2a45_4529_8788_244c1d18aaff = await saveQuestion(manager, {
      text: `¿En qué modalidad le interesaría participar en el proyecto?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_9acaf637_2a45_4529_8788_244c1d18aaff, [
      { text: `Capacitaciones en uso de la App de conectividad y plataforma digital` },
      { text: `Diagnóstico de la cadena (talleres, encuestas, grupos focales)` },
      { text: `No tengo interés en participar` },
      { text: `Socialización de resultados y adopción de tecnologías exitosas` },
      { text: `Unidad productiva para análisis de calidad en plataforma SOS AGRO (Objetivo 3)` },
      { text: `Unidad productiva para instalación de sensores (Objetivo 1 — tecnología de campo)` },
      { text: `Unidad productiva para valorización de residuos (Objetivo 2 — energía, materiales, agua)` },
    ]);

  }

  // ── Condiciones de participación ──
  {
    let o = 1;

    const q_d3b91476_71a7_46ec_b122_631c1bf36cff = await saveQuestion(manager, {
      text: `Si su finca es seleccionada, ¿permitiría el acceso del equipo investigador para instalar equipos / sensores?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_d3b91476_71a7_46ec_b122_631c1bf36cff, [
      { text: `No` },
      { text: `Sí` },
      { text: `Tal vez` },
    ]);

    const q_46736f1f_88a4_47e1_b1ab_0b0b34e987a2 = await saveQuestion(manager, {
      text: `¿Estaría dispuesto a compartir datos productivos con el equipo de investigación?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_46736f1f_88a4_47e1_b1ab_0b0b34e987a2, [
      { text: `No` },
      { text: `Sí` },
      { text: `Tal vez` },
    ]);

    const q_ddc5deec_0fbd_47f1_b84e_f6f1a54e2a83 = await saveQuestion(manager, {
      text: `¿Puede comprometerse con el seguimiento del proyecto durante al menos 2 años?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_ddc5deec_0fbd_47f1_b84e_f6f1a54e2a83, [
      { text: `No` },
      { text: `Sí` },
      { text: `Tal vez` },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene alguna limitación o condición especial para participar?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Comentarios adicionales o preguntas sobre el proyecto`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

  }

  console.log(`[seed] "${NAME}" insertado (10 preguntas).`);
}
