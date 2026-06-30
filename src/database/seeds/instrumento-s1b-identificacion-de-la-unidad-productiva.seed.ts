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

const NAME = `S1b: Identificación de la unidad productiva`;
const VERSION = 1;

export async function seedInstrumentoS1bIdentificacionDeLaUnidadProductiva(manager: EntityManager): Promise<void> {
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
      publishDate: '2026-06-25',
      isActive: true,
      code: 'S2',
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `Identificación de la unidad productiva`, order: 1, instrument }),
  );

  // ── Identificación de la unidad productiva ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Nombre de la finca / unidad productiva`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farm.name',
    });

    const q_2adaaca9_9d98_48e6_a043_b96ab98926b7 = await saveQuestion(manager, {
      text: `La unidad productiva es:`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    const opts_2adaaca9_9d98_48e6_a043_b96ab98926b7 = await saveOptions(manager, q_2adaaca9_9d98_48e6_a043_b96ab98926b7, [
      { text: `Aparcero(a) / Mediería` },
      { text: `Arrendatario(a)` },
      { text: `Comodato / Préstamo` },
      { text: `Otros`, isOther: true },
      { text: `Propietario(a) con título formal` },
      { text: `Propietario(a) sin título formal` },
      { text: `Tierra colectiva (resguardo / comunidad)` },
    ]);
    const opt_d258dab5_059c_480f_825a_a91a7ada6b64 = opts_2adaaca9_9d98_48e6_a043_b96ab98926b7.get(`Arrendatario(a)`)!;

    await saveQuestion(manager, {
      text: `¿Por cuánto tiempo está arrendada?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_2adaaca9_9d98_48e6_a043_b96ab98926b7,
      conditionValue: opt_d258dab5_059c_480f_825a_a91a7ada6b64,
    });

    await saveQuestion(manager, {
      text: `¿Cultiva actualmente Cacao?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.cacao',
    });

    await saveQuestion(manager, {
      text: `¿Cultiva actualmente Café?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.cafe',
    });

    await saveQuestion(manager, {
      text: `¿Cultiva actualmente Cannabis?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.cannabis',
    });

    await saveQuestion(manager, {
      text: `¿Cultiva actualmente Cáñamo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'crop.canamo',
    });

    await saveQuestion(manager, {
      text: `Hectáreas totales del predio (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'farm.area',
    });

    await saveQuestion(manager, {
      text: `Hectáreas actualmente cultivadas con las cadenas del proyecto (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_6f8d74f0_a111_4fe9_8cbc_337d484b566f = await saveQuestion(manager, {
      text: `¿En qué etapas de la cadena productiva participa? (Marque todas las que apliquen)`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_6f8d74f0_a111_4fe9_8cbc_337d484b566f, [
      { text: `Comercialización directa` },
      { text: `Cosecha` },
      { text: `Cultivo / producción en campo` },
      { text: `Exportación` },
      { text: `Poscosecha / procesamiento` },
      { text: `Transformación industrial` },
    ]);

    const q_da281dfe_f5c0_4d60_8656_20af2f891cca = await saveQuestion(manager, {
      text: `¿Procesa materia prima propia, de terceros o ambas?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_da281dfe_f5c0_4d60_8656_20af2f891cca, [
      { text: `Ambas` },
      { text: `De terceros` },
      { text: `Propia` },
    ]);

    const q_685f02a7_6e19_4c0a_be2a_c6bbdac07f24 = await saveQuestion(manager, {
      text: `¿Hay vivienda(s) en la unidad productiva?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cuántas viviendas hay?`,
      type: types.numeric,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_685f02a7_6e19_4c0a_be2a_c6bbdac07f24,
      conditionValue: 'true',
    });

    const q_4e6cb020_053f_4282_a3ea_26ee98e9b99f = await saveQuestion(manager, {
      text: `¿Su lugar de vivienda es la unidad productora o finca?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_685f02a7_6e19_4c0a_be2a_c6bbdac07f24,
      conditionValue: 'true',
    });

    const q_e98ee4d4_1129_493b_b26f_da68bd6bcad8 = await saveQuestion(manager, {
      text: `¿Su familia vive en la unidad productora o finca con usted?`,
      type: types.yes_no,
      isRequired: false,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_4e6cb020_053f_4282_a3ea_26ee98e9b99f,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Su familia participa de las actividades de la unidad productora o finca?`,
      type: types.yes_no,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_e98ee4d4_1129_493b_b26f_da68bd6bcad8,
      conditionValue: 'true',
    });

    const q_cb9b8907_d7d4_4c96_b1c3_91a1826dd3e6 = await saveQuestion(manager, {
      text: `Tipo de relieve predominante de la finca`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_cb9b8907_d7d4_4c96_b1c3_91a1826dd3e6, [
      { text: `Ambas` },
      { text: `Pendiente` },
      { text: `Plano` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué tipo de actividad económica realizan en la zona aledaña? (ej: ganadera, mismo cultivo, fábricas)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Hay más productores en la zona de su cultivo?`,
      type: types.yes_no,
      isRequired: true,
      isKeyQuestion: true,
      order: o++,
      section: sec1,
    });

    const q_b1e6c1e0_53af_4fe7_8f3c_124cc4f3492f = await saveQuestion(manager, {
      text: `¿Existen cultivos vecinos que puedan generar contaminación cruzada?`,
      type: types.yes_no,
      isRequired: false,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Cuáles cultivos vecinos generan o podrían generar contaminación cruzada?`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_b1e6c1e0_53af_4fe7_8f3c_124cc4f3492f,
      conditionValue: 'true',
    });

  }

  console.log(`[seed] "${NAME}" insertado (21 preguntas).`);
}
