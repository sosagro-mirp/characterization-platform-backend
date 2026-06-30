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

const NAME = `S7B: Agua en el Cultivo de Café`;
const VERSION = 1;

export async function seedInstrumentoS7bAguaEnElCultivoDeCafe(manager: EntityManager): Promise<void> {
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
      isActive: false,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `7B Fuente y Uso del Agua — Café`, order: 1, instrument }),
  );

  // ── 7B Fuente y Uso del Agua — Café ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Tiene acceso a fuente(s) de agua en la finca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'farm.waterAccess',
    });

    const q_b973c041_7d67_4df7_a82c_9c6e64f69369 = await saveQuestion(manager, {
      text: `Tipo de fuente de agua principal`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_b973c041_7d67_4df7_a82c_9c6e64f69369, [
      { text: `Río` },
      { text: `Quebrada` },
      { text: `Acueducto municipal` },
      { text: `Pozo profundo` },
      { text: `Otro`, isOther: true },
      { text: `Pozo somero` },
      { text: `Agua lluvia` },
      { text: `Reservorio / Jagüey` },
      { text: `Acueducto veredal` },
    ]);

    await saveQuestion(manager, {
      text: `¿Usa agua en el proceso de despulpado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Usa agua en la fermentación y lavado del café?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_0c794206_a9bd_4176_8b3d_79b25847cdd7 = await saveQuestion(manager, {
      text: `¿Para qué usa el agua en el proceso? (Marque todos los que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_0c794206_a9bd_4176_8b3d_79b25847cdd7, [
      { text: `Enfriamiento` },
      { text: `Despulpado` },
      { text: `Fermentación` },
      { text: `Lavado del grano` },
      { text: `Limpieza de equipos` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Cuánta agua usa por carga de café procesada? (Indique valor y unidad: L o m³ por carga)`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Se generan aguas mieles / lixiviados?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Volumen estimado de lixiviados por tonelada de café procesado (L/t)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Se añade agua adicional durante el despulpado?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `pH inicial aproximado de las aguas mieles`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_f4aa110c_4b82_4f4a_9c7b_00e0de69d148 = await saveQuestion(manager, {
      text: `Destino de las aguas mieles / lixiviados`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f4aa110c_4b82_4f4a_9c7b_00e0de69d148, [
      { text: `Suelo sin tratar` },
      { text: `Reúso en cultivo` },
      { text: `Otro`, isOther: true },
      { text: `Tanque de almacenamiento` },
      { text: `Cuerpo de agua (quebrada / río)` },
      { text: `Alcantarillado` },
    ]);

    await saveQuestion(manager, {
      text: `¿Los lixiviados se almacenan antes de descartar?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_c19e38c9_e4aa_4c2e_98bf_c82413276771 = await saveQuestion(manager, {
      text: `¿Conoce la calidad del agua que usa?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_c19e38c9_e4aa_4c2e_98bf_c82413276771, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    await saveQuestion(manager, {
      text: `¿Ha tenido problemas de calidad de agua?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_d9dd2d33_ce8c_4838_ad60_8ecfa8d6f89d = await saveQuestion(manager, {
      text: `¿Ha detectado o sospecha contaminación por metales pesados?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_d9dd2d33_ce8c_4838_ad60_8ecfa8d6f89d, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    const q_3a43a670_a171_4c5f_a82c_de5be3a48103 = await saveQuestion(manager, {
      text: `¿Ha detectado o sospecha contaminación por pesticidas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3a43a670_a171_4c5f_a82c_de5be3a48103, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    const q_bfe7679b_ea62_4cb4_bd64_fdceb5452d83 = await saveQuestion(manager, {
      text: `¿Realiza algún tratamiento al agua antes de usarla?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_f0e36188_8f4e_4200_a761_c219b4273d4f = await saveQuestion(manager, {
      text: `Tipo de tratamiento`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_bfe7679b_ea62_4cb4_bd64_fdceb5452d83,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_f0e36188_8f4e_4200_a761_c219b4273d4f, [
      { text: `Cloración` },
      { text: `Desinfección UV` },
      { text: `Ósmosis inversa` },
      { text: `Carbón activado` },
      { text: `Filtración (arena, grava)` },
      { text: `Acidificación / alcalinización` },
      { text: `Sin tratamiento` },
      { text: `Otro`, isOther: true },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene sistema de tratamiento de aguas residuales?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_fa58c410_a143_428b_8c78_a9fe03b55d78 = await saveQuestion(manager, {
      text: `¿Estaría interesado en instalar un sistema de tratamiento de aguas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_fa58c410_a143_428b_8c78_a9fe03b55d78, [
      { text: `Sí` },
      { text: `No sabe / No aplica` },
      { text: `No` },
    ]);

    const q_e88f7cc0_d50e_4102_b6f5_35f262920ec2 = await saveQuestion(manager, {
      text: `¿Su proceso genera impacto ambiental en las fuentes de agua cercanas?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_e88f7cc0_d50e_4102_b6f5_35f262920ec2, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (21 preguntas).`);
}
