import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface QuestionDef {
  text: string;
  type: TypeOfQuestion;
  isRequired: boolean;
  isSelectionCriteria?: boolean;
  order: number;
  section: Section;
  conditionQuestion?: Question;
  conditionValue?: string;
}

async function saveQuestion(
  manager: EntityManager,
  def: QuestionDef,
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(
    repo.create({
      text: def.text,
      type: def.type,
      isRequired: def.isRequired,
      isSelectionCriteria: def.isSelectionCriteria ?? false,
      order: def.order,
      section: def.section,
      conditionQuestion: def.conditionQuestion,
      conditionValue: def.conditionValue,
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; isOther?: boolean }[],
): Promise<Map<string, string>> {
  const repo = manager.getRepository(OptionQuestion);
  const map = new Map<string, string>();
  for (const opt of options) {
    const saved = await repo.save(
      repo.create({ question, text: opt.text, isOther: opt.isOther ?? false }),
    );
    map.set(opt.text, saved.optionId);
  }
  return map;
}

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S9: Asociatividad y Canales de Comercialización';
const VERSION = 1;

export async function seedInstrumentoAsociatividad(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const typeNames = ['open_text', 'yes_no', 'single_choice'];
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

  const [sec91, sec92] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '9.1 Pertenencia a organizaciones',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '9.2 Canales de comercialización',
        order: 2,
        instrument,
      }),
    ),
  ]);

  // ── 9.1 Pertenencia a organizaciones ─────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '9.1 ★ — ¿Pertenece a alguna federación, asociación, cooperativa o gremio?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.2 — Nombre de la organización',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.3 — Rol dentro de la organización',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.4 — ¿Recibe beneficios por pertenecer a esa organización?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.5 — ¿Qué beneficios recibe de la organización?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.6 ★ — ¿Recibe actualmente asistencia técnica o extensión agrícola?',
      type: types.yes_no,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.7 — Fuente de asistencia técnica',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec91,
    });

    await saveQuestion(manager, {
      text: '9.8 — ¿Ha participado en capacitaciones o talleres en los últimos 2 años?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec91,
    });
  }

  // ── 9.2 Canales de comercialización ──────────────────────────────────────────
  {
    let o = 1;

    const q99 = await saveQuestion(manager, {
      text: '9.9 ★ — Canal de comercialización principal que usa actualmente',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec92,
    });
    await saveOptions(manager, q99, [
      { text: 'Venta directa local' },
      { text: 'Intermediario / Acopiador' },
      { text: 'Cooperativa / Asociación' },
      { text: 'Exportación directa' },
      { text: 'Comercializador nacional' },
      { text: 'Industria / transformador' },
      { text: 'Otro', isOther: true },
    ]);

    const q910 = await saveQuestion(manager, {
      text: '9.10 ★ — ¿Conoce el precio de mercado actualizado de su producto?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec92,
    });
    await saveOptions(manager, q910, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);

    const q911 = await saveQuestion(manager, {
      text: '9.11 — ¿Exporta o ha exportado alguna vez?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec92,
    });

    await saveQuestion(manager, {
      text: '9.11b — ¿A qué mercados exporta o ha exportado?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec92,
      conditionQuestion: q911,
      conditionValue: 'true',
    });

    const q912 = await saveQuestion(manager, {
      text: '9.12 ★ — ¿Estaría interesado en acceder a mercados de mayor valor (especialidades, exportación)?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec92,
    });
    await saveOptions(manager, q912, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);

    await saveQuestion(manager, {
      text: '9.13 — ¿Qué le falta para acceder a esos mercados de mayor valor?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec92,
    });

    const q914 = await saveQuestion(manager, {
      text: '9.14 ★ — ¿Estaría interesado en conectarse con compradores a través de una plataforma digital?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec92,
    });
    await saveOptions(manager, q914, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);
  }
}
