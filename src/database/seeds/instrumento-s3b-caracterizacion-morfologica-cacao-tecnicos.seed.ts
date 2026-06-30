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

const NAME = `S3B: Caracterización Morfológica Cacao (Técnicos)`;
const VERSION = 1;

export async function seedInstrumentoS3bCaracterizacionMorfologicaCacaoTecnicos(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["likert", "numeric", "open_text", "single_choice"];
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

  const [sec1, sec2, sec3, sec4, sec5] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `Árbol`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Hoja`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Fruto`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Semilla`, order: 4, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `Flor`, order: 5, instrument }))
  ]);

  // ── Árbol ──
  {
    let o = 1;

    const q_eadd2e65_1de6_4183_bb5f_b9edb6460850 = await saveQuestion(manager, {
      text: `Variedad (Pedigrí)`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_eadd2e65_1de6_4183_bb5f_b9edb6460850, [
      { text: `Trinitario` },
      { text: `Híbrido por trinitario` },
      { text: `Criollo` },
      { text: `Trinitario x Criollo` },
    ]);

    await saveQuestion(manager, {
      text: `Clon`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Altura del árbol (m)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Diámetro de copa del árbol (m)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Edad del árbol (años)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Perímetro del tronco DAP (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const q_dd4d9ba8_9a33_45bc_8e43_a72c7bc362f9 = await saveQuestion(manager, {
      text: `Hábito del árbol`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_dd4d9ba8_9a33_45bc_8e43_a72c7bc362f9, [
      { text: `Decumbente` },
      { text: `Erecto` },
    ]);

    const q_9b6839d3_64ef_4aa6_80a7_c9631da6347a = await saveQuestion(manager, {
      text: `Vigor del árbol`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_9b6839d3_64ef_4aa6_80a7_c9631da6347a, [
      { text: `Escaso` },
      { text: `Vigoroso` },
      { text: `Intermedio` },
    ]);

    const q_3ba6a9d8_9298_4f45_9d41_5d10031f7d95 = await saveQuestion(manager, {
      text: `Follaje sin poda`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_3ba6a9d8_9298_4f45_9d41_5d10031f7d95, [
      { text: `Escaso` },
      { text: `Abundante` },
    ]);

    await saveQuestion(manager, {
      text: `Frecuencia de poda`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── Hoja ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Color hojas jóvenes (código Pantone o descripción)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Longitud de la hoja (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Ancho de la hoja (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `Longitud de la base al punto más ancho (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const q_b7d51b7e_cf21_4e0f_b13e_403901bfc3b5 = await saveQuestion(manager, {
      text: `Forma de la hoja`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_b7d51b7e_cf21_4e0f_b13e_403901bfc3b5, [
      { text: `Elíptica` },
      { text: `Ovada` },
      { text: `Obovada` },
      { text: `Acuñada` },
      { text: `Acorazonada` },
      { text: `Ovoide` },
    ]);

    const q_40bfff67_312b_471e_af77_412be7c830b7 = await saveQuestion(manager, {
      text: `Forma del ápice de la hoja`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_40bfff67_312b_471e_af77_412be7c830b7, [
      { text: `Agudo` },
      { text: `Acuminado largo` },
      { text: `Acuminado corto` },
    ]);

    const q_33414693_4fda_4c4e_80bc_8d6dc2dcc723 = await saveQuestion(manager, {
      text: `Forma de la base de la hoja`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_33414693_4fda_4c4e_80bc_8d6dc2dcc723, [
      { text: `Obtusa` },
      { text: `Redondeada` },
      { text: `Aguda` },
    ]);

    const q_7c2212ff_b357_4441_8d1a_49fdf459bb6f = await saveQuestion(manager, {
      text: `Color del brote terminal de la hoja`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_7c2212ff_b357_4441_8d1a_49fdf459bb6f, [
      { text: `Rojo claro` },
      { text: `Rojo brillante` },
      { text: `Rojo oscuro` },
      { text: `Rojo intermedio` },
    ]);

  }

  // ── Fruto ──
  {
    let o = 1;

    const q_cf072469_76f1_4fa1_a87a_f56d71f38198 = await saveQuestion(manager, {
      text: `Constricción basal del fruto`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_cf072469_76f1_4fa1_a87a_f56d71f38198, [
      { text: `Intermedia` },
      { text: `Ausente` },
      { text: `Pronunciada` },
      { text: `Ligera` },
    ]);

    await saveQuestion(manager, {
      text: `Grosor del lomo del fruto (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Profundidad surco primario (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Profundidad surco secundario (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Grosor de cáscara (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Frutos de un árbol por año`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_0892aaf4_917d_4427_9594_cf8bd4db015f = await saveQuestion(manager, {
      text: `Color fruto inmaduro`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_0892aaf4_917d_4427_9594_cf8bd4db015f, [
      { text: `Morado` },
      { text: `Rojo` },
      { text: `Verde` },
    ]);

    const q_53eed3dc_9c2c_44cf_83af_2716e1eaeae1 = await saveQuestion(manager, {
      text: `Color fruto maduro`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_53eed3dc_9c2c_44cf_83af_2716e1eaeae1, [
      { text: `Naranja` },
      { text: `Rojo` },
      { text: `Amarillo` },
    ]);

    const q_eb56a02a_43e5_4110_9aa4_2586a750e76c = await saveQuestion(manager, {
      text: `Forma del fruto`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_eb56a02a_43e5_4110_9aa4_2586a750e76c, [
      { text: `Calabacillo` },
      { text: `Amelonado` },
      { text: `Angoleta` },
      { text: `Cundeamor` },
    ]);

    const q_92ba1769_1d87_42ac_b918_293ce199ae31 = await saveQuestion(manager, {
      text: `Forma del ápice del fruto`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_92ba1769_1d87_42ac_b918_293ce199ae31, [
      { text: `Atenuado` },
      { text: `Obtuso` },
      { text: `Mamiforme` },
      { text: `Agudo` },
    ]);

    const q_99ad5f44_aecb_4659_85b2_3c849c497646 = await saveQuestion(manager, {
      text: `Rugosidad del fruto`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_99ad5f44_aecb_4659_85b2_3c849c497646, [
      { text: `Intensa` },
      { text: `Ligera` },
      { text: `Intermedia` },
    ]);

    await saveQuestion(manager, {
      text: `Longitud del fruto (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Diámetro del fruto (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Rendimiento (kg/ha/año)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Clon de referencia para tamaño de mazorca`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Tamaño promedio de mazorca por clon (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Clon de referencia para número de mazorcas sanas`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Número de mazorcas sanas promedio por clon`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Clon de referencia para peso de mazorca`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Peso de mazorca promedio por clon (g)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Clon de referencia para Índice de Mazorca (IM)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `Índice de Mazorca (IM) promedio por clon`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

  }

  // ── Semilla ──
  {
    let o = 1;

    const q_56a54c92_ab34_4152_b52c_4079975bc6f0 = await saveQuestion(manager, {
      text: `Color de la semilla`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_56a54c92_ab34_4152_b52c_4079975bc6f0, [
      { text: `Blanco` },
      { text: `Morado` },
      { text: `Violeta` },
    ]);

    await saveQuestion(manager, {
      text: `Peso húmedo de la semilla (g)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Longitud de la semilla (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Diámetro de la semilla (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Grosor de la semilla (cm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Porcentaje de cascarilla (%)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Tamaño del grano (pequeño / mediano / grande)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Clon de referencia para Índice de Grano (IG)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Índice de Grano (IG) promedio por clon`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

  }

  // ── Flor ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Longitud del estaminodio (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Longitud del ovario de la flor (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Longitud del estilo de la flor (mm)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `Número de óvulos por ovario`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    const q_6f84a19f_f9e5_420c_bdb9_506ce326578a = await saveQuestion(manager, {
      text: `Color de la flor`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_6f84a19f_f9e5_420c_bdb9_506ce326578a, [
      { text: `Rojo` },
      { text: `Rosado` },
      { text: `Verde ligero` },
      { text: `Blanco` },
    ]);

    const q_4bb31f10_df6c_4356_863d_346b380ef30a = await saveQuestion(manager, {
      text: `Antocianina en sépalos`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_4bb31f10_df6c_4356_863d_346b380ef30a, [
      { text: `Intensa` },
      { text: `Ausente` },
      { text: `Ligera` },
      { text: `Intermedia` },
    ]);

    const q_b1a12947_eb3a_417c_87b2_0c464105be53 = await saveQuestion(manager, {
      text: `Color del pedúnculo de la flor`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_b1a12947_eb3a_417c_87b2_0c464105be53, [
      { text: `Rojizo` },
      { text: `Verde` },
      { text: `Verde rojizo` },
    ]);

    const q_a9e5cbda_5334_46b1_92fe_4ab9be2ccb96 = await saveQuestion(manager, {
      text: `Antocianina en el limbo del pétalo`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_a9e5cbda_5334_46b1_92fe_4ab9be2ccb96, [
      { text: `Ausente` },
      { text: `Presente` },
    ]);

    const q_873e7bda_b87e_44ec_89e3_32a4075b638a = await saveQuestion(manager, {
      text: `Tipo de floración`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_873e7bda_b87e_44ec_89e3_32a4075b638a, [
      { text: `Continua` },
      { text: `Discontinua` },
    ]);

    const q_strat_1 = await saveQuestion(manager, {
      text: `Me sería útil contar con una app que me guiara paso a paso por las mediciones morfológicas del árbol de cacao con campos de captura directamente en el celular, sin necesidad de papel.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_strat_1, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_2 = await saveQuestion(manager, {
      text: `Me gustaría que la app me permitiera tomar fotografías de cada parte del árbol y las asociara automáticamente al árbol evaluado, con georreferencia y número de árbol.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_strat_2, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_3 = await saveQuestion(manager, {
      text: `Me sería útil una función que, al ingresar las mediciones morfológicas, comparara el árbol con el perfil típico de un clon de referencia y estimara su identidad varietal.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_strat_3, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

    const q_strat_4 = await saveQuestion(manager, {
      text: `Me sería útil que la plataforma generara un informe de caracterización morfológica por finca de forma automática al terminar de evaluar todos los árboles del lote.`,
      type: types.likert,
      isRequired: true,
      isKeyQuestion: true,
      systemField: 'Pregunta estratégica de caracterización tecnológica',
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, q_strat_4, [
      { text: `Totalmente de acuerdo`, value: 5 },
      { text: `De acuerdo`, value: 4 },
      { text: `Ni de acuerdo ni en desacuerdo`, value: 3 },
      { text: `En desacuerdo`, value: 2 },
      { text: `Totalmente en desacuerdo`, value: 1 },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (62 preguntas).`);
}
