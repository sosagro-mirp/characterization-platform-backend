import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
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
