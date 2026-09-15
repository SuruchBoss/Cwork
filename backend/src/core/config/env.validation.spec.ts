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
