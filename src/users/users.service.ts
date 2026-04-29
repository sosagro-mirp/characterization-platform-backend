import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

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

    const { institutionId, laboratoryId, roleId, password, ...rest } =
      createUserDto;

    const user = this.usersRepository.create({
      ...rest,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      institution: institutionId ? ({ institutionId } as any) : undefined,
      laboratory: laboratoryId ? ({ laboratoryId } as any) : undefined,
      role: roleId ? ({ roleId } as any) : undefined,
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
    }
    if (institutionId !== undefined) {
      user.institution = institutionId
        ? ({ institutionId } as any)
        : undefined;
    }
    if (laboratoryId !== undefined) {
      user.laboratory = laboratoryId ? ({ laboratoryId } as any) : undefined;
    }
    if (roleId !== undefined) {
      user.role = roleId ? ({ roleId } as any) : undefined;
    }

    await this.usersRepository.save(user);
    return this.findOne(userId);
  }

  async remove(userId: string): Promise<void> {
    const user = await this.findOne(userId);
    await this.usersRepository.remove(user);
  }
}
