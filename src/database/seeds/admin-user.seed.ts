import * as bcrypt from 'bcrypt';
import { EntityManager } from 'typeorm';
import { Role } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/user.entity';
import { ROLES } from 'src/auth/constants';

const BCRYPT_ROUNDS = 10;

export async function seedAdminUser(manager: EntityManager): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      '[seed] ADMIN_EMAIL o ADMIN_PASSWORD no definidos. Se omite admin user.',
    );
    return;
  }

  const usersRepo = manager.getRepository(User);
  const rolesRepo = manager.getRepository(Role);

  const existing = await usersRepo.findOne({ where: { email } });
  if (existing) {
    console.log(`[seed] Admin user "${email}" ya existe. Se omite.`);
    return;
  }

  const adminRole = await rolesRepo.findOne({ where: { name: ROLES.ADMIN } });
  if (!adminRole) {
    throw new Error(
      '[seed] Role "admin" no encontrado. Ejecutar seedRoles antes de seedAdminUser.',
    );
  }

  const user = usersRepo.create({
    name: 'Admin',
    lastName: 'SOSAgro',
    email,
    password: await bcrypt.hash(password, BCRYPT_ROUNDS),
    role: adminRole,
  });

  await usersRepo.save(user);
  console.log(`[seed] Admin user creado: ${email}`);
}
