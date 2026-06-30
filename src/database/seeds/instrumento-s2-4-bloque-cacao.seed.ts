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

const NAME = `S2.4: Bloque Cacao`;
const VERSION = 1;

export async function seedInstrumentoS24BloqueCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "open_text", "single_choice", "yes_no"];
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
    sectionRepo.create({ name: `2.4 Información del Cultivo de Cacao`, order: 1, instrument }),
  );

  // ── 2.4 Información del Cultivo de Cacao ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `2.4.1 ★ — Hectáreas sembradas en cacao (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_61167ff7_9736_4e62_9c20_ded96b8db6c6 = await saveQuestion(manager, {
      text: `¿La producción de cacao está distribuida en varios lotes?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cuántos lotes tiene?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_61167ff7_9736_4e62_9c20_ded96b8db6c6,
      conditionValue: 'true',
      systemField: 'farm.plotCount',
    });

    const q_449bfe08_b04b_42b3_a4e6_ed939e413370 = await saveQuestion(manager, {
      text: `¿Tiene sombra (cultivo asociado)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Especie vegetal de sombra (si aplica)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_449bfe08_b04b_42b3_a4e6_ed939e413370,
      conditionValue: 'true',
    });

    const q_094f97c0_8f40_44ab_aa89_9af75959d98c = await saveQuestion(manager, {
      text: `¿Tiene sombra transitoria?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Porcentaje de sombra transitoria (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_094f97c0_8f40_44ab_aa89_9af75959d98c,
      conditionValue: 'true',
    });

    const q_c94eeb9d_2f93_464e_a8b2_ffc9e4d84460 = await saveQuestion(manager, {
      text: `2.4.7 — ¿Tiene sombra permanente?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.4.7b — Porcentaje de sombra permanente (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_c94eeb9d_2f93_464e_a8b2_ffc9e4d84460,
      conditionValue: 'true',
    });

    const q_06911fe0_ddd6_4275_a114_c31718207afe = await saveQuestion(manager, {
      text: `¿Tiene otros cultivos asociados / intercalados?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Especifique los cultivos asociados y el porcentaje de área de cada uno`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_06911fe0_ddd6_4275_a114_c31718207afe,
      conditionValue: 'true',
    });

    const q_3994d299_0d3c_4826_86e9_2b3db41f3347 = await saveQuestion(manager, {
      text: `Variedad predominante de cacao (trazabilidad parental si existe)`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3994d299_0d3c_4826_86e9_2b3db41f3347, [
      { text: `CCN-51` },
      { text: `Criollo` },
      { text: `EET-8` },
      { text: `FEC-2` },
      { text: `Híbrido trinitario` },
      { text: `ICS-1` },
      { text: `ICS-39` },
      { text: `ICS-6` },
      { text: `ICS-60` },
      { text: `ICS-95` },
      { text: `Nativo / Silvestres` },
      { text: `Otro`, isOther: true },
      { text: `Sin identificar` },
      { text: `TSH-565` },
      { text: `Trinitario` },
    ]);

    await saveQuestion(manager, {
      text: `2.4.10 ★ — Clones sembrados en el cultivo — indique nombre y % sembrado de cada uno (Ej: CCN-51: 60%, ICS-60: 40%)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Edad promedio del cultivo de cacao (años)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Densidad de siembra (plantas / ha)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Rendimiento (kg cacao seco / ha / año)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Índice de mazorca del cultivo sembrado en mayor cantidad`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Tiene registros productivos históricos? (cuadernos, apps, etc.)`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Tiene registro ICA del predio? (BPA, exportador, etc.)`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_23014941_226b_4dd1_bb92_a34a949dd9a5 = await saveQuestion(manager, {
      text: `¿Pertenece a una asociación cacaotera?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `2.4.14b — ¿A cuál asociación cacaotera pertenece?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_23014941_226b_4dd1_bb92_a34a949dd9a5,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `En caso de no estar asociado ¿está interesado en asociarse?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_23014941_226b_4dd1_bb92_a34a949dd9a5,
      conditionValue: 'false',
    });

    const q_c756df67_9db8_4a08_9a93_331c718a4709 = await saveQuestion(manager, {
      text: `2.4.15 ★ — ¿En qué meses se presenta la cosecha principal de cacao? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_c756df67_9db8_4a08_9a93_331c718a4709, [
      { text: `Abril` },
      { text: `Agosto` },
      { text: `Diciembre` },
      { text: `Enero` },
      { text: `Febrero` },
      { text: `Julio` },
      { text: `Junio` },
      { text: `Marzo` },
      { text: `Mayo` },
      { text: `No aplica` },
      { text: `Noviembre` },
      { text: `Octubre` },
      { text: `Septiembre` },
    ]);

    const q_720e844d_e7c0_4ff3_b467_3c09774d7720 = await saveQuestion(manager, {
      text: `2.4.16 — ¿En qué meses se presenta la cosecha transitoria (secundaria) de cacao? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_720e844d_e7c0_4ff3_b467_3c09774d7720, [
      { text: `Abril` },
      { text: `Agosto` },
      { text: `Diciembre` },
      { text: `Enero` },
      { text: `Febrero` },
      { text: `Julio` },
      { text: `Junio` },
      { text: `Marzo` },
      { text: `Mayo` },
      { text: `No aplica` },
      { text: `Noviembre` },
      { text: `Octubre` },
      { text: `Septiembre` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (24 preguntas).`);
}
