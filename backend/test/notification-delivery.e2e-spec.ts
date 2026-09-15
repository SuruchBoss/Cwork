/**
 * Email and push delivery (CW-005).
 *
 * The transport was the only thing CW-006 left out: the queue, the retry
 * schedule, the backoff and the dead-letter state were already there, and an
 * event with no handler was marked delivered and dropped. This registers the
 * handlers.
 *
 * Both ends are stood in for by servers speaking the real protocols — SMTP over
 * a socket, FCM over HTTP with a genuinely signed service-account assertion —
 * for the reason the clamd fake exists: what is worth testing is our half of
 * the conversation, not that Google's servers work.
 *
 * Polling is off (`OUTBOX_POLL_MS=0`), so every drain here is explicit.
 */
import { OutboxDispatcher } from 'src/core/outbox/outbox.dispatcher';
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createUnsubscribeToken } from 'src/modules/notifications/domain/unsubscribe-token';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { decodePart, header, startFakeSmtp, type FakeSmtp } from './utils/fake-smtp';
import { startFakeFcm, type FakeFcm } from './utils/fake-fcm';
import { createTestApp, type TestContext } from './utils/test-app';

const EMPLOYEE = 'dev2@cwork.example';
const JWT_SECRET = 'test-access-secret-that-is-at-least-32-chars';

describe('Notification delivery (e2e)', () => {
  let smtp: FakeSmtp;
  let fcm: FakeFcm;
  let ctx: TestContext;
  let prisma: PrismaService;
  let userId: string;
  let organizationId: string;

  const notify = (type: string, title = 'คำขอลาได้รับการอนุมัติ', body = 'ลาป่วย 2 วัน') =>
    ctx.app.get(NotificationsService).notify(organizationId, userId, { type, title, body });

  /** The first day from `daysAhead` onwards that the leave calendar will charge. */
  async function firstWorkingDay(
    token: string,
    leaveTypeId: string,
    daysAhead: number,
  ): Promise<string> {
    for (let offset = 0; offset < 14; offset += 1) {
      const date = new Date(Date.now() + (daysAhead + offset) * 86_400_000)
        .toISOString()
        .slice(0, 10);

      const preview = await ctx.api.post('/leave/requests/preview', token, {
        leaveTypeId,
        startDate: date,
        endDate: date,
      });

      if (preview.status < 400 && Number(preview.body.totalDays) > 0) return date;
    }
    throw new Error('No working day found in the fortnight after the offset');
  }

  const drain = () => ctx.app.get(OutboxDispatcher).drainOnce();

  beforeAll(async () => {
    smtp = await startFakeSmtp();
    fcm = await startFakeFcm();

    ctx = await createTestApp({
      env: {
        JWT_ACCESS_SECRET: JWT_SECRET,
        EMAIL_ENABLED: 'true',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtp.port),
        SMTP_SECURITY: 'none',
        SMTP_USERNAME: 'robot',
        SMTP_PASSWORD: 'hunter2',
        SMTP_FROM_ADDRESS: 'no-reply@cwork.example',
        SMTP_FROM_NAME: 'Cwork',
        SMTP_TIMEOUT_MS: '3000',
        PUBLIC_WEB_URL: 'https://hr.example.com',
        PUSH_ENABLED: 'true',
        FCM_PROJECT_ID: fcm.projectId,
        FCM_CLIENT_EMAIL: fcm.clientEmail,
        FCM_PRIVATE_KEY: fcm.privateKey.replace(/\n/g, '\\n'),
        FCM_TOKEN_URI: fcm.tokenUri,
        FCM_ENDPOINT: fcm.url,
        FCM_TIMEOUT_MS: '3000',
      },
    });

    prisma = ctx.app.get(PrismaService);
    const user = await prisma.user.findFirstOrThrow({
      where: { email: EMPLOYEE },
      select: { id: true, organizationId: true },
    });
    userId = user.id;
    organizationId = user.organizationId;
  });

  afterAll(async () => {
    await ctx?.close();
    await smtp?.close();
    await fcm?.close();
  });

  beforeEach(async () => {
    smtp.behaviour = { kind: 'accept' };
    fcm.behaviour = { kind: 'accept' };
    smtp.messages.length = 0;
    fcm.sent.length = 0;
    await prisma.outboxEvent.deleteMany();
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.deviceToken.deleteMany({ where: { userId } });
  });

  describe('email', () => {
    it('sends a message a mail client can actually render', async () => {
      await notify('leave.approved');
      const drained = await drain();

      expect(drained).toMatchObject({ claimed: 1, delivered: 1 });
      expect(smtp.messages).toHaveLength(1);

      const [message] = smtp.messages;
      expect(message.from).toBe('no-reply@cwork.example');
      expect(message.to).toBe(EMPLOYEE);

      // The subject is Thai, so an un-encoded header would arrive as mojibake
      // in any client that follows the RFC.
      expect(header(message.data, 'Subject')).toBe('[การลา] คำขอลาได้รับการอนุมัติ');
      expect(header(message.data, 'From')).toBe('Cwork <no-reply@cwork.example>');
      expect(header(message.data, 'List-Unsubscribe')).toMatch(/^<https:\/\/hr\.example\.com\//);

      expect(decodePart(message.data, 'text/plain')).toContain('ลาป่วย 2 วัน');
      expect(decodePart(message.data, 'text/html')).toContain('https://hr.example.com/leave');
    });

    it('retries a mailbox that is temporarily full', async () => {
      smtp.behaviour = { kind: 'refuse-recipient', code: 452, text: 'Mailbox full' };

      await notify('leave.approved');
      const drained = await drain();

      expect(drained).toMatchObject({ retried: 1, deadLettered: 0 });
      const [event] = await prisma.outboxEvent.findMany();
      expect(event.lastError).toContain('452');
      expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('gives up at once on an address that does not exist', async () => {
      // The distinction the whole client exists to make: eight attempts over an
      // hour at a mailbox that was refused for being unknown teaches nothing,
      // and buries the one message somebody should have looked at.
      smtp.behaviour = { kind: 'refuse-recipient', code: 550, text: 'No such user here' };

      await notify('leave.approved');
      const drained = await drain();

      expect(drained).toMatchObject({ deadLettered: 1, retried: 0 });
      const [event] = await prisma.outboxEvent.findMany();
      expect(event.attempts).toBe(1);
      expect(event.failedAt).not.toBeNull();
      expect(event.lastError).toContain('550');
    });

    it('refuses to send in the clear when STARTTLS was asked for', async () => {
      // Sending anyway would put the relay password on the wire, which is
      // precisely what the setting said not to do.
      smtp.behaviour = { kind: 'no-starttls' };

      const strict = await createTestApp({
        env: {
          EMAIL_ENABLED: 'true',
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: String(smtp.port),
          SMTP_SECURITY: 'starttls',
          SMTP_FROM_ADDRESS: 'no-reply@cwork.example',
          SMTP_TIMEOUT_MS: '3000',
          PUSH_ENABLED: 'false',
        },
      });

      try {
        await strict.app
          .get(NotificationsService)
          .notify(organizationId, userId, { type: 'leave.approved', title: 'x', body: 'y' });
        const drained = await strict.app.get(OutboxDispatcher).drainOnce();

        expect(drained).toMatchObject({ retried: 1 });
        const [event] = await prisma.outboxEvent.findMany();
        expect(event.lastError).toContain('STARTTLS');
        expect(smtp.messages).toHaveLength(0);
      } finally {
        await strict.close();
      }
    });
  });

  describe('push', () => {
    beforeEach(async () => {
      await ctx.app.get(NotificationsService).registerDevice(userId, 'device-token-1', 'android');
    });

    it('sends to every registered device', async () => {
      await ctx.app.get(NotificationsService).registerDevice(userId, 'device-token-2', 'ios');

      await notify('payslip.published', 'สลิปเงินเดือนพร้อมแล้ว', 'งวด 2569-09');
      await drain();

      expect(fcm.sent.map((p) => p.token).sort()).toEqual(['device-token-1', 'device-token-2']);
      expect(fcm.sent[0]).toMatchObject({
        title: 'สลิปเงินเดือนพร้อมแล้ว',
        body: 'งวด 2569-09',
        data: { type: 'payslip.published' },
      });
    });

    it('signs an assertion Google would accept', async () => {
      // Verified against the key pair the fake generated, so a client that
      // signs the wrong bytes fails here rather than at three in the morning.
      await notify('leave.approved');
      await drain();

      expect(fcm.tokenRequests).toBeGreaterThan(0);
      expect(fcm.assertionsValid).toBe(true);
    });

    it('forgets a device the app was uninstalled from', async () => {
      // A device table nobody prunes grows for ever and slows every send.
      fcm.behaviour = { kind: 'unregistered' };

      await notify('leave.approved');
      const drained = await drain();

      expect(drained).toMatchObject({ delivered: 1 });
      expect(await prisma.deviceToken.count({ where: { userId } })).toBe(0);
    });

    it('retries when FCM is having a bad afternoon', async () => {
      fcm.behaviour = { kind: 'unavailable' };

      await notify('leave.approved');

      expect(await drain()).toMatchObject({ retried: 1, deadLettered: 0 });
    });

    it('gives up at once when the credentials are refused', async () => {
      fcm.behaviour = { kind: 'forbidden' };

      await notify('leave.approved');

      expect(await drain()).toMatchObject({ deadLettered: 1 });
    });
  });

  describe('the acceptance criterion, end to end', () => {
    it('emails the approver when somebody submits leave', async () => {
      // The ticket's own words: "submitting leave notifies the approver by
      // email and push within a minute". Everything above tests a piece; this
      // is the path a person actually walks — request, approval task,
      // notification, outbox, relay — with nothing stubbed but the two servers
      // at the far end.
      const employeeToken = await ctx.api.token(EMPLOYEE);

      const balances = await ctx.api.get('/leave/balances/me', employeeToken);
      const annual = balances.body.find((b: { code: string }) => b.code === 'ANNUAL');
      expect(annual).toBeDefined();

      // Far enough out that no other case in the suite has claimed the dates,
      // and checked against the calendar rather than assumed: a request landing
      // on a weekend or a public holiday is refused for having no working days,
      // which would read as a delivery failure three assertions later.
      const start = await firstWorkingDay(employeeToken, annual.leaveTypeId, 200);

      const created = await ctx.api.post('/leave/requests', employeeToken, {
        leaveTypeId: annual.leaveTypeId,
        startDate: start,
        endDate: start,
        reason: 'ธุระส่วนตัว',
      });
      if (created.status >= 400) throw new Error(JSON.stringify(created.body));

      await drain();

      // Sent to whoever the policy resolved as approver — not to the person who
      // asked, who already knows.
      expect(smtp.messages.length).toBeGreaterThan(0);
      expect(smtp.messages.map((m) => m.to)).not.toContain(EMPLOYEE);

      const subjects = smtp.messages.map((m) => header(m.data, 'Subject'));
      expect(subjects.some((subject) => subject.startsWith('[รออนุมัติ]'))).toBe(true);

      const body = decodePart(smtp.messages[0].data, 'text/html');
      expect(body).toContain('https://hr.example.com/approvals');
    });
  });

  describe('preferences', () => {
    it('stops the email and leaves the in-app notification alone', async () => {
      const token = await ctx.api.token(EMPLOYEE);

      const saved = await ctx.api.put('/notifications/preferences', token, {
        type: '*',
        email: false,
      });
      expect(saved.status).toBe(200);

      await notify('leave.approved');
      await drain();

      expect(smtp.messages).toHaveLength(0);

      // The row is the record, not the message. Silencing email must not make
      // it disappear from the console.
      const list = await ctx.api.get('/notifications', token);
      expect(
        (list.body.data ?? list.body).some((n: { type: string }) => n.type === 'leave.approved'),
      ).toBe(true);
    });

    it('lets one type override the blanket rule', async () => {
      const token = await ctx.api.token(EMPLOYEE);
      await ctx.api.put('/notifications/preferences', token, { type: '*', email: false });
      await ctx.api.put('/notifications/preferences', token, {
        type: 'payslip.published',
        email: true,
      });

      await notify('leave.approved');
      await notify('payslip.published', 'สลิปเงินเดือนพร้อมแล้ว', 'งวด 2569-09');
      await drain();

      expect(smtp.messages).toHaveLength(1);
      expect(header(smtp.messages[0].data, 'Subject')).toContain('สลิปเงินเดือน');
    });

    it('turns email off from the link in the footer, without a sign-in', async () => {
      // Somebody who has stopped reading these should not have to sign in to
      // stop receiving them — that is the difference between an unsubscribe
      // link and a complaint to the spam filter.
      const link = createUnsubscribeToken(userId, JWT_SECRET);
      const response = await ctx.api.get(`/notifications/unsubscribe/${link}`);

      expect(response.status).toBe(200);

      await notify('leave.approved');
      await drain();
      expect(smtp.messages).toHaveLength(0);

      // Push is deliberately untouched: the click was about email.
      const [preference] = await prisma.notificationPreference.findMany({ where: { userId } });
      expect(preference).toMatchObject({ type: '*', email: false, push: true });
    });

    it('refuses a token it did not sign', async () => {
      const forged = createUnsubscribeToken(userId, 'a-different-secret-of-at-least-32-chars');

      expect((await ctx.api.get(`/notifications/unsubscribe/${forged}`)).status).toBe(404);
      expect((await ctx.api.get('/notifications/unsubscribe/rubbish')).status).toBe(404);
    });
  });
});
