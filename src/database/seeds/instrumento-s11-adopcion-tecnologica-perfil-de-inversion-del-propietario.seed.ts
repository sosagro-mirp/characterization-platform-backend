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

const NAME = `S11. Adopción Tecnológica: Perfil de Inversión del Propietario`;
const VERSION = 1;

export async function seedInstrumentoS11AdopcionTecnologicaPerfilDeInversionDelPropietario(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ["single_choice"];
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
    sectionRepo.create({ name: `PR. Perfil de inversión del propietario`, order: 1, instrument }),
  );

  // ── PR. Perfil de inversión del propietario ──
  {
    let o = 1;

    const q_adba2b71_8e26_4372_8117_0694203c5985 = await saveQuestion(manager, {
      text: `PR.2 ★ — ¿Ha realizado inversiones en tecnología o infraestructura en los últimos 3 años?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_adba2b71_8e26_4372_8117_0694203c5985, [
      { text: `No y sin planes actualmente` },
      { text: `Sí, entre 1–3 años atrás` },
      { text: `No, pero tengo planes` },
      { text: `Sí, en los últimos 12 meses` },
    ]);

    const q_5630254a_8540_417c_8a61_1b323d4668ab = await saveQuestion(manager, {
      text: `PR.3 ★ — ¿Quién toma las decisiones de inversión en nuevas tecnologías para la finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_5630254a_8540_417c_8a61_1b323d4668ab, [
      { text: `Una junta familiar` },
      { text: `Propietario y productor en conjunto` },
      { text: `El propietario exclusivamente` },
      { text: `El productor / administrador` },
    ]);

    const q_a3996f83_8432_43da_ab02_ee5a041beb7e = await saveQuestion(manager, {
      text: `PR.4 ★ — ¿Estaría dispuesto a pagar por un servicio digital de monitoreo o gestión de su finca?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a3996f83_8432_43da_ab02_ee5a041beb7e, [
      { text: `Sí, \$20.001–\$50.000 COP/mes` },
      { text: `Solo si fuera gratuito` },
      { text: `Sí, más de \$50.000 COP/mes` },
      { text: `No estoy interesado` },
      { text: `Sí, pagaría hasta \$20.000 COP/mes` },
    ]);

    const q_a6b07573_f857_4688_99ae_a7422ef79e08 = await saveQuestion(manager, {
      text: `PR.5 ★ — ¿Tiene acceso a crédito o líneas de financiamiento para inversión productiva?`,
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q_a6b07573_f857_4688_99ae_a7422ef79e08, [
      { text: `Sí, tengo acceso pero sin uso reciente` },
      { text: `Sí, tengo crédito activo` },
      { text: `No tengo acceso a crédito formal` },
      { text: `He intentado pero no me han aprobado` },
    ]);

  }

  console.log(`[seed] "${NAME}" insertado (4 preguntas).`);
}
