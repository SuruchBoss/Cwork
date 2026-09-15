import { EnvironmentVariables } from './env.validation';

export interface AppConfig {
  env: string;
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  defaults: { timezone: string; locale: string; currency: string };
}

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  issuer: string;
  audience: string;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  passwordMinLength: number;
  /** Requests per minute allowed against the credential endpoints. */
  credentialThrottleLimit: number;
  /**
   * How long the token handed out between password and second factor stays
   * valid. Long enough to fetch a code from a phone, short enough that a
   * half-finished sign-in is not a standing invitation.
   */
  mfaChallengeTtlSeconds: number;
}

export interface StorageConfig {
  driver: 'local' | 's3';
  localPath: string;
  s3: {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
  };
}

/** Where the malware scanner lives, and whether there is one at all. */
export interface MalwareScanConfig {
  enabled: boolean;
  host: string;
  port: number;
  timeoutMs: number;
}

export interface AssistantConfig {
  enabled: boolean;
  provider: 'anthropic' | 'openai-compatible' | 'none';
  apiKey?: string;
  model: string;
  maxTokens: number;
  embeddingProvider: 'none' | 'openai';
  embeddingModel: string;
  openAiApiKey?: string;
  dailyMessageLimit: number;
  dailyTokenLimit: number;
}

export interface RootConfig {
  app: AppConfig;
  auth: AuthConfig;
  storage: StorageConfig;
  assistant: AssistantConfig;
  security: {
    fieldEncryptionKey: string;
    throttleTtl: number;
    throttleLimit: number;
    throttleStorage: 'memory' | 'postgres';
  };
  malwareScan: MalwareScanConfig;
  log: { level: string; pretty: boolean };
}

/** Maps flat environment variables onto the typed config tree the app injects. */
export function buildConfig(env: EnvironmentVariables): RootConfig {
  return {
    app: {
      env: env.NODE_ENV,
      isProduction: env.NODE_ENV === 'production',
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      corsOrigins: env.CORS_ORIGINS.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
      defaults: {
        timezone: env.DEFAULT_TIMEZONE,
        locale: env.DEFAULT_LOCALE,
        currency: env.DEFAULT_CURRENCY,
      },
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtlSeconds: env.JWT_ACCESS_TTL,
      refreshTtlSeconds: env.JWT_REFRESH_TTL,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockoutMinutes: env.AUTH_LOCKOUT_MINUTES,
      passwordMinLength: env.PASSWORD_MIN_LENGTH,
      credentialThrottleLimit: env.AUTH_THROTTLE_LIMIT,
      mfaChallengeTtlSeconds: env.MFA_CHALLENGE_TTL,
    },
    storage: {
      driver: env.STORAGE_DRIVER as 'local' | 's3',
      localPath: env.STORAGE_LOCAL_PATH,
      s3: {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKey: env.S3_ACCESS_KEY,
        secretKey: env.S3_SECRET_KEY,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      },
    },
    malwareScan: {
      enabled: env.MALWARE_SCAN_ENABLED,
      host: env.CLAMAV_HOST,
      port: env.CLAMAV_PORT,
      timeoutMs: env.CLAMAV_TIMEOUT_MS,
    },
    assistant: {
      enabled: env.ASSISTANT_ENABLED,
      provider: env.ASSISTANT_PROVIDER as AssistantConfig['provider'],
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ASSISTANT_MODEL,
      maxTokens: env.ASSISTANT_MAX_TOKENS,
      embeddingProvider: env.ASSISTANT_EMBEDDING_PROVIDER as 'none' | 'openai',
      embeddingModel: env.ASSISTANT_EMBEDDING_MODEL,
      openAiApiKey: env.OPENAI_API_KEY,
      dailyMessageLimit: env.ASSISTANT_DAILY_MESSAGE_LIMIT,
      dailyTokenLimit: env.ASSISTANT_DAILY_TOKEN_LIMIT,
    },
    security: {
      fieldEncryptionKey: env.FIELD_ENCRYPTION_KEY,
      throttleTtl: env.THROTTLE_TTL,
      throttleLimit: env.THROTTLE_LIMIT,
      throttleStorage: env.THROTTLE_STORAGE as 'memory' | 'postgres',
    },
    log: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY },
  };
}
