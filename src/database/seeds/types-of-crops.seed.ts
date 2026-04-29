import { EntityManager } from 'typeorm';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';

const CROPS: { name: string }[] = [
  { name: 'Café' },
  { name: 'Cacao' },
  { name: 'Cannabis' },
  { name: 'Cáñamo' },
];

export async function seedTypesOfCrops(manager: EntityManager): Promise<void> {
  const repo = manager.getRepository(TypeOfCrop);

  for (const def of CROPS) {
    const existing = await repo.findOne({ where: { name: def.name } });

    if (existing) {
      console.log(`[seed] TypeOfCrop "${def.name}" ya existe. Se omite.`);
      continue;
    }

    const crop = repo.create(def);
    await repo.save(crop);
    console.log(`[seed] TypeOfCrop creado: ${def.name}`);
  }
}
