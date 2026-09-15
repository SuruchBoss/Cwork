import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'hr.admin@cwork.example' })
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

  @ApiPropertyOptional({ example: 'Pixel 8 · Cwork Mobile' })
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
  @ApiProperty({ example: false, description: 'Always false on this branch' })
  mfaRequired!: false;

  @ApiProperty({ type: SessionUserDto }) user!: SessionUserDto;
}

// ---------------------------------------------------------------------- MFA

/**
 * What `POST /auth/login` returns when the password was right but the account
 * still owes a second factor.
 *
 * A discriminated union on `mfaRequired`: clients branch on it rather than
 * guessing from which fields happen to be present.
 */
export class MfaChallengeResponseDto {
  @ApiProperty({ example: true, description: 'Always true on this branch' })
  mfaRequired!: true;

  @ApiProperty({
    description: 'False when the account must set up a second factor before it can sign in',
  })
  mfaEnrolled!: boolean;

  @ApiProperty({ description: 'Short-lived token that opens only the MFA endpoints' })
  challengeToken!: string;

  @ApiProperty({ description: 'Challenge lifetime in seconds' })
  expiresIn!: number;
}

export class MfaCodeDto {
  @ApiProperty({
    example: '123456',
    description: 'A six-digit code from the authenticator app, or a recovery code',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}

export class MfaVerifyDto extends MfaCodeDto {
  @ApiProperty({ description: 'The challengeToken returned by /auth/login' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  challengeToken!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) deviceName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) platform?: string;
}

export class MfaEnrolDto {
  @ApiPropertyOptional({
    description: 'Challenge token, when enrolling mid-sign-in rather than from a session',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  challengeToken?: string;
}

export class MfaActivateDto extends MfaCodeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  challengeToken?: string;
}

export class MfaEnrolmentResponseDto {
  @ApiProperty({ description: 'Base32 secret — shown once, for manual entry' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for the QR code' })
  otpauthUri!: string;
}

export class MfaRecoveryCodesResponseDto {
  @ApiProperty({ type: [String], description: 'Shown once and never again' })
  recoveryCodes!: string[];
}

export class MfaStatusResponseDto {
  @ApiProperty() required!: boolean;
  @ApiProperty() enrolled!: boolean;
  @ApiProperty({ nullable: true }) enrolledAt!: string | null;
  @ApiProperty() recoveryCodesRemaining!: number;
}
