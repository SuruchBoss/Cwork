/**
 * Hiring, from the public job advert to an employee record.
 *
 * Written because the module had none. `recruitment.service.ts` was 970 lines
 * across five subjects and its only test was `assessment-grader.spec.ts` — a
 * pure function covering the arithmetic of marking an answer, and nothing that
 * ever called a route. Splitting a service with that behind it is a refactor
 * you cannot check, so this covers the path first.
 *
 * It is deliberately one long journey rather than a case per endpoint: hiring
 * *is* a sequence, each step needs the id the last one produced, and the bugs
 * worth catching live in the handovers — an offer for an application nobody
 * interviewed, a candidate converted twice.
 *
 * The five services it crosses, in order: RecruitmentService (the posting),
 * ApplicationsService (applying, the pipeline), AssessmentsService (invite and
 * sit), InterviewsService (schedule and score), OffersService (offer, accept,
 * convert).
 */
import { PrismaService } from 'src/core/prisma/prisma.service';
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example';
const ORG_CODE = 'CWORK';

/** Unique per run: the suite shares a database with every other spec. */
const stamp = Date.now().toString(36);
const SLUG = `senior-developer-${stamp}`;
const CANDIDATE_EMAIL = `candidate.${stamp}@example.com`;

describe('Recruitment (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;

  let postingId: string;
  let applicationId: string;
  let templateId: string;
  let offerId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    hrToken = await api.token(HR);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('the advert', () => {
    it('is not public until it is published', async () => {
      const created = await api.post('/recruitment/postings', hrToken, {
        slug: SLUG,
        title: 'Senior Developer',
        description: 'รับสมัครนักพัฒนาอาวุโส',
        locationText: 'กรุงเทพฯ',
      });

      expect(created.status).toBe(201);
      postingId = created.body.id;
      expect(created.body.status).toBe('DRAFT');

      // A draft is a document, not an advert. Serving it would publish a job
      // nobody has approved the wording of.
      const publicList = await api.get(`/careers/${ORG_CODE}/jobs`);
      expect(publicList.body.map((p: { slug: string }) => p.slug)).not.toContain(SLUG);
    });

    it('appears on the public careers page once published', async () => {
      const published = await api.patch(`/recruitment/postings/${postingId}/status`, hrToken, {
        status: 'PUBLISHED',
      });
      expect(published.status).toBe(200);

      const publicList = await api.get(`/careers/${ORG_CODE}/jobs`);
      expect(publicList.status).toBe(200);
      expect(publicList.body.map((p: { slug: string }) => p.slug)).toContain(SLUG);

      const detail = await api.get(`/careers/${ORG_CODE}/jobs/${SLUG}`);
      expect(detail.status).toBe(200);
      expect(detail.body.title).toBe('Senior Developer');
    });
  });

  describe('applying', () => {
    it('refuses an application without PDPA consent', async () => {
      // The one thing the public endpoint must never accept. Thai law does not
      // treat a CV as freely given just because somebody sent it.
      const res = await api.post(`/careers/${ORG_CODE}/jobs/${SLUG}/apply`, undefined, {
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        email: `no-consent.${stamp}@example.com`,
        consent: false,
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('accepts one with consent, from a stranger with no account', async () => {
      const res = await api.post(`/careers/${ORG_CODE}/jobs/${SLUG}/apply`, undefined, {
        firstName: 'สมชาย',
        lastName: 'ใจดี',
        email: CANDIDATE_EMAIL,
        phone: '0812345678',
        expectedSalary: 90000,
        consent: true,
      });

      expect(res.status).toBe(201);

      // What a stranger is told back, and the whole of it: their own
      // application id, the job they applied for, and when it arrived. No
      // candidate record, no pipeline stage, no internal ids belonging to
      // anybody else.
      expect(Object.keys(res.body).sort()).toEqual(['applicationId', 'position', 'submittedAt']);
      expect(res.body.position).toBe('Senior Developer');
    });

    it("shows up in the recruiter's pipeline", async () => {
      const list = await api.get('/recruitment/applications', hrToken);

      expect(list.status).toBe(200);
      const rows = list.body.data ?? list.body;
      const mine = rows.find(
        (a: { candidate?: { email?: string } }) => a.candidate?.email === CANDIDATE_EMAIL,
      );
      expect(mine).toBeDefined();
      applicationId = mine.id;
      expect(mine.stage).toBe('APPLIED');
    });

    it('moves through the pipeline one stage at a time', async () => {
      for (const stage of ['SCREENING', 'ASSESSMENT']) {
        const moved = await api.post(`/recruitment/applications/${applicationId}/stage`, hrToken, {
          stage,
        });
        expect(moved.status).toBe(201);
      }

      const detail = await api.get(`/recruitment/applications/${applicationId}`, hrToken);
      expect(detail.body.stage).toBe('ASSESSMENT');
    });
  });

  describe('the assessment', () => {
    it('refuses a markable question with no answer key', async () => {
      // A multiple-choice question nobody can mark is a question that silently
      // scores zero for every candidate who answers it correctly.
      const res = await api.post('/recruitment/assessment-templates', hrToken, {
        code: `BROKEN-${stamp}`,
        title: 'Unmarkable',
        questions: [
          {
            orderIndex: 0,
            type: 'SINGLE_CHOICE',
            prompt: '1 + 1 = ?',
            options: [{ key: 'a', label: '2' }],
          },
        ],
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('is created, sent, sat and marked', async () => {
      const template = await api.post('/recruitment/assessment-templates', hrToken, {
        code: `BASIC-${stamp}`,
        title: 'Basic screening',
        kind: 'MULTIPLE_CHOICE',
        passingScore: 50,
        questions: [
          {
            orderIndex: 0,
            type: 'SINGLE_CHOICE',
            prompt: '1 + 1 = ?',
            options: [
              { key: 'a', label: '2' },
              { key: 'b', label: '3' },
            ],
            correctKeys: ['a'],
            points: 1,
          },
        ],
      });
      expect(template.status).toBe(201);
      templateId = template.body.id;

      const invited = await api.post('/recruitment/assessments/invite', hrToken, {
        applicationId,
        templateId,
      });
      expect(invited.status).toBe(201);

      // Shown once and stored as a hash — so the response is the only place
      // this value will ever exist.
      const token = invited.body.token;
      expect(typeof token).toBe('string');

      const opened = await api.get(`/careers/assessments/${token}`);
      expect(opened.status).toBe(200);
      const questionId = opened.body.questions[0].id;

      const submitted = await api.post('/careers/assessments/submit', undefined, {
        token,
        answers: [{ questionId, selectedKeys: ['a'] }],
      });
      expect(submitted.status).toBe(201);

      // The candidate learns it was received, never how they scored — telling
      // them turns a screening test into an answer key they can retake.
      expect(submitted.body).toEqual({ submitted: true, awaitingManualReview: false });

      // The mark itself is on the invitation, for the recruiter.
      const invitation = await ctx.app.get(PrismaService).assessmentInvitation.findFirstOrThrow({
        where: { applicationId },
        select: { percentage: true, isPassed: true, status: true },
      });
      expect(Number(invitation.percentage)).toBe(100);
      expect(invitation.isPassed).toBe(true);
      expect(invitation.status).toBe('GRADED');
    });
  });

  describe('interview and offer', () => {
    it('schedules an interview and records a scorecard', async () => {
      const interviewer = await ctx.app
        .get(PrismaService)
        .employee.findFirstOrThrow({ where: { user: { email: HR } }, select: { id: true } });

      const scheduled = await api.post('/recruitment/interviews', hrToken, {
        applicationId,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        mode: 'VIDEO',
        interviewerEmployeeIds: [interviewer.id],
      });
      expect(scheduled.status).toBe(201);

      const mine = await api.get('/recruitment/interviews/mine', hrToken);
      expect(mine.body.map((i: { id: string }) => i.id)).toContain(scheduled.body.id);

      const scorecard = await api.post(
        `/recruitment/interviews/${scheduled.body.id}/scorecard`,
        hrToken,
        {
          criteria: [{ criterion: 'Technical depth', weight: 1, score: 4 }],
          recommendation: 'HIRE',
        },
      );
      expect(scorecard.status).toBe(201);
    });

    it('turns an accepted offer into an employee, once', async () => {
      const offer = await api.post('/recruitment/offers', hrToken, {
        applicationId,
        baseSalary: 95000,
        startDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      });
      expect(offer.status).toBe(201);
      offerId = offer.body.id;

      const accepted = await api.post(`/recruitment/offers/${offerId}/respond`, hrToken, {
        accepted: true,
      });
      expect(accepted.status).toBe(201);

      const converted = await api.post(`/recruitment/offers/${offerId}/convert`, hrToken, {});
      expect(converted.status).toBe(201);
      expect(converted.body.employeeCode).toBeTruthy();

      // Converting twice would pay one person two salaries.
      const again = await api.post(`/recruitment/offers/${offerId}/convert`, hrToken, {});
      expect(again.status).toBeGreaterThanOrEqual(400);
    });
  });
});
