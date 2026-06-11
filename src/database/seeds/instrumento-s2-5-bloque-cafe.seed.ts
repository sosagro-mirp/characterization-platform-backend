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

const NAME = `S2.5: Bloque Café`;
const VERSION = 1;

export async function seedInstrumentoS25BloqueCafe(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["numeric","single_choice","yes_no","open_text","multiple_choice"];
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
    sectionRepo.create({ name: `2.5 Información del Cultivo de Café`, order: 1, instrument }),
  );

  // ── 2.5 Información del Cultivo de Café ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `2.5.1 ★ — Hectáreas sembradas en café (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_e64ff5be_c019_47af_ac71_8680b11f5826 = await saveQuestion(manager, {
      text: `2.5.2 ★ — Variedad(es) cultivada(s) de café principal`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_e64ff5be_c019_47af_ac71_8680b11f5826, [
      { text: `Otro`, isOther: true },
      { text: `Colombia` },
      { text: `Geisha / Gesha` },
      { text: `Caturra` },
      { text: `Típica` },
      { text: `Variedad propia` },
      { text: `Cenicafé 1` },
      { text: `Wush Wush` },
      { text: `Sin identificar` },
      { text: `Castillo` },
      { text: `Bourbon` },
      { text: `Tabi` },
    ]);

    const q_ee4a8886_7cde_4c0a_86fd_6a68fe12b5f7 = await saveQuestion(manager, {
      text: `2.5.3 — ¿Tiene más de una variedad de café?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.5.3b — Liste cada variedad con su porcentaje de área`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_ee4a8886_7cde_4c0a_86fd_6a68fe12b5f7,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `2.5.4 — Edad promedio del cultivo de café (años)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.5.5 — Densidad de siembra (plantas / ha)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.5.6 ★ — Rendimiento promedio (kg café pergamino seco / ha / año)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_8f1d2a99_1089_4aa9_bf65_6b3abc75f68b = await saveQuestion(manager, {
      text: `2.5.7 ★ — Tipo de café que produce o comercializa`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8f1d2a99_1089_4aa9_bf65_6b3abc75f68b, [
      { text: `Café trillado / excelso` },
      { text: `Café cereza` },
      { text: `Café especial` },
      { text: `Café pergamino seco` },
      { text: `Café tostado` },
      { text: `Café pergamino húmedo` },
    ]);

    await saveQuestion(manager, {
      text: `2.5.8 ★ — ¿Tiene registros productivos históricos?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.5.9 ★ — ¿Tiene registro ICA del predio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_1ab15f2c_5ee8_4187_985d_52e1a8915064 = await saveQuestion(manager, {
      text: `2.5.10 ★ — ¿En qué meses se presenta la cosecha principal de café? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_1ab15f2c_5ee8_4187_985d_52e1a8915064, [
      { text: `Septiembre` },
      { text: `Marzo` },
      { text: `Noviembre` },
      { text: `Febrero` },
      { text: `Enero` },
      { text: `Junio` },
      { text: `Diciembre` },
      { text: `Agosto` },
      { text: `No aplica` },
      { text: `Mayo` },
      { text: `Abril` },
      { text: `Julio` },
      { text: `Octubre` },
    ]);

    const q_56ff5c6e_8631_4309_8297_29788056a7e3 = await saveQuestion(manager, {
      text: `2.5.11 — ¿En qué meses se presenta la cosecha transitoria de café? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_56ff5c6e_8631_4309_8297_29788056a7e3, [
      { text: `Febrero` },
      { text: `Marzo` },
      { text: `Noviembre` },
      { text: `Junio` },
      { text: `Julio` },
      { text: `Octubre` },
      { text: `Abril` },
      { text: `Agosto` },
      { text: `Enero` },
      { text: `Septiembre` },
      { text: `Mayo` },
      { text: `No aplica` },
      { text: `Diciembre` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (12 preguntas).`);
}
