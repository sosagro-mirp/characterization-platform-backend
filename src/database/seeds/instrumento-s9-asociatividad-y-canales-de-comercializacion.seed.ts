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

const NAME = `S9: Asociatividad y Canales de Comercialización`;
const VERSION = 1;

export async function seedInstrumentoS9AsociatividadYCanalesDeComercializacion(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["open_text", "single_choice", "yes_no"];
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

  const [sec1, sec2] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `9.1 Pertenencia a organizaciones`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `9.2 Canales de comercialización`, order: 2, instrument }))
  ]);

  // ── 9.1 Pertenencia a organizaciones ──
  {
    let o = 1;

    const q_cf543d94_bb34_4644_b0c5_c23602088454 = await saveQuestion(manager, {
      text: `¿Pertenece a alguna federación, asociación, cooperativa o gremio?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Nombre de la organización`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cf543d94_bb34_4644_b0c5_c23602088454,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `Rol dentro de la organización`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cf543d94_bb34_4644_b0c5_c23602088454,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Recibe beneficios por pertenecer a esa organización?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cf543d94_bb34_4644_b0c5_c23602088454,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Qué beneficios recibe de la organización?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_cf543d94_bb34_4644_b0c5_c23602088454,
      conditionValue: 'true',
    });

    const q_3790b26b_b6d9_40be_923d_cfc3c100331d = await saveQuestion(manager, {
      text: `¿Recibe actualmente asistencia técnica o extensión agrícola?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Fuente de asistencia técnica`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_3790b26b_b6d9_40be_923d_cfc3c100331d,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Ha participado en capacitaciones o talleres en los últimos 2 años?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── 9.2 Canales de comercialización ──
  {
    let o = 1;

    const q_263796a1_3f8c_430d_8aad_b4957f189868 = await saveQuestion(manager, {
      text: `Canal de comercialización principal que usa actualmente`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_263796a1_3f8c_430d_8aad_b4957f189868, [
      { text: `Industria / Transformador` },
      { text: `Intermediario / Acopiador` },
      { text: `Cooperativa / Asociación` },
      { text: `Venta directa local` },
      { text: `Exportación directa` },
      { text: `Comercializador nacional` },
      { text: `Otro`, isOther: true },
    ]);

    const q_07dbbc53_9764_4297_b7d9_6dc5218a986a = await saveQuestion(manager, {
      text: `¿Conoce el precio de mercado actualizado de su producto?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_07dbbc53_9764_4297_b7d9_6dc5218a986a, [
      { text: `Sí` },
      { text: `No` },
      { text: `No sabe / No aplica` },
    ]);

    await saveQuestion(manager, {
      text: `¿Exporta o ha exportado alguna vez?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_9f8e1f96_aecc_4690_8258_dd15d1ba488c = await saveQuestion(manager, {
      text: `¿Estaría interesado en acceder a mercados de mayor valor (especialidades, exportación)?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_9f8e1f96_aecc_4690_8258_dd15d1ba488c, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué le falta para acceder a esos mercados de mayor valor?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_bd8de6a2_7a88_48c0_96f0_90935b1f4b9c = await saveQuestion(manager, {
      text: `¿Estaría interesado en conectarse con compradores a través de una plataforma digital?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_bd8de6a2_7a88_48c0_96f0_90935b1f4b9c, [
      { text: `No` },
      { text: `Sí` },
      { text: `No sabe / No aplica` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (14 preguntas).`);
}
