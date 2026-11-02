import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username is already registered');
    const user = await this.prisma.user.create({
      data: { username: dto.username, passwordHash: await bcrypt.hash(dto.password, 12) },
      select: { id: true, username: true, createdAt: true },
    });
    return { user, accessToken: await this.sign(user.id, user.username) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return {
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      accessToken: await this.sign(user.id, user.username),
    };
  }

  private sign(id: string, username: string) {
    return this.jwt.signAsync({ sub: id, username });
  }
}
