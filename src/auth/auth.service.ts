import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ROLES } from './constants';
import { RolesService } from '../roles/roles.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(dto.email, dto.password);
    return this.buildAuthResponse(user);
  }

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const code = this.configService.get<string>('REGISTRATION_CODE');
    if (!code || dto.validationCode !== code) {
      throw new ForbiddenException('Código de validación incorrecto');
    }

    const researcherRole = await this.rolesService.findByName(ROLES.RESEARCHER);
    if (!researcherRole) {
      throw new InternalServerErrorException(
        'El rol de investigador no está configurado en la base de datos',
      );
    }

    await this.usersService.create({
      name: dto.name,
      lastName: dto.lastName,
      email: dto.email,
      password: dto.password,
      roleId: researcherRole.roleId,
      mustChangePassword: false,
    });

    return { message: 'Registro exitoso. Ya puedes iniciar sesión.' };
  }

  buildAuthResponse(user: User): AuthResponseDto {
    const role = user.role?.name ?? null;
    const mustChangePassword = user.mustChangePassword ?? false;
    const payload: JwtPayload = {
      sub: user.userId,
      email: user.email,
      role,
      mustChangePassword,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        userId: user.userId,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        role,
        mustChangePassword,
      },
    };
  }
}
