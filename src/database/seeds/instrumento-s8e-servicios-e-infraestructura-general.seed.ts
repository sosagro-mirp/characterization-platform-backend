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

const NAME = `S8E: Servicios e Infraestructura General`;
const VERSION = 1;

export async function seedInstrumentoS8eServiciosEInfraestructuraGeneral(manager: EntityManager): Promise<void> {
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

  const [sec1, sec2] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `8E.1 Energía eléctrica`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `8E.2 Conectividad e internet`, order: 2, instrument }))
  ]);

  // ── 8E.1 Energía eléctrica ──
  {
    let o = 1;

    const q_5ab0f31d_d4cd_4adf_b643_168e7c3d8b13 = await saveQuestion(manager, {
      text: `¿Tiene acceso a energía eléctrica en la finca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      systemField: 'farm.hasElectricityAccess',
    });

    const q_12d58e69_0f25_4b73_8041_b6c816f60d76 = await saveQuestion(manager, {
      text: `Tipo de fuente eléctrica`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_5ab0f31d_d4cd_4adf_b643_168e7c3d8b13,
      conditionValue: 'true',
      systemField: 'farm.electricitySourceType',
    });
    await saveOptions(manager, q_12d58e69_0f25_4b73_8041_b6c816f60d76, [
      { text: `Generador a combustible` },
      { text: `Mixto` },
      { text: `No tiene acceso` },
      { text: `Panel solar` },
      { text: `Red pública 24/7 sin interrupciones` },
      { text: `Red pública con interrupciones frecuentes` },
      { text: `Solo algunas horas al día` },
    ]);

    await saveQuestion(manager, {
      text: `¿El servicio eléctrico es estable? ¿Con qué frecuencia hay cortes?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_5ab0f31d_d4cd_4adf_b643_168e7c3d8b13,
      conditionValue: 'true',
    });

    await saveQuestion(manager, {
      text: `¿Tiene acceso a agua potable en la vivienda de la finca?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── 8E.2 Conectividad e internet ──
  {
    let o = 1;

    const q_156f61bf_a5a6_43e9_b255_25c59c94a502 = await saveQuestion(manager, {
      text: `¿Tiene acceso a internet en la finca?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      systemField: 'farm.internetAccess',
    });

    const q_cc4da8b8_7d5c_4418_a4cf_3706b6ee7f2f = await saveQuestion(manager, {
      text: `Tipo de conectividad disponible`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      conditionQuestion: q_156f61bf_a5a6_43e9_b255_25c59c94a502,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_cc4da8b8_7d5c_4418_a4cf_3706b6ee7f2f, [
      { text: `Datos móviles (plan celular)` },
      { text: `No tiene acceso` },
      { text: `Solo fuera de la finca` },
      { text: `WiFi fijo en finca` },
      { text: `WiFi satelital` },
    ]);

    const q_6a2ab2fa_8b81_41b7_a8b3_8d39126cd3b5 = await saveQuestion(manager, {
      text: `¿Cómo describiría la calidad de la señal móvil en la finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_6a2ab2fa_8b81_41b7_a8b3_8d39126cd3b5, [
      { text: `No usa celular` },
      { text: `Señal buena` },
      { text: `Señal mala (llama pero no navega)` },
      { text: `Señal regular (navega lento)` },
      { text: `Sin señal` },
    ]);

    const q_b4572df6_c3bd_4eae_b26d_cb5857e15cec = await saveQuestion(manager, {
      text: `Si no tiene internet, ¿cuál es la razón principal?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_156f61bf_a5a6_43e9_b255_25c59c94a502,
      conditionValue: 'false',
    });
    await saveOptions(manager, q_b4572df6_c3bd_4eae_b26d_cb5857e15cec, [
      { text: `Cobertura deficiente aunque existe` },
      { text: `Es muy costoso` },
      { text: `No hay cobertura en la zona` },
      { text: `No lo considera necesario` },
      { text: `No sabe cómo usarlo` },
      { text: `No tiene dispositivo` },
    ]);

    const q_3c180788_ed85_47ba_ab68_6a69872ceeec = await saveQuestion(manager, {
      text: `¿Qué dispositivos utiliza actualmente?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_3c180788_ed85_47ba_ab68_6a69872ceeec, [
      { text: `Computador de escritorio` },
      { text: `Computador portátil` },
      { text: `Ninguno de estos` },
      { text: `Smartphone (teléfono inteligente)` },
      { text: `Tableta` },
      { text: `Teléfono convencional (no smartphone)` },
    ]);

    await saveQuestion(manager, {
      text: `¿Tiene y usa un smartphone (teléfono inteligente)?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Tiene y usa un telefono celular?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    const q_3d9c5f7b_8c8b_4b8e_ab39_2096a5e4c3c0 = await saveQuestion(manager, {
      text: `¿Con qué frecuencia utiliza internet?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_3d9c5f7b_8c8b_4b8e_ab39_2096a5e4c3c0, [
      { text: `Al menos una vez al mes` },
      { text: `Al menos una vez por semana` },
      { text: `No utiliza` },
      { text: `Ocasionalmente` },
      { text: `Todos los días` },
    ]);

    const q_6abf8a02_9a07_4f24_82c9_afcf601ce412 = await saveQuestion(manager, {
      text: `¿Con qué frecuencia usa su teléfono celular?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_6abf8a02_9a07_4f24_82c9_afcf601ce412, [
      { text: `Al menos una vez al mes` },
      { text: `Al menos una vez por semana` },
      { text: `No utiliza` },
      { text: `Ocasionalmente` },
      { text: `Todos los días` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (13 preguntas).`);
}
