import { validateEnv } from './env.validation';

/** The minimum a boot needs before any of the optional pieces are considered. */
const BASE = {
  DATABASE_URL: 'postgresql://cwork:cwork@localhost:5432/cwork?schema=public',
  JWT_ACCESS_SECRET: 'an-access-secret-that-is-at-least-32-characters',
  JWT_REFRESH_SECRET: 'a-refresh-secret-that-is-at-least-32-characters',
  FIELD_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
};

/**
 * A delivery channel that is switched on and cannot deliver.
 *
 * The reason this refuses to boot rather than warning: the symptom is an outbox
 * quietly filling with dead letters, days later, over a setting the operator
 * believes they already made. Nothing about that points back at the cause.
 */
describe('delivery configuration', () => {
  it('boots with both channels off, which is the default', () => {
    const config = validateEnv({ ...BASE });

    expect(config.EMAIL_ENABLED).toBe(false);
    expect(config.PUSH_ENABLED).toBe(false);
  });

  it('refuses to boot with email on and no relay', () => {
    expect(() => validateEnv({ ...BASE, EMAIL_ENABLED: 'true', SMTP_HOST: '' })).toThrow(
      /requires SMTP_HOST/,
    );
  });

  it('refuses to boot with email on and no sender address', () => {
    expect(() =>
      validateEnv({ ...BASE, EMAIL_ENABLED: 'true', SMTP_FROM_ADDRESS: 'not-an-address' }),
    ).toThrow(/SMTP_FROM_ADDRESS/);
  });

  it('refuses a username with no password, which is always a slip', () => {
    expect(() => validateEnv({ ...BASE, EMAIL_ENABLED: 'true', SMTP_USERNAME: 'robot' })).toThrow(
      /SMTP_USERNAME is set without SMTP_PASSWORD/,
    );
  });

  it('names every missing push credential at once, not the first', () => {
    // Three boots to learn three missing variables is three deploys.
    expect(() => validateEnv({ ...BASE, PUSH_ENABLED: 'true' })).toThrow(
      /FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY/,
    );
  });

  it('boots when a channel that is on is fully configured', () => {
    const config = validateEnv({
      ...BASE,
      EMAIL_ENABLED: 'true',
      SMTP_HOST: 'smtp.example.com',
      SMTP_FROM_ADDRESS: 'no-reply@example.com',
      PUSH_ENABLED: 'true',
      FCM_PROJECT_ID: 'p',
      FCM_CLIENT_EMAIL: 'push@p.iam.gserviceaccount.com',
      FCM_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----',
    });

    expect(config.EMAIL_ENABLED).toBe(true);
    expect(config.PUSH_ENABLED).toBe(true);
  });

  it('says nothing about a channel that is off, however it is configured', () => {
    expect(() => validateEnv({ ...BASE, EMAIL_ENABLED: 'false', SMTP_HOST: '' })).not.toThrow();
  });
});

/**
 * An assistant that is switched on and cannot answer.
 *
 * spec.md states the rule and security.md lists it among the things that refuse
 * to boot, but the check ran only in production and only for the Anthropic
 * provider. Every other way of switching the assistant on reached `GET /config`
 * as `assistantEnabled: true`, both clients drew it, and every question came
 * back ASSISTANT_DISABLED — a deployment reporting a capability it lacks.
 */
describe('assistant configuration', () => {
  it('boots with the assistant off, which is the default', () => {
    const config = validateEnv({ ...BASE });

    expect(config.ASSISTANT_ENABLED).toBe(false);
    expect(config.ASSISTANT_PROVIDER).toBe('none');
  });

  it('rejects a provider name that has no implementation', () => {
    expect(() =>
      validateEnv({ ...BASE, ASSISTANT_ENABLED: 'true', ASSISTANT_PROVIDER: 'openai-compatible' }),
    ).toThrow(/ASSISTANT_PROVIDER must be one of the following values: anthropic, none/);
  });

  it('refuses to boot with the assistant on and no provider named', () => {
    expect(() =>
      validateEnv({ ...BASE, ASSISTANT_ENABLED: 'true', ASSISTANT_PROVIDER: 'none' }),
    ).toThrow(/requires ASSISTANT_PROVIDER to name a provider/);
  });

  /** The case the production-only check used to miss everywhere else. */
  it('refuses to boot with anthropic and no key, outside production too', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'development',
        ASSISTANT_ENABLED: 'true',
        ASSISTANT_PROVIDER: 'anthropic',
      }),
    ).toThrow(/requires ANTHROPIC_API_KEY/);
  });

  it('boots when the assistant is on and can actually answer', () => {
    const config = validateEnv({
      ...BASE,
      ASSISTANT_ENABLED: 'true',
      ASSISTANT_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-example',
    });

    expect(config.ASSISTANT_ENABLED).toBe(true);
    expect(config.ASSISTANT_PROVIDER).toBe('anthropic');
  });

  it('says nothing about an assistant that is off, however it is configured', () => {
    expect(() =>
      validateEnv({ ...BASE, ASSISTANT_ENABLED: 'false', ASSISTANT_PROVIDER: 'none' }),
    ).not.toThrow();
  });
});
