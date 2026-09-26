// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A review cycle from goal-setting to a calibrated grade.
 *
 * Twelve routes with no route-level test before this. What made it worth
 * writing first is not the number: this module decides the grade that follows
 * somebody into a pay review, and three of its rules are the kind that are
 * quiet when they break — the weights that must total 100, who may write a
 * review about whom, and the null that means "nobody set any targets" rather
 * than "they missed every target".
 *
 * The scoring arithmetic itself is unit-tested in `domain/kpi-scoring.spec.ts`.
 * This is about the rules around it, and the permissions in front of it.
 */
import { createTestApp, type Api, type TestContext } from './utils/test-app';

const HR = 'hr.manager@cwork.example';
const MANAGER = 'eng.manager@cwork.example';
const REPORT = 'dev1@cwork.example';
const OTHER_EMPLOYEE = 'sales1@cwork.example';

const stamp = Date.now().toString(36).toUpperCase().slice(-5);

describe('Performance (e2e)', () => {
  let ctx: TestContext;
  let api: Api;
  let hrToken: string;
  let managerToken: string;
  let reportToken: string;
  let otherToken: string;

  let cycleId: string;
  let reportEmployeeId: string;
  let otherEmployeeId: string;
  let goalId: string;
  let reviewId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    api = ctx.api;
    [hrToken, managerToken, reportToken, otherToken] = await Promise.all([
      api.token(HR),
      api.token(MANAGER),
      api.token(REPORT),
      api.token(OTHER_EMPLOYEE),
    ]);

    const me = await api.get('/employees/me', reportToken);
    reportEmployeeId = me.body.id;
    const other = await api.get('/employees/me', otherToken);
    otherEmployeeId = other.body.id;

    const cycle = await api.post('/performance/cycles', hrToken, {
      code: `CYCLE-${stamp}`,
      name: `รอบทดสอบ ${stamp}`,
      type: 'ANNUAL',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      kpiWeight: 70,
      competencyWeight: 30,
      ratingScale: [
        { grade: 'A', min: 90 },
        { grade: 'B', min: 75 },
        { grade: 'C', min: 60 },
        { grade: 'D', min: 0 },
      ],
    });
    expect(cycle.status).toBe(201);
    cycleId = cycle.body.id;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('the cycle', () => {
    it('starts as a draft and is opened deliberately', async () => {
      expect(
        (await api.get('/performance/cycles', hrToken)).body.map((c: { id: string }) => c.id),
      ).toContain(cycleId);

      const opened = await api.patch(`/performance/cycles/${cycleId}/status`, hrToken, {
        status: 'GOAL_SETTING',
      });
      expect(opened.status).toBe(200);
      expect(opened.body.status).toBe('GOAL_SETTING');
    });

    it('cannot be created by somebody who does not run performance', async () => {
      const refused = await api.post('/performance/cycles', reportToken, {
        code: `SNEAK-${stamp}`,
        name: 'ของฉันเอง',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      });

      expect(refused.status).toBe(403);
    });
  });

  describe('goals', () => {
    it('refuses to let the weights total more than 100', async () => {
      // The weights are the denominator of the score. Letting them pass 100
      // does not fail — it quietly grades everyone against a scale nobody
      // agreed to.
      const first = await api.post('/performance/goals', managerToken, {
        cycleId,
        employeeId: reportEmployeeId,
        title: 'ลดเวลา build',
        weight: 60,
        targetValue: 10,
        direction: 'LOWER_IS_BETTER',
        baselineValue: 20,
      });
      expect(first.status).toBe(201);
      goalId = first.body.id;

      const overweight = await api.post('/performance/goals', managerToken, {
        cycleId,
        employeeId: reportEmployeeId,
        title: 'มากเกินไป',
        weight: 50,
        targetValue: 1,
      });

      expect(overweight.status).toBeGreaterThanOrEqual(400);
      expect(overweight.body.code).toBe('KPI_WEIGHT_EXCEEDED');
      expect(overweight.body.message).toContain('110');
    });

    it('is not something a manager may set for somebody else’s report', async () => {
      const refused = await api.post('/performance/goals', managerToken, {
        cycleId,
        employeeId: otherEmployeeId,
        title: 'ไม่ใช่ลูกทีมของฉัน',
        weight: 10,
        targetValue: 1,
      });

      expect(refused.status).toBeGreaterThanOrEqual(400);
    });

    it('scores a check-in against the goal’s direction, not its raw value', async () => {
      // LOWER_IS_BETTER with a baseline of 20 and a target of 10: reaching 10
      // is full marks. A calculator that ignored direction would read this as
      // half of the target and score it 100% wrong.
      const checkIn = await api.post(`/performance/goals/${goalId}/check-in`, reportToken, {
        value: 10,
        note: 'ทำได้ตามเป้า',
      });

      expect(checkIn.status).toBe(201);

      // Scoped to a named employee: asking without one returns your own goals,
      // which is what an employee opening the page wants and what a manager
      // has to be explicit to get past.
      const goals = await api.get(
        `/performance/cycles/${cycleId}/goals?employeeId=${reportEmployeeId}`,
        managerToken,
      );

      const mine = goals.body.goals.find((g: { id: string }) => g.id === goalId);
      expect(Number(mine.achievement)).toBe(100);

      // The summary is what the review will read: 100% achievement on a goal
      // weighted 60 is 60 of the 60 points available so far.
      expect(Number(goals.body.summary.weightedScore)).toBe(100);
      expect(goals.body.summary.scoredGoals).toBe(1);
    });
  });

  describe('reviews', () => {
    it('refuses a self review written about somebody else', async () => {
      const refused = await api.post('/performance/reviews', reportToken, {
        cycleId,
        employeeId: otherEmployeeId,
        type: 'SELF',
      });

      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.body.code).toBe('INVALID_SELF_REVIEW');
    });

    it('refuses a manager review from somebody who is not the manager', async () => {
      // The one rule that decides whether a grade means anything.
      const refused = await api.post('/performance/reviews', otherToken, {
        cycleId,
        employeeId: reportEmployeeId,
        type: 'MANAGER',
      });

      expect(refused.status).toBeGreaterThanOrEqual(400);
    });

    it('grades from the KPI score and the competency scores together', async () => {
      const submitted = await api.post('/performance/reviews', managerToken, {
        cycleId,
        employeeId: reportEmployeeId,
        type: 'MANAGER',
        competencyScores: [
          { competency: 'การทำงานเป็นทีม', weight: 50, score: 4 },
          { competency: 'การสื่อสาร', weight: 50, score: 4 },
        ],
        strengths: 'ทำงานตามเป้าหมายได้ครบ',
      });

      expect(submitted.status).toBe(201);
      reviewId = submitted.body.id;
      expect(submitted.body.status).toBe('SUBMITTED');
      expect(Number(submitted.body.kpiScore)).toBeGreaterThan(0);
      expect(submitted.body.grade).toBeTruthy();
    });

    it('is visible to the person it is about, and acknowledged by them', async () => {
      const mine = await api.get('/performance/reviews/mine', reportToken);
      expect(mine.body.map((r: { id: string }) => r.id)).toContain(reviewId);

      const acknowledged = await api.post(
        `/performance/reviews/${reviewId}/acknowledge`,
        reportToken,
        { comment: 'รับทราบแล้ว' },
      );
      expect(acknowledged.status).toBe(201);
      expect(acknowledged.body.status).toBe('ACKNOWLEDGED');
    });

    it('is not acknowledgeable by anybody else', async () => {
      // Acknowledgement is a signature. Somebody else pressing it is the
      // employee having agreed to a grade they never saw.
      const refused = await api.post(`/performance/reviews/${reviewId}/acknowledge`, otherToken, {
        comment: 'ไม่ใช่ของฉัน',
      });

      expect(refused.status).toBeGreaterThanOrEqual(400);
    });

    it('is calibrated only by somebody allowed to overrule a grade', async () => {
      const refused = await api.post(`/performance/reviews/${reviewId}/calibrate`, managerToken, {
        calibratedGrade: 'A',
      });
      expect(refused.status).toBe(403);

      const calibrated = await api.post(`/performance/reviews/${reviewId}/calibrate`, hrToken, {
        calibratedGrade: 'A',
        note: 'ปรับตามที่ประชุม calibration',
      });
      expect(calibrated.status).toBe(201);
      expect(calibrated.body.calibratedGrade).toBe('A');
      expect(calibrated.body.status).toBe('CALIBRATED');
    });
  });
});
