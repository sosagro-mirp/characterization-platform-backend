import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
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

const NAME = `S13: Validaciones técnico`;
const VERSION = 1;

export async function seedInstrumentoS13ValidacionesTecnico(manager: EntityManager): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })) {
    console.log(`[seed] "${NAME}" v${VERSION} ya existe. Se omite.`);
    return;
  }

  const numeric = await typeRepo.findOne({ where: { name: 'numeric' } });
  if (!numeric) throw new Error(`[seed] TypeOfQuestion "numeric" no encontrado.`);

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2026-07-06',
      isActive: true,
    }),
  );
  console.log(`[seed] "${NAME}" creado.`);

  const sec1 = await sectionRepo.save(
    sectionRepo.create({ name: `Validación GPS de la unidad productiva`, order: 1, instrument }),
  );

  // ── Validación GPS de la unidad productiva ──
  {
    let o = 1;

    await saveQuestion(manager, {
      text: `Latitud GPS`,
      type: numeric,
      isRequired: true,
      systemField: 'farm.latitude',
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Longitud GPS`,
      type: numeric,
      isRequired: true,
      systemField: 'farm.longitude',
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: `Altitud (msnm)`,
      type: numeric,
      isRequired: false,
      systemField: 'farm.altitude',
      order: o++,
      section: sec1,
    });
  }

  console.log(`[seed] "${NAME}" insertado (3 preguntas).`);
}
