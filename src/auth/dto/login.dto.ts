import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'tarek' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @Length(1, 72)
  password: string;
}
