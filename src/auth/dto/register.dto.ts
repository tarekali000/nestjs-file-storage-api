import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'tarek' })
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'username contains unsupported characters' })
  username: string;

  @ApiProperty({ example: 'StrongPassword123!', minLength: 8 })
  @IsString()
  @Length(8, 72)
  password: string;
}
