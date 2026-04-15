import { EntityManager } from 'typeorm';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';

const ACTOR_TYPES: { name: string; description: string }[] = [
  {
    name: 'propietario',
    description: 'Dueño de la unidad productiva (finca)',
  },
  {
    name: 'extensionista',
    description: 'Agente de campo o técnico agrícola',
  },
  {
    name: 'productor',
    description: 'Agricultor que trabaja la finca (farmer)',
  },
];

export async function seedActorTypes(manager: EntityManager): Promise<void> {
  const repo = manager.getRepository(ActorType);

  for (const def of ACTOR_TYPES) {
    const existing = await repo.findOne({ where: { name: def.name } });

    if (existing) {
      console.log(`[seed] ActorType "${def.name}" ya existe. Se omite.`);
      continue;
    }

    const actorType = repo.create(def);
    await repo.save(actorType);
    console.log(`[seed] ActorType creado: ${def.name}`);
  }
}
