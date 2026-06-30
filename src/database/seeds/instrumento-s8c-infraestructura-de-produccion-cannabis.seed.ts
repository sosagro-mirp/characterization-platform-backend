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

const NAME = `S8C: Infraestructura de Producción Cannabis`;
const VERSION = 1;

export async function seedInstrumentoS8cInfraestructuraDeProduccionCannabis(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["multiple_choice", "numeric", "single_choice", "yes_no"];
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
    sectionRepo.save(sectionRepo.create({ name: `8C.1 Estructura de cultivo`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `8C.2 Sistema de riego`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `8C.3 Extracción, secado y poscosecha`, order: 3, instrument }))
  ]);

  // ── 8C.1 Estructura de cultivo ──
  {
    let o = 1;

    const q_b32f128e_e6dc_46d6_be4b_b54b8e6f6954 = await saveQuestion(manager, {
      text: `8C.1 ★ — Tipo de estructura principal`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    const opts_b32f128e_e6dc_46d6_be4b_b54b8e6f6954 = await saveOptions(manager, q_b32f128e_e6dc_46d6_be4b_b54b8e6f6954, [
      { text: `Campo abierto` },
      { text: `Indoor (cuarto de cultivo)` },
      { text: `Invernadero` },
      { text: `Mixto` },
    ]);
    const opt_9b8673ec_aab3_48d5_9cdf_270ac046a200 = opts_b32f128e_e6dc_46d6_be4b_b54b8e6f6954.get(`Invernadero`)!;

    const q_dce512a8_ac9e_4449_85e5_24a196d45958 = await saveQuestion(manager, {
      text: `8C.2 ★ — Material de cubierta del invernadero`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_b32f128e_e6dc_46d6_be4b_b54b8e6f6954,
      conditionValue: opt_9b8673ec_aab3_48d5_9cdf_270ac046a200,
    });
    await saveOptions(manager, q_dce512a8_ac9e_4449_85e5_24a196d45958, [
      { text: `Plástico` },
      { text: `Policarbonato` },
      { text: `Vidrio` },
    ]);

    await saveQuestion(manager, {
      text: `8C.3 ★ — Área del invernadero (m²)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_b32f128e_e6dc_46d6_be4b_b54b8e6f6954,
      conditionValue: opt_9b8673ec_aab3_48d5_9cdf_270ac046a200,
    });

    const q_db34e748_7576_4920_8d37_5af945c341f2 = await saveQuestion(manager, {
      text: `8C.4 ★ — ¿Tiene sistema de ventilación?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_6bdea0e4_486d_4033_a534_9147592594b4 = await saveQuestion(manager, {
      text: `8C.5 — Tipo de ventilación`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_db34e748_7576_4920_8d37_5af945c341f2,
      conditionValue: 'true',
    });
    await saveOptions(manager, q_6bdea0e4_486d_4033_a534_9147592594b4, [
      { text: `Forzada (extractores)` },
      { text: `HVAC completo` },
      { text: `Natural` },
    ]);

    await saveQuestion(manager, {
      text: `8C.6 ★ — ¿Tiene control automático de temperatura y humedad relativa?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Temperatura mínima manejada (°C)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8C.7b ★ — Temperatura máxima manejada (°C)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `8C.8a ★ — Humedad relativa mínima manejada (%)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Humedad relativa máxima manejada (%)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_05b35b19_b126_4a38_bd51_0a188b6a8c4d = await saveQuestion(manager, {
      text: `Tipo de iluminación utilizada`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_05b35b19_b126_4a38_bd51_0a188b6a8c4d, [
      { text: `CMH` },
      { text: `HPS` },
      { text: `LED` },
      { text: `Mixto` },
      { text: `Natural` },
    ]);

    await saveQuestion(manager, {
      text: `8C.10 ★ — ¿Tiene sistema de control de fotoperiodo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

  }

  // ── 8C.2 Sistema de riego ──
  {
    let o = 1;

    const q_22ce2846_3396_4078_9f77_2a1d855e423b = await saveQuestion(manager, {
      text: `¿Con cuál de los siguientes sistemas de riego cuenta?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_22ce2846_3396_4078_9f77_2a1d855e423b, [
      { text: `Aeroponía` },
      { text: `Aspersión` },
      { text: `DWC (Cultivo en agua profunda)` },
      { text: `NFT (Nutrient Film Technique)` },
      { text: `Riego manual` },
      { text: `Riego por goteo` },
      { text: `Sistema recirculante` },
    ]);

  }

  // ── 8C.3 Extracción, secado y poscosecha ──
  {
    let o = 1;

    const q_51dee359_13ac_4cee_9794_d4c7a9af8d01 = await saveQuestion(manager, {
      text: `¿Con cuál de las siguientes instalaciones de poscosecha cuenta?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_51dee359_13ac_4cee_9794_d4c7a9af8d01, [
      { text: `Bodega de producto terminado` },
      { text: `Báscula de precisión (gramos)` },
      { text: `Cuarto de curado` },
      { text: `Cuarto de secado con control de temperatura y HR` },
      { text: `Equipo de análisis de humedad` },
      { text: `Equipo de extracción (prensa, CO₂, etanol, etc.)` },
      { text: `Área de empaque y etiquetado bajo condiciones controladas` },
      { text: `Área de trimming / despalillado` },
    ]);

    await saveQuestion(manager, {
      text: `Capacidad de la cámara / cuarto de secado (m²)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `8C.14 ★ — ¿Cuenta con medidor de humedad / higrómetro en el cuarto de secado?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `8C.15 ★ — ¿Tiene tomas eléctricas disponibles para instalación de sensores en el cultivo?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    const q_850312c3_2409_46c8_ba7e_2207a2725007 = await saveQuestion(manager, {
      text: `8C.16 ★ — ¿El área de extracción cumple normas de seguridad ATEX / INVIMA?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_850312c3_2409_46c8_ba7e_2207a2725007, [
      { text: `No` },
      { text: `No aplica` },
      { text: `Sí` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (18 preguntas).`);
}
