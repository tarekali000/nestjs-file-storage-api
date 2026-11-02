import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create an account and receive an access token' })
  @ApiCreatedResponse({ description: 'User registered' })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login')
  @ApiOperation({ summary: 'Login and receive an access token' })
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }
}
