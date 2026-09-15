import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const toBool = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() === 'true' : !!value));
const toInt = () => Transform(({ value }) => (value === undefined ? undefined : Number(value)));

/**
 * Fail fast on boot rather than at the first request. Every value the app reads
 * at runtime must appear here, so a missing secret is a startup error.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'staging', 'production'])
  NODE_ENV: string = 'development';

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  API_PREFIX: string = 'api';

  @IsString()
  CORS_ORIGINS: string = '';

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  // 32 bytes of entropy minimum. Short secrets make HS256 forgeable in practice.
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @toInt()
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL: number = 900;

  @toInt()
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL: number = 2592000;

  @IsString()
  JWT_ISSUER: string = 'cwork';

  @IsString()
  JWT_AUDIENCE: string = 'cwork-clients';

  /** base64-encoded 32-byte AES-256-GCM key for encrypted PII columns. */
  @IsString()
  @MinLength(32, { message: 'FIELD_ENCRYPTION_KEY must be a base64 32-byte key' })
  FIELD_ENCRYPTION_KEY!: string;

  @toInt()
  @IsInt()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @toInt()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 120;

  @toInt()
  @IsInt()
  @Min(1)
  @Max(20)
  AUTH_MAX_FAILED_ATTEMPTS: number = 5;

  @toInt()
  @IsInt()
  @Min(1)
  AUTH_LOCKOUT_MINUTES: number = 15;

  @toInt()
  @IsInt()
  @Min(8)
  PASSWORD_MIN_LENGTH: number = 12;

  /**
   * Requests per minute allowed against the credential endpoints (sign-in, MFA
   * verify, enrolment). Much tighter than the global limit on purpose. Raise it
   * only for a deployment behind a shared egress address — or in tests.
   */
  @toInt()
  @IsInt()
  @Min(3)
  AUTH_THROTTLE_LIMIT: number = 10;

  /** Seconds a half-finished sign-in stays resumable while MFA is pending. */
  @toInt()
  @IsInt()
  @Min(60)
  @Max(1800)
  MFA_CHALLENGE_TTL: number = 300;

  /**
   * Malware scanning. Off by default because it needs a clamd to talk to, and
   * a scanner that silently is not there would be worse than none at all — see
   * MalwareScannerService, which says so at boot either way.
   */
  @toBool()
  @IsBoolean()
  MALWARE_SCAN_ENABLED: boolean = false;

  @IsString()
  CLAMAV_HOST: string = '127.0.0.1';

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65535)
  CLAMAV_PORT: number = 3310;

  /** How long to wait for a verdict before leaving the file unscanned. */
  @toInt()
  @IsInt()
  @Min(1000)
  @Max(300000)
  CLAMAV_TIMEOUT_MS: number = 15000;

  @IsIn(['local', 's3'])
  STORAGE_DRIVER: string = 'local';

  @IsString()
  STORAGE_LOCAL_PATH: string = './uploads';

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  @toBool()
  @IsBoolean()
  S3_FORCE_PATH_STYLE: boolean = true;

  @toBool()
  @IsBoolean()
  ASSISTANT_ENABLED: boolean = false;

  @IsIn(['anthropic', 'openai-compatible', 'none'])
  ASSISTANT_PROVIDER: string = 'none';

  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsString()
  ASSISTANT_MODEL: string = 'claude-sonnet-5';

  @toInt()
  @IsInt()
  @Min(256)
  ASSISTANT_MAX_TOKENS: number = 1500;

  @IsIn(['none', 'openai'])
  ASSISTANT_EMBEDDING_PROVIDER: string = 'none';

  @IsString()
  ASSISTANT_EMBEDDING_MODEL: string = 'text-embedding-3-small';

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @toInt()
  @IsInt()
  @Min(1)
  ASSISTANT_DAILY_MESSAGE_LIMIT: number = 100;

  @toInt()
  @IsInt()
  @Min(1000)
  ASSISTANT_DAILY_TOKEN_LIMIT: number = 200000;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL: string = 'info';

  @toBool()
  @IsBoolean()
  LOG_PRETTY: boolean = false;

  @IsString()
  DEFAULT_TIMEZONE: string = 'Asia/Bangkok';

  @IsString()
  DEFAULT_LOCALE: string = 'th';

  @IsString()
  DEFAULT_CURRENCY: string = 'THB';
}

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const config = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  if (config.NODE_ENV === 'production') {
    assertProductionSafety(config);
  }

  return config;
}

/**
 * Guardrails that only matter in production. Keeping them here means a
 * misconfigured deploy refuses to start instead of quietly running insecurely.
 */
function assertProductionSafety(config: EnvironmentVariables): void {
  const problems: string[] = [];

  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  if (/change-me/i.test(config.JWT_ACCESS_SECRET) || /change-me/i.test(config.JWT_REFRESH_SECRET)) {
    problems.push('JWT secrets still contain the placeholder value from .env.example');
  }
  if (!config.CORS_ORIGINS.trim()) {
    problems.push('CORS_ORIGINS must list the exact allowed origins in production');
  }
  if (config.CORS_ORIGINS.includes('*')) {
    problems.push('CORS_ORIGINS must not contain a wildcard in production');
  }
  if (
    config.ASSISTANT_ENABLED &&
    config.ASSISTANT_PROVIDER === 'anthropic' &&
    !config.ANTHROPIC_API_KEY
  ) {
    problems.push('ASSISTANT_ENABLED=true with provider "anthropic" requires ANTHROPIC_API_KEY');
  }

  if (problems.length > 0) {
    throw new Error(
      `Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
}
