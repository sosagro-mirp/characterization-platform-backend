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
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: { text: string; isOther?: boolean }[],
): Promise<void> {
  const repo = manager.getRepository(OptionQuestion);
  for (const opt of options) {
    await repo.save(
      repo.create({ question, text: opt.text, isOther: opt.isOther ?? false }),
    );
  }
}

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S10: Interés en Participar en el Proyecto';
const VERSION = 1;

export async function seedInstrumentoParticipacion(
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

  const typeNames = ['open_text', 'yes_no', 'single_choice', 'multiple_choice'];
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

  const [sec101, sec102, sec103] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({
        name: '10.1 Socialización del proyecto',
        order: 1,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '10.2 Modalidad de participación deseada',
        order: 2,
        instrument,
      }),
    ),
    sectionRepo.save(
      sectionRepo.create({
        name: '10.3 Condiciones de participación',
        order: 3,
        instrument,
      }),
    ),
  ]);

  // ── 10.1 Socialización del proyecto ──────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '10.1 — Antes de este taller, ¿conocía el proyecto SOS AGRO?',
      type: types.yes_no,
      isRequired: false,
      order: o++,
      section: sec101,
    });

    await saveQuestion(manager, {
      text: '10.2 — ¿Cómo se enteró del proyecto?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec101,
    });

    const q103 = await saveQuestion(manager, {
      text: '10.3 — Después de la socialización de hoy, ¿el proyecto responde a sus necesidades?',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec101,
    });
    await saveOptions(manager, q103, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'No sabe / No aplica' },
    ]);

    await saveQuestion(manager, {
      text: '10.4 — ¿Qué aspecto del proyecto le parece más útil para su actividad?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec101,
    });
  }

  // ── 10.2 Modalidad de participación deseada ───────────────────────────────────
  {
    const q105 = await saveQuestion(manager, {
      text: '10.5 ★ — ¿En qué modalidad le interesaría participar en el proyecto?',
      type: types.multiple_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: 1,
      section: sec102,
    });
    await saveOptions(manager, q105, [
      {
        text: 'Diagnóstico de la cadena (talleres, encuestas, grupos focales)',
      },
      {
        text: 'Unidad productiva para instalación de sensores (Objetivo 1 — tecnología de campo)',
      },
      {
        text: 'Unidad productiva para valorización de residuos (Objetivo 2 — energía, materiales, agua)',
      },
      {
        text: 'Unidad productiva para análisis de calidad en plataforma SOS AGRO (Objetivo 3)',
      },
      {
        text: 'Capacitaciones en uso de la App de conectividad y plataforma digital',
      },
      {
        text: 'Socialización de resultados y adopción de tecnologías exitosas',
      },
      { text: 'No tengo interés en participar' },
    ]);
  }

  // ── 10.3 Condiciones de participación ────────────────────────────────────────
  {
    let o = 1;

    const q106 = await saveQuestion(manager, {
      text: '10.6 ★ — Si su finca es seleccionada, ¿permitiría el acceso del equipo investigador para instalar equipos / sensores?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec103,
    });
    await saveOptions(manager, q106, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'Tal vez' },
    ]);

    const q107 = await saveQuestion(manager, {
      text: '10.7 ★ — ¿Estaría dispuesto a compartir datos productivos con el equipo de investigación?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec103,
    });
    await saveOptions(manager, q107, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'Tal vez' },
    ]);

    const q108 = await saveQuestion(manager, {
      text: '10.8 ★ — ¿Puede comprometerse con el seguimiento del proyecto durante al menos 2 años?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: sec103,
    });
    await saveOptions(manager, q108, [
      { text: 'Sí' },
      { text: 'No' },
      { text: 'Tal vez' },
    ]);

    await saveQuestion(manager, {
      text: '10.9 — ¿Tiene alguna limitación o condición especial para participar?',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec103,
    });

    await saveQuestion(manager, {
      text: '10.10 — Comentarios adicionales o preguntas sobre el proyecto',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec103,
    });
  }
}
