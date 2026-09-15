import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'hr.admin@marma.example' })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({
    description: 'Stable per-install id so sessions can be listed and revoked',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: 'Pixel 8 · MarMa Mobile' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceName?: string;

  @ApiPropertyOptional({ example: 'android' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token!: string;

  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ description: 'Access token lifetime in seconds' }) expiresIn!: number;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
}

export class SessionUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty({ nullable: true }) employeeId!: string | null;
  @ApiProperty({ nullable: true }) displayName!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() locale!: string;
  @ApiProperty({ nullable: true }) photoUrl!: string | null;
}

export class LoginResponseDto extends AuthTokensDto {
  @ApiProperty({ type: SessionUserDto }) user!: SessionUserDto;
}
