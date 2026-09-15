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
  /**
   * Where rate-limit counters live. `memory` is right for a single instance and
   * quietly wrong for several: N replicas hand out N times the budget. `postgres`
   * shares them, at the cost of one round-trip per request.
   */
  @IsIn(['memory', 'postgres'])
  THROTTLE_STORAGE: string = 'memory';

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

  /**
   * The longest a scheduled task may hold its cross-instance lock.
   *
   * The lock lives inside a database transaction, so this is also how long that
   * transaction stays open; a task that runs past it loses the lock and another
   * instance may start the next run. Raise it for a large enough organisation
   * that the nightly attendance close-out takes longer than this.
   */
  @toInt()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  JOB_LOCK_TIMEOUT_MS: number = 900000;

  /**
   * How often each instance polls the outbox, in milliseconds. `0` switches
   * dispatch off, which is for tests and for an instance deliberately kept out
   * of delivery — the API says which at boot either way.
   *
   * Every instance polls: the claim uses `FOR UPDATE SKIP LOCKED`, so they take
   * different rows rather than the same ones.
   */
  @toInt()
  @IsInt()
  @Min(0)
  @Max(600000)
  OUTBOX_POLL_MS: number = 5000;

  /** Events claimed per poll. The batch is dispatched inside one transaction. */
  @toInt()
  @IsInt()
  @Min(1)
  @Max(500)
  OUTBOX_BATCH_SIZE: number = 20;

  /** Failures before an event is parked as a dead letter instead of retried. */
  @toInt()
  @IsInt()
  @Min(1)
  @Max(50)
  OUTBOX_MAX_ATTEMPTS: number = 8;

  /** How long delivered events are kept before the nightly purge removes them. */
  @toInt()
  @IsInt()
  @Min(1)
  @Max(3650)
  OUTBOX_RETENTION_DAYS: number = 14;

  /**
   * Email delivery. Off by default because there is no sensible default relay,
   * and the API says which mode it is in at every boot — a deployment can never
   * quietly believe it is sending mail when it is not.
   */
  @toBool()
  @IsBoolean()
  EMAIL_ENABLED: boolean = false;

  @IsString()
  SMTP_HOST: string = 'localhost';

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number = 587;

  /** `starttls` upgrades a plain connection; `tls` is implicit TLS (port 465). */
  @IsIn(['starttls', 'tls', 'none'])
  SMTP_SECURITY: string = 'starttls';

  @IsOptional()
  @IsString()
  SMTP_USERNAME?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsString()
  SMTP_FROM_ADDRESS: string = 'no-reply@cwork.local';

  @IsString()
  SMTP_FROM_NAME: string = 'Cwork';

  @toInt()
  @IsInt()
  @Min(1000)
  @Max(120000)
  SMTP_TIMEOUT_MS: number = 15000;

  /**
   * Where links in an email point. Without it a message can say something is
   * waiting but not where, which is the same as not sending it.
   */
  @IsString()
  PUBLIC_WEB_URL: string = 'http://localhost:8080';

  /**
   * Push delivery through Firebase Cloud Messaging's HTTP v1 API. iOS goes
   * through FCM too — the app registers an FCM token either way — so there is
   * no separate APNs path.
   */
  @toBool()
  @IsBoolean()
  PUSH_ENABLED: boolean = false;

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FCM_CLIENT_EMAIL?: string;

  /** The service account's private key, PEM, newlines escaped as `\n`. */
  @IsOptional()
  @IsString()
  FCM_PRIVATE_KEY?: string;

  /** Overridable so tests can point the client at a server they control. */
  @IsString()
  FCM_TOKEN_URI: string = 'https://oauth2.googleapis.com/token';

  @IsString()
  FCM_ENDPOINT: string = 'https://fcm.googleapis.com';

  @toInt()
  @IsInt()
  @Min(1000)
  @Max(120000)
  FCM_TIMEOUT_MS: number = 10000;

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

  // Not production-only: a channel switched on and left unconfigured is a
  // mistake at every tier, and the symptom — a queue quietly filling with
  // retries nobody is watching — reads nothing like its cause.
  assertDeliveryConfiguration(config);

  if (config.NODE_ENV === 'production') {
    assertProductionSafety(config);
  }

  return config;
}

/**
 * A delivery channel that is on must be able to deliver.
 *
 * Refusing to boot is the right answer rather than warning and carrying on:
 * `EMAIL_ENABLED=true` is somebody saying they want mail sent, and the
 * alternative is an outbox that fills with dead letters over a setting the
 * operator believes they already made.
 */
function assertDeliveryConfiguration(config: EnvironmentVariables): void {
  const problems: string[] = [];

  if (config.EMAIL_ENABLED) {
    if (!config.SMTP_HOST.trim()) problems.push('EMAIL_ENABLED=true requires SMTP_HOST');
    if (!config.SMTP_FROM_ADDRESS.includes('@')) {
      problems.push('EMAIL_ENABLED=true requires SMTP_FROM_ADDRESS to be an email address');
    }
    if (config.SMTP_USERNAME && !config.SMTP_PASSWORD) {
      problems.push('SMTP_USERNAME is set without SMTP_PASSWORD');
    }
  }

  if (config.PUSH_ENABLED) {
    const missing = (
      [
        ['FCM_PROJECT_ID', config.FCM_PROJECT_ID],
        ['FCM_CLIENT_EMAIL', config.FCM_CLIENT_EMAIL],
        ['FCM_PRIVATE_KEY', config.FCM_PRIVATE_KEY],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      problems.push(`PUSH_ENABLED=true requires ${missing.join(', ')}`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Incomplete notification delivery configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }
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
