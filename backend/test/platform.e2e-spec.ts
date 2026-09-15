/**
 * What a client is told about the deployment before it draws anything.
 *
 * `ASSISTANT_ENABLED=false` is the default, so until CW-027 the standard
 * install showed an assistant entry that could not work — a control that fails
 * when pressed reads as a broken product rather than a disabled option. This
 * pins the one fact both clients branch on, in both directions, because a flag
 * that reports the same value whatever the configuration says is worse than no
 * flag at all.
 */
import { createTestApp, type TestContext } from './utils/test-app';

describe('Platform config (e2e)', () => {
  describe('with the assistant switched on', () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestApp({ env: { ASSISTANT_ENABLED: 'true' } });
    });

    afterAll(async () => {
      await ctx.close();
    });

    it('says so, to a client with no session at all', async () => {
      const res = await ctx.api.get('/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ assistantEnabled: true });
    });
  });

  describe('with the assistant switched off', () => {
    let ctx: TestContext;

    beforeAll(async () => {
      ctx = await createTestApp({ env: { ASSISTANT_ENABLED: 'false' } });
    });

    afterAll(async () => {
      await ctx.close();
    });

    it('reports the flag as off rather than simply omitting it', async () => {
      const res = await ctx.api.get('/config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ assistantEnabled: false });
    });

    it('still refuses the assistant itself to anyone unauthenticated', async () => {
      // Public config is not a public assistant. The flag says what to draw;
      // it changes nothing about who may call anything.
      const res = await ctx.api.post('/assistant/chat', undefined, { message: 'สวัสดี' });

      expect(res.status).toBe(401);
    });
  });
});
