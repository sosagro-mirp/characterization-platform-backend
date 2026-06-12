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
    systemField?: string;
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
    systemField: def.systemField,
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

const NAME = `S1. Identificación del Encuestado y la Unidad Productiva`;
const VERSION = 1;

export async function seedInstrumentoS1IdentificacionDelEncuestadoYLaUnidadProductiva(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["single_choice","open_text","yes_no","numeric","multiple_choice"];
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
      code: 'S1',
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const [sec1, sec2, sec3, sec4, sec5] = await Promise.all([
    sectionRepo.save(sectionRepo.create({ name: `1.1. Datos personales`, order: 1, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `1.2 Datos de la Finca / Unidad Productiva`, order: 2, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `1.3 Ubicación`, order: 3, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `1.4 Acceso desde el Casco Urbano`, order: 4, instrument })),
    sectionRepo.save(sectionRepo.create({ name: `1.5 Entorno de la Finca`, order: 5, instrument })),
  ]);

  // ── 1.1. Datos personales ──
  {
    let o = 1;

    const q_6dc20a8a_8a0d_40f9_b1c2_2f54f437f38b = await saveQuestion(manager, {
      text: `1.1 ★ — Perfil del encuestado`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_6dc20a8a_8a0d_40f9_b1c2_2f54f437f38b, [
      { text: `Transformador / Agroindustrializador` },
      { text: `Productor / Propietario` },
      { text: `Otro`, isOther: true },
      { text: `Encargado de cultivo` },
      { text: `Comercializador` },
    ]);

    await saveQuestion(manager, {
      text: `1.8 — Nombre completo del encuestado`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.name',
    });

    await saveQuestion(manager, {
      text: `Número de cédula / documento de identidad`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.documentId',
    });

    await saveQuestion(manager, {
      text: `1.10 — Número de celular del encuestado`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      systemField: 'farmer.phone',
    });

    await saveQuestion(manager, {
      text: `1.12 — Correo electrónico`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      systemField: 'farmer.email',
    });

    const q_7f7b0aa8_aa31_4021_b998_c000e4d1a7c2 = await saveQuestion(manager, {
      text: `¿El encuestado es el propietario de la unidad productiva?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `1.8 — Nombre completo del propietario`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_7f7b0aa8_aa31_4021_b998_c000e4d1a7c2,
      conditionValue: 'false',
    });

    await saveQuestion(manager, {
      text: `1.10 — Número de celular del propietario`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_7f7b0aa8_aa31_4021_b998_c000e4d1a7c2,
      conditionValue: 'false',
    });

    await saveQuestion(manager, {
      text: `1.12 — Correo electrónico del propietario`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_7f7b0aa8_aa31_4021_b998_c000e4d1a7c2,
      conditionValue: 'false',
    });

    const q_7a6dd944_723c_44d5_943e_3d293acd4c79 = await saveQuestion(manager, {
      text: `¿El encuestado es el productor o encargado principal de la unidad productiva?`,
      type: types.yes_no,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `1.8 — Nombre completo del productor`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_7a6dd944_723c_44d5_943e_3d293acd4c79,
      conditionValue: 'false',
    });

    await saveQuestion(manager, {
      text: `1.10 — Número de celular del productor`,
      type: types.open_text,
      isRequired: true,
      order: o++,
      section: sec1,
      conditionQuestion: q_7a6dd944_723c_44d5_943e_3d293acd4c79,
      conditionValue: 'false',
    });

    await saveQuestion(manager, {
      text: `1.12 — Correo electrónico del productor`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_7a6dd944_723c_44d5_943e_3d293acd4c79,
      conditionValue: 'false',
    });

    const q_8cc0ee92_1b18_4732_bdc2_0d143fe0d0cc = await saveQuestion(manager, {
      text: `1.2 — Género del productor(a) / responsable`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_8cc0ee92_1b18_4732_bdc2_0d143fe0d0cc, [
      { text: `No binario / Otro` },
      { text: `Hombre` },
      { text: `Prefiere no responder` },
      { text: `Mujer` },
    ]);

    await saveQuestion(manager, {
      text: `1.3 — Edad del productor(a) (años)`,
      type: types.numeric,
      isRequired: true,
      order: o++,
      section: sec1,
    });

    const q_0cb2f804_acdc_434d_b5d3_e30ec74977f3 = await saveQuestion(manager, {
      text: `¿Pertenece el productor a alguno de los siguientes grupos o territorios? (Puede marcar más de una opción)`,
      type: types.multiple_choice,
      isRequired: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_0cb2f804_acdc_434d_b5d3_e30ec74977f3, [
      { text: `Municipio en zona PDET` },
      { text: `Comunidad LGBTIQ+` },
      { text: `Municipio en zona ZOMAC` },
      { text: `Comunidades negras, afrocolombianas, raizales y palenqueras (NARP)` },
      { text: `Ninguna de las anteriores` },
    ]);

    const q_4088fb2b_632a_4ba0_8fbc_8b43793e4509 = await saveQuestion(manager, {
      text: `1.4 — Nivel educativo alcanzado`,
      type: types.single_choice,
      isRequired: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_4088fb2b_632a_4ba0_8fbc_8b43793e4509, [
      { text: `Media (10°–11°)` },
      { text: `Sin escolaridad` },
      { text: `Universitario` },
      { text: `Primaria (1°–5°)` },
      { text: `Posgrado` },
      { text: `Secundaria (6°–9°)` },
      { text: `Técnico o tecnológico` },
    ]);

    await saveQuestion(manager, {
      text: `1.5 ★ — Años de experiencia en la actividad productiva`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `1.6 — ¿Cuántas personas conforman su hogar?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Su familia participa de las actividades de la unidad productora o finca?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `1.7 ★ — ¿La actividad agrícola es la principal fuente de ingresos del hogar?`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });

    const q_1a45e8b3_8867_46d4_9bbf_bafe59768113 = await saveQuestion(manager, {
      text: `¿Su lugar de vivienda es la unidad productora o finca?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `¿Su familia vive en la unidad productora o finca con usted?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec1,
      conditionQuestion: q_1a45e8b3_8867_46d4_9bbf_bafe59768113,
      conditionValue: 'true',
    });

  }

  // ── 1.2 Datos de la Finca / Unidad Productiva ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `1.13 ★ — Nombre de la finca / unidad productiva`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
      systemField: 'farm.name',
    });

    const q_5f9271e4_ff42_4965_ab39_762898cbe416 = await saveQuestion(manager, {
      text: `1.14 ★ — La unidad productiva es:`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });
    const opts_q_5f9271e4_ff42_4965_ab39_762898cbe416 = await saveOptions(manager, q_5f9271e4_ff42_4965_ab39_762898cbe416, [
      { text: `Comodato / Préstamo` },
      { text: `Otro`, isOther: true },
      { text: `Tierra colectiva (resguardo / comunidad)` },
      { text: `Propietario(a) sin título formal` },
      { text: `Arrendatario(a)` },
      { text: `Aparcero(a) / Mediería` },
      { text: `Propietario(a) con título formal` },
    ]);
    const opt_dcc47b7c_96bb_4d72_95b1_2cfca375cbf8 = opts_q_5f9271e4_ff42_4965_ab39_762898cbe416.get(`Arrendatario(a)`)!;

    await saveQuestion(manager, {
      text: `¿Por cuánto tiempo está arrendada?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_5f9271e4_ff42_4965_ab39_762898cbe416,
      conditionValue: opt_dcc47b7c_96bb_4d72_95b1_2cfca375cbf8,
    });

    await saveQuestion(manager, {
      text: `1.17 ★ — Hectáreas totales del predio (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `1.18 ★ — Hectáreas actualmente cultivadas con las cadenas del proyecto (ha)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec2,
    });

    const q_7e6f58a0_e794_4069_8753_ff1ef3483e4b = await saveQuestion(manager, {
      text: `¿Hay vivienda(s) en la unidad productiva?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: `¿Cuántas viviendas hay?`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
      conditionQuestion: q_7e6f58a0_e794_4069_8753_ff1ef3483e4b,
      conditionValue: 'true',
    });

  }

  // ── 1.3 Ubicación ──
  {
    let o = 1;

    const q_a70729c6_4d49_407d_98c7_0341e09e759b = await saveQuestion(manager, {
      text: `1.21 ★ — Departamento`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, q_a70729c6_4d49_407d_98c7_0341e09e759b, [
      { text: `La Guajira` },
      { text: `Norte de Santander` },
      { text: `Chocó` },
      { text: `Otro`, isOther: true },
      { text: `Caquetá` },
      { text: `Antioquia` },
      { text: `Meta` },
    ]);

    await saveQuestion(manager, {
      text: `1.22 ★ — Municipio`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `1.23 — Corregimiento (si aplica)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: `1.24 ★ — Vereda / Sector`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
      systemField: 'farm.vereda',
    });

    await saveQuestion(manager, {
      text: `1.25 — Altitud (m.s.n.m.) — usar altímetro o GPS`,
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
      systemField: 'farm.altitude',
    });

    await saveQuestion(manager, {
      text: `1.26a ★ — Latitud GPS (coordenada decimal, ej: 3.8612)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
      systemField: 'farm.latitude',
    });

    await saveQuestion(manager, {
      text: `1.26b ★ — Longitud GPS (coordenada decimal, ej: -73.0345)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec3,
      systemField: 'farm.longitude',
    });

  }

  // ── 1.4 Acceso desde el Casco Urbano ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `1.27 ★ — Municipio de referencia más cercano`,
      type: types.open_text,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `1.28 ★ — Distancia desde el casco urbano hasta la finca (km)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `1.29 ★ — Tiempo de desplazamiento hasta la finca (horas)`,
      type: types.numeric,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    const q_303d7f5f_5a56_4449_b1c1_1b38df65ba45 = await saveQuestion(manager, {
      text: `1.30 ★ — Medio de acceso principal`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, q_303d7f5f_5a56_4449_b1c1_1b38df65ba45, [
      { text: `Vía fluvial` },
      { text: `Otro`, isOther: true },
      { text: `Carretera pavimentada` },
      { text: `Mixto` },
      { text: `Carretera sin pavimentar` },
      { text: `Trocha / camino de herradura` },
    ]);

    await saveQuestion(manager, {
      text: `1.31 ★ — ¿Es accesible la vía durante todo el año (incluyendo épocas de lluvia)? (Clave para visitas del equipo)`,
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `¿Existen restricciones de acceso? (permiso por orden público)`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: `1.32 — Observaciones sobre el acceso`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });

  }

  // ── 1.5 Entorno de la Finca ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `1.33 — Tipo de relieve predominante de la finca`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `1.38 — ¿Qué tipo de actividad económica realizan en la zona aledaña? (ej: ganadera, mismo cultivo, fábricas)`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: `¿Hay más productores en la zona de su cultivo?`,
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    const q_abdccd54_cdf2_4ba1_b6bf_3d22a3ffd6e0 = await saveQuestion(manager, {
      text: `1.39 ★ — ¿Existen cultivos vecinos que puedan generar contaminación cruzada? (Importante para cannabis/cáñamo)`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec5,
    });
    const opts_q_abdccd54_cdf2_4ba1_b6bf_3d22a3ffd6e0 = await saveOptions(manager, q_abdccd54_cdf2_4ba1_b6bf_3d22a3ffd6e0, [
      { text: `No sabe / No aplica` },
      { text: `No` },
      { text: `Sí` },
    ]);
    const opt_d12dd76e_bced_48db_b3fd_3538e3675ad8 = opts_q_abdccd54_cdf2_4ba1_b6bf_3d22a3ffd6e0.get(`Sí`)!;

    await saveQuestion(manager, {
      text: `1.39b — ¿Cuáles cultivos vecinos generan o podrían generar contaminación cruzada?`,
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec5,
      conditionQuestion: q_abdccd54_cdf2_4ba1_b6bf_3d22a3ffd6e0,
      conditionValue: opt_d12dd76e_bced_48db_b3fd_3538e3675ad8,
    });

  }

  console.log(`[seed] "${NAME}" insertado (49 preguntas).`);
}
