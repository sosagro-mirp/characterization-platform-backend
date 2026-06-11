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

const NAME = `S8D: Infraestructura de Producción Cáñamo`;
const VERSION = 1;

export async function seedInstrumentoS8dInfraestructuraDeProduccionCanamo(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice","numeric","yes_no","single_choice"];
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
    sectionRepo.create({ name: `8D Infraestructura de Producción — Cáñamo`, order: 1, instrument }),
  );

  // ── 8D Infraestructura de Producción — Cáñamo ──
  {
    let o = 1;

    const q_14cd478f_a3fa_40cd_837f_d3e6a19d5716 = await saveQuestion(manager, {
      text: `8D.1 ★ — ¿Con cuál de las siguientes instalaciones para cáñamo cuenta?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_14cd478f_a3fa_40cd_837f_d3e6a19d5716, [
      { text: `Desfibrado manual` },
      { text: `Báscula` },
      { text: `Área de empaque y etiquetado` },
      { text: `Área de secado de fibra / semilla / flor` },
      { text: `Campo abierto (sin estructura)` },
      { text: `Equipo de extracción de CBD` },
      { text: `Bodega de producto terminado` },
      { text: `Sistema de riego tecnificado` },
      { text: `Prensa de semilla (para aceite)` },
      { text: `Invernadero` },
      { text: `Decorticadora / desfibrado mecánico` },
    ]);

    await saveQuestion(manager, {
      text: `8D.2 ★ — Área de cultivo a campo abierto (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8D.3 — Área bajo invernadero (m²)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8D.4 ★ — ¿Tiene maquinaria de cosecha (cosechadora, segadora)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8D.5 ★ — Capacidad de procesamiento de fibra (valor numérico)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_3d5ac54a_efe3_4860_897f_cdf8eb783d9d = await saveQuestion(manager, {
      text: `8D.5b ★ — Unidad de capacidad de procesamiento de fibra`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3d5ac54a_efe3_4860_897f_cdf8eb783d9d, [
      { text: `t / cosecha` },
      { text: `kg / día` },
    ]);

    await saveQuestion(manager, {
      text: `8D.6 ★ — ¿Tiene área de almacenamiento con control de humedad?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8D.7 ★ — ¿Tiene tomas eléctricas disponibles para instalación de sensores?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

  }

  console.log(`[seed] "${NAME}" insertado (8 preguntas).`);
}
