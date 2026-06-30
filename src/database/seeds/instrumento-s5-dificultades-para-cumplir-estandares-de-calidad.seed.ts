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

const NAME = `S5: Dificultades para Cumplir Estándares de Calidad`;
const VERSION = 1;

export async function seedInstrumentoS5DificultadesParaCumplirEstandaresDeCalidad(manager: EntityManager): Promise<void> {
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

  const [sec1, sec2, sec3, sec4] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `5.1 Barreras principales`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `5.2 Tipo de apoyo necesario`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `5.3 Reconocimiento por alta calidad`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `5.4 Impacto económico del incumplimiento`, order: 4, instrument }))
  ]);

  // ── 5.1 Barreras principales ──
  {
    let o = 1;

    const q_f5de0b7b_545d_4378_833f_935e5e1f4863 = await saveQuestion(manager, {
      text: `¿Cuáles son sus principales dificultades para cumplir los estándares de calidad?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_f5de0b7b_545d_4378_833f_935e5e1f4863, [
      { text: `Dificultades de transporte del producto al punto de venta` },
      { text: `Falta de conocimiento / apoyo institucional` },
      { text: `Otro`, isOther: true },
      { text: `Agua de mala calidad para los procesos de beneficio` },
      { text: `Falta de equipos para medir parámetros de calidad (humedad, Brix, pH, etc.)` },
      { text: `Falta de conocimiento técnico sobre procesos de poscosecha` },
      { text: `Condiciones climáticas adversas (exceso de lluvia, temperaturas extremas)` },
      { text: `Infraestructura deficiente (marquesinas, cajones de fermentación, bodegas)` },
      { text: `Acceso limitado a insumos de calidad (semillas certificadas, fertilizantes)` },
      { text: `Dificultades en el proceso de fermentación (duración, temperatura, volteo)` },
      { text: `Dificultades en el secado (tiempo, temperatura, uniformidad)` },
      { text: `Problemas de plagas y enfermedades que afectan la calidad` },
      { text: `Contaminación por residuos de pesticidas o metales pesados` },
      { text: `Poca información sobre las normas técnicas aplicables` },
      { text: `Exigencias de certificaciones que no puede costear` },
      { text: `Falta de laboratorios de análisis de calidad accesibles o económicos` },
      { text: `Falta de financiamiento para mejorar procesos` },
    ]);

    await saveQuestion(manager, {
      text: `Otra dificultad importante (especifique)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

  }

  // ── 5.2 Tipo de apoyo necesario ──
  {
    let o = 1;

    const q_bff4d6a1_8f14_4127_aeb7_943bc16b0fa5 = await saveQuestion(manager, {
      text: `¿Qué tipo de apoyo necesitaría principalmente para superar esas dificultades?`,
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, q_bff4d6a1_8f14_4127_aeb7_943bc16b0fa5, [
      { text: `Financiamiento / crédito` },
      { text: `Equipos / tecnología` },
      { text: `Acompañamiento técnico continuo` },
      { text: `Normas y certificaciones` },
      { text: `Acceso a mercados` },
      { text: `Capacitación técnica` },
    ]);

  }

  // ── 5.3 Reconocimiento por alta calidad ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Ha sido postulado por cumplimiento de altos estándares de calidad? Si Sí: ¿Cuándo, en qué concurso/evento, entidad, variedad/clon?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `¿Ha sido premiado por cumplimiento de altos estándares de calidad? Si Sí: ¿Cuándo, en qué concurso/evento, entidad, variedad/clon?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `¿Cuál es el atributo de calidad superior que más caracteriza su producción?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const q_2e08c74a_2c56_4999_b458_c3f07113dab5 = await saveQuestion(manager, {
      text: `¿La calidad de su producción cumple con estándares internacionales?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_2e08c74a_2c56_4999_b458_c3f07113dab5, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);

  }

  // ── 5.4 Impacto económico del incumplimiento ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `¿Ha tenido rechazo de producto por incumplimiento de calidad en el último año?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    const q_fc5c8a53_ca6d_4b7e_b41f_d093f59b42b1 = await saveQuestion(manager, {
      text: `Frecuencia de rechazo de producto por calidad`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_fc5c8a53_ca6d_4b7e_b41f_d093f59b42b1, [
      { text: `Frecuentemente (> 30%)` },
      { text: `Nunca` },
      { text: `Raramente (< 10% de la producción)` },
      { text: `Ocasionalmente (10–30%)` },
    ]);

    await saveQuestion(manager, {
      text: `¿Qué hace con el producto rechazado?`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `¿Cuál variedad / clon le han rechazado?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `Estimación de pérdidas económicas por calidad (COP / año)`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    const q_e8655701_d850_4636_97ac_730421590eb1 = await saveQuestion(manager, {
      text: `¿Conoce el precio diferencial que pagarían por producto de mejor calidad?`,
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec4,
    });
    const opts_e8655701_d850_4636_97ac_730421590eb1 = await saveOptions(manager, q_e8655701_d850_4636_97ac_730421590eb1, [
      { text: `No sabe / No aplica` },
      { text: `Sí` },
      { text: `No` },
    ]);
    const opt_218dc095_2f36_49e3_8cfa_4032a58ab752 = opts_e8655701_d850_4636_97ac_730421590eb1.get(`Sí`)!;

    await saveQuestion(manager, {
      text: `Valor aproximado o rango del precio diferencial (COP / kg o carga)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
      conditionQuestion: q_e8655701_d850_4636_97ac_730421590eb1,
      conditionValue: opt_218dc095_2f36_49e3_8cfa_4032a58ab752,
    });

  }

  console.log(`[seed] "${NAME}" insertado (14 preguntas).`);
}
