import { EntityManager } from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { ROLES } from 'src/auth/constants';

const ROLE_NAMES: string[] = [ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER];

export async function seedRoles(manager: EntityManager): Promise<void> {
  const repo = manager.getRepository(Role);

  for (const name of ROLE_NAMES) {
    const existing = await repo.findOne({ where: { name } });

    if (existing) {
      console.log(`[seed] Role "${name}" ya existe. Se omite.`);
      continue;
    }

    const role = repo.create({ name });
    await repo.save(role);
    console.log(`[seed] Role creado: ${name}`);
  }
}
