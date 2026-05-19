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

const NAME = 'S11. Adopción Tecnológica: Perfil de Inversión del Propietario';
const VERSION = 1;

export async function seedInstrumentoAdopcionPropietarios(
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

  const typeNames = ['single_choice'];
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

  const secPR = await sectionRepo.save(
    sectionRepo.create({
      name: 'PR. Perfil de inversión del propietario',
      order: 1,
      instrument,
    }),
  );

  // ── PR. Perfil de inversión del propietario ───────────────────────────────────
  {
    let o = 1;

    const qPR1 = await saveQuestion(manager, {
      text: 'PR.1 ★ — ¿El propietario reside habitualmente en la finca o en zona urbana?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPR,
    });
    await saveOptions(manager, qPR1, [
      { text: 'En la misma finca o vereda' },
      { text: 'En el municipio cercano' },
      { text: 'En capital departamental' },
      { text: 'En otra ciudad / exterior' },
    ]);

    const qPR2 = await saveQuestion(manager, {
      text: 'PR.2 ★ — ¿Ha realizado inversiones en tecnología o infraestructura en los últimos 3 años?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPR,
    });
    await saveOptions(manager, qPR2, [
      { text: 'Sí, en los últimos 12 meses' },
      { text: 'Sí, entre 1–3 años atrás' },
      { text: 'No, pero tengo planes' },
      { text: 'No y sin planes actualmente' },
    ]);

    const qPR3 = await saveQuestion(manager, {
      text: 'PR.3 ★ — ¿Quién toma las decisiones de inversión en nuevas tecnologías para la finca?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPR,
    });
    await saveOptions(manager, qPR3, [
      { text: 'El propietario exclusivamente' },
      { text: 'El productor / administrador' },
      { text: 'Propietario y productor en conjunto' },
      { text: 'Una junta familiar' },
    ]);

    const qPR4 = await saveQuestion(manager, {
      text: 'PR.4 ★ — ¿Estaría dispuesto a pagar por un servicio digital de monitoreo o gestión de su finca?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPR,
    });
    await saveOptions(manager, qPR4, [
      { text: 'Sí, pagaría hasta $20.000 COP/mes' },
      { text: 'Sí, $20.001–$50.000 COP/mes' },
      { text: 'Sí, más de $50.000 COP/mes' },
      { text: 'Solo si fuera gratuito' },
      { text: 'No estoy interesado' },
    ]);

    const qPR5 = await saveQuestion(manager, {
      text: 'PR.5 ★ — ¿Tiene acceso a crédito o líneas de financiamiento para inversión productiva?',
      type: types.single_choice,
      isRequired: true,
      isSelectionCriteria: true,
      order: o++,
      section: secPR,
    });
    await saveOptions(manager, qPR5, [
      { text: 'Sí, tengo crédito activo' },
      { text: 'Sí, tengo acceso pero sin uso reciente' },
      { text: 'He intentado pero no me han aprobado' },
      { text: 'No tengo acceso a crédito formal' },
    ]);
  }
}
