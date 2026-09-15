import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ORGANIZATION_CODE_RULE } from '../domain/organization-code';

export class CompleteSetupDto {
  @ApiProperty({
    description:
      'The one-time token printed by `npm run db:init -- --web`. There is no ' +
      'other way to obtain one: minting a token requires shell access to the server.',
  })
  @IsString()
  @Length(10, 200)
  token!: string;

  @ApiProperty({ example: 'บริษัท ตัวอย่าง จำกัด' })
  @IsString()
  @Length(2, 200)
  organizationName!: string;

  @ApiPropertyOptional({
    description: `Short code used in logs and job output. ${ORGANIZATION_CODE_RULE} Derived from the name when omitted.`,
    example: 'ACME',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$/, { message: ORGANIZATION_CODE_RULE })
  organizationCode?: string;

  @ApiProperty({ example: 'Asia/Bangkok' })
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @ApiProperty({ description: "The first administrator's sign-in address." })
  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;

  @ApiProperty({
    description:
      'Held to the same password policy as every other account. The first ' +
      'administrator holds every permission there is, so it is also required ' +
      'to enrol a second factor at its first sign-in.',
  })
  @IsString()
  @Length(1, 256)
  adminPassword!: string;
}

export class SetupStatusDto {
  @ApiProperty({ description: 'Whether this installation already has an organisation.' })
  initialised!: boolean;
}

export class SetupCompletedDto {
  @ApiProperty()
  organization!: { id: string; code: string; name: string; timezone: string };

  @ApiProperty()
  administrator!: { id: string; email: string; role: string };

  @ApiProperty({ description: 'How many system roles were created alongside it.' })
  rolesCreated!: number;

  @ApiProperty({
    description: 'What the installer has to do next, in a form the client can branch on.',
    example: 'sign-in-and-enrol-mfa',
  })
  nextStep!: string;
}
