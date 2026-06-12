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

const NAME = `S7A: Agua en el Cultivo de Cacao`;
const VERSION = 1;

export async function seedInstrumentoS7aAguaEnElCultivoDeCacao(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["yes_no","single_choice","numeric","open_text"];
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
    sectionRepo.create({ name: `7A Fuente y Uso del Agua — Cacao`, order: 1, instrument }),
  );

  // ── 7A Fuente y Uso del Agua — Cacao ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `7A.1 ★ — ¿Tiene acceso a fuente(s) de agua en la finca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_06d20475_624e_4fee_9cc8_c7472a99f41d = await saveQuestion(manager, {
      text: `7A.2 ★ — Tipo de fuente de agua principal`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_06d20475_624e_4fee_9cc8_c7472a99f41d, [
      { text: `Pozo somero` },
      { text: `Agua lluvia` },
      { text: `Quebrada` },
      { text: `Pozo profundo` },
      { text: `Acueducto veredal` },
      { text: `Otro`, isOther: true },
      { text: `Acueducto municipal` },
      { text: `Reservorio / Jagüey` },
      { text: `Río` },
    ]);

    await saveQuestion(manager, {
      text: `7A.3 ★ — ¿Cuántas fuentes de agua tiene cerca de la finca?`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `7A.4 ★ — ¿Usa agua para riego del cultivo de cacao?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `7A.5 ★ — ¿Usa agua en el proceso de beneficio (fermentación, lavado)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `7A.6 — ¿Cuánta agua usa por ciclo de fermentación / lavado? (Indique valor y unidad: L o m³)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `7A.7 — ¿Usa agua adicional durante el despulpado o apertura de mazorcas?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `7A.8 ★ — ¿Se generan aguas mieles / lixiviados durante el beneficio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f637adbe_b388_4217_941c_356a704e8995 = await saveQuestion(manager, {
      text: `7A.9 ★ — Destino de las aguas mieles / lixiviados`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f637adbe_b388_4217_941c_356a704e8995, [
      { text: `Otro`, isOther: true },
      { text: `Cuerpo de agua (quebrada / río)` },
      { text: `Alcantarillado` },
      { text: `Suelo sin tratar` },
      { text: `Reúso en cultivo` },
      { text: `Tanque de almacenamiento` },
    ]);

    await saveQuestion(manager, {
      text: `7A.10 — ¿Cuál es el volumen estimado de lixiviados por tonelada procesada? (L/t)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_b348b69b_49b2_44a3_b5e4_7f900795f2d3 = await saveQuestion(manager, {
      text: `7A.11 ★ — ¿Conoce la calidad del agua que usa?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_b348b69b_49b2_44a3_b5e4_7f900795f2d3, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `7A.12 ★ — ¿Ha realizado análisis de calidad del agua (pH, turbidez, microbiológico)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_3d2c78da_31e3_4272_939c_49d0ce5464cf = await saveQuestion(manager, {
      text: `7A.13 ★ — ¿Ha detectado o sospecha contaminación por metales pesados en el agua?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3d2c78da_31e3_4272_939c_49d0ce5464cf, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_214b9b62_f1f3_4bb8_82d0_ed8069dc0775 = await saveQuestion(manager, {
      text: `7A.14 ★ — ¿Ha detectado o sospecha contaminación por pesticidas o agroquímicos?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_214b9b62_f1f3_4bb8_82d0_ed8069dc0775, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

    const q_b5cf7ddc_3c69_4e66_9e46_33906c794850 = await saveQuestion(manager, {
      text: `7A.15 ★ — ¿Realiza algún tratamiento al agua antes de usarla en el proceso?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_da3f3c42_0c26_4c1f_8d45_d32a4e8bc00c = await saveQuestion(manager, {
      text: `7A.16 — Tipo de tratamiento del agua (Aplica si respondió Sí en 7A.15)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_b5cf7ddc_3c69_4e66_9e46_33906c794850,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_da3f3c42_0c26_4c1f_8d45_d32a4e8bc00c, [
      { text: `Carbón activado` },
      { text: `Sin tratamiento` },
      { text: `Desinfección UV` },
      { text: `Cloración` },
      { text: `Filtración (arena, grava)` },
      { text: `Acidificación / alcalinización` },
      { text: `Otro`, isOther: true },
      { text: `Ósmosis inversa` },
    ]);

    const q_a43bec8f_2edb_4c23_879a_70fcfead7b0a = await saveQuestion(manager, {
      text: `7A.17 ★ — ¿Cómo descarta las aguas residuales del beneficio?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a43bec8f_2edb_4c23_879a_70fcfead7b0a, [
      { text: `Cuerpo de agua (quebrada / río)` },
      { text: `Suelo sin tratar` },
      { text: `Reúso en cultivo` },
      { text: `Alcantarillado` },
      { text: `Otro`, isOther: true },
      { text: `Tanque de almacenamiento` },
    ]);

    await saveQuestion(manager, {
      text: `7A.18 ★ — ¿Tiene algún sistema de tratamiento de aguas residuales?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_11e82432_6066_40c3_99d0_40cd57c512a8 = await saveQuestion(manager, {
      text: `7A.19 ★ — ¿Estaría interesado en instalar un sistema de tratamiento de aguas en su finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_11e82432_6066_40c3_99d0_40cd57c512a8, [
      { text: `No` },
      { text: `No sabe / No aplica` },
      { text: `Sí` },
    ]);

    const q_08ada2ea_4ff0_4f58_80f4_7e329100dffe = await saveQuestion(manager, {
      text: `7A.20 ★ — ¿Su proceso genera impacto ambiental en las aguas cercanas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_08ada2ea_4ff0_4f58_80f4_7e329100dffe, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (20 preguntas).`);
}
