import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Institution } from 'src/institutions/entities/institution.entity';
import { Laboratory } from 'src/laboratories/entities/laboratory.entity';
import { Role } from 'src/roles/entities/role.entity';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const {
      institutionId,
      laboratoryId,
      roleId,
      password,
      mustChangePassword,
      ...rest
    } = createUserDto;

    const user = this.usersRepository.create({
      ...rest,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      ...(mustChangePassword !== undefined && { mustChangePassword }),
      institution: institutionId ? { institutionId } : undefined,
      laboratory: laboratoryId ? { laboratoryId } : undefined,
      role: roleId ? { roleId } : undefined,
    });

    const saved = await this.usersRepository.save(user);
    return this.findOne(saved.userId);
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['institution', 'laboratory', 'role'],
    });
  }

  async findOne(userId: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { userId },
      relations: ['institution', 'laboratory', 'role'],
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.institution', 'institution')
      .leftJoinAndSelect('user.laboratory', 'laboratory')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async update(userId: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(userId);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const clash = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });
      if (clash) {
        throw new ConflictException('Email already registered');
      }
    }

    const { institutionId, laboratoryId, roleId, password, ...rest } =
      updateUserDto;

    Object.assign(user, rest);
    if (password) {
      user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      user.mustChangePassword = true;
    }
    // Referencia parcial por id: TypeORM solo necesita la PK para persistir
    // la FK, sin cargar la entidad relacionada completa.
    if (institutionId !== undefined) {
      user.institution = institutionId
        ? ({ institutionId } as unknown as Institution)
        : undefined;
    }
    if (laboratoryId !== undefined) {
      user.laboratory = laboratoryId
        ? ({ laboratoryId } as unknown as Laboratory)
        : undefined;
    }
    if (roleId !== undefined) {
      user.role = roleId ? ({ roleId } as unknown as Role) : undefined;
    }

    await this.usersRepository.save(user);
    return this.findOne(userId);
  }

  async remove(userId: string): Promise<void> {
    const user = await this.findOne(userId);
    await this.usersRepository.remove(user);
  }

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.user_id = :userId', { userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Contraseña actual incorrecta');
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.mustChangePassword = false;
    await this.usersRepository.save(user);
  }
}
