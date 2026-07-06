import { EntityManager } from 'typeorm';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

const TYPES_OF_QUESTIONS: string[] = [
  'open_text',
  'numeric',
  'yes_no',
  'single_choice',
  'multiple_choice',
  'likert',
  'compliance',
  'image',
  'voice_recording',
  'document',
  'video',
];

export async function seedTypesOfQuestions(
  manager: EntityManager,
): Promise<void> {
  const repo = manager.getRepository(TypeOfQuestion);

  for (const name of TYPES_OF_QUESTIONS) {
    const existing = await repo.findOne({ where: { name } });

    if (existing) {
      console.log(`[seed] TypeOfQuestion "${name}" ya existe. Se omite.`);
      continue;
    }

    const type = repo.create({ name });
    await repo.save(type);
    console.log(`[seed] TypeOfQuestion creado: ${name}`);
  }
}
