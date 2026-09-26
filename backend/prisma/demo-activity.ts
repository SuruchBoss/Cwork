// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * Gives the demo company a history.
 *
 * `seed.ts` creates the org chart, the policies and the people. That leaves a
 * console where almost every page says "ยังไม่มี…" — no payroll run, no leave,
 * no approvals waiting — which is a poor first five minutes for somebody
 * evaluating the project, and does not match the screenshots in the README.
 *
 * So this drives the **real services** rather than inserting rows: the payslips
 * are computed by the actual Thai tax code, the approvals are routed by the
 * actual policy engine, and the leave balances move because leave was actually
 * taken. Demo data that lies about what the product does is worse than none.
 *
 * Demo only, like the seed it follows: it refuses to touch an organisation it
 * did not create. Run through `npm run db:seed`, which chains the two.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApplicationStage,
  ApprovalTaskStatus,
  ExpenseCategory,
  KpiDirection,
  LeaveRequestStatus,
  PayrollRunStatus,
  PostingStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/core/security/current-user';
import { ApprovalService } from '../src/modules/approvals/approval.service';
import { UserContextService } from '../src/modules/auth/user-context.service';
import { LeaveService } from '../src/modules/leave/leave.service';
import { ExpensesService } from '../src/modules/payroll/expenses.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { PerformanceService } from '../src/modules/performance/performance.service';
import { ApplicationsService } from '../src/modules/recruitment/applications.service';
import { RecruitmentService } from '../src/modules/recruitment/recruitment.service';

const ORG_CODE = 'CWORK';

/** The demo cast, by the email the seed gives them. */
const WHO = {
  hrManager: 'hr.manager@cwork.example',
  payrollOfficer: 'payroll@cwork.example',
  engManager: 'eng.manager@cwork.example',
  dev1: 'dev1@cwork.example',
  dev2: 'dev2@cwork.example',
  sales1: 'sales1@cwork.example',
} as const;

async function main(): Promise<void> {
  // Background pollers would compete with this script for the same rows, and
  // there is nothing here that needs delivering.
  process.env.OUTBOX_POLL_MS = process.env.OUTBOX_POLL_MS ?? '0';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const log = new Logger('db:demo');

  try {
    const prisma = app.get(PrismaService);
    const userContext = app.get(UserContextService);

    const organization = await prisma.organization.findFirst({ select: { id: true, code: true } });
    if (!organization) {
      throw new Error('No organisation. Run `npm run db:seed` first.');
    }
    if (organization.code !== ORG_CODE) {
      throw new Error(
        `Refusing to add demo activity to "${organization.code}", which the demo seed did not create.`,
      );
    }

    /** A real principal, resolved the same way a request would resolve one. */
    const actor = async (email: string): Promise<AuthenticatedUser> => {
      const user = await prisma.user.findFirstOrThrow({
        where: { organizationId: organization.id, email },
        select: { id: true },
      });
      return { ...(await userContext.resolve(user.id)), sessionId: 'db:demo' };
    };

    const people = {
      hrManager: await actor(WHO.hrManager),
      payrollOfficer: await actor(WHO.payrollOfficer),
      engManager: await actor(WHO.engManager),
      dev1: await actor(WHO.dev1),
      dev2: await actor(WHO.dev2),
      sales1: await actor(WHO.sales1),
    };

    await seedLeave(app, prisma, organization.id, people, log);
    await seedExpenses(app, prisma, organization.id, people, log);
    await seedPayroll(app, prisma, organization.id, people, log);
    await seedRecruitment(app, prisma, organization, people.hrManager, log);
    await seedPerformance(app, prisma, organization.id, people, log);

    log.log('Demo activity complete.');
  } finally {
    await app.close();
  }
}

/**
 * Three leave requests: two decided, one left waiting.
 *
 * The pending one is the point — it is what puts a number on the approvals
 * badge and gives the dashboard something to show.
 */
async function seedLeave(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  organizationId: string,
  people: Record<string, AuthenticatedUser>,
  log: Logger,
): Promise<void> {
  const existing = await prisma.leaveRequest.count({ where: { organizationId } });
  if (existing > 0) {
    log.log(`leave: ${existing} request(s) already present, skipping`);
    return;
  }

  const leave = app.get(LeaveService);
  const approvals = app.get(ApprovalService);

  const types = await prisma.leaveType.findMany({
    where: { organizationId },
    select: { id: true, code: true },
  });
  const typeId = (code: string): string => {
    const found = types.find((t) => t.code === code);
    if (!found) throw new Error(`Leave type ${code} is missing — was the seed changed?`);
    return found.id;
  };

  const plan = [
    {
      who: people.dev2,
      type: 'ANNUAL',
      from: 12,
      to: 14,
      reason: 'พาครอบครัวไปเที่ยว',
      decide: 'APPROVE' as const,
    },
    // Not backdated: the leave rules require notice of at least zero days, so a
    // request for last Tuesday is refused — correctly, and worth not papering over.
    {
      who: people.dev1,
      type: 'SICK',
      from: 0,
      to: 0,
      reason: 'เป็นไข้',
      decide: 'APPROVE' as const,
    },
    {
      who: people.sales1,
      type: 'PERSONAL',
      from: 20,
      to: 20,
      reason: 'ติดต่อราชการ',
      decide: null,
    },
  ];

  for (const entry of plan) {
    let request;
    try {
      request = await leave.create(entry.who, {
        leaveTypeId: typeId(entry.type),
        startDate: dayFromToday(entry.from),
        endDate: dayFromToday(entry.to),
        reason: entry.reason,
      });
    } catch (error) {
      // One refused request is not a reason to leave the console without a
      // payroll run. Say which rule refused it and carry on.
      log.warn(`leave: ${entry.type} for ${entry.who.email} refused — ${(error as Error).message}`);
      continue;
    }

    if (!entry.decide) continue;

    // Decide it the way a manager would: through their own inbox.
    const tasks = await approvals.listMyTasks(people.engManager.userId, ApprovalTaskStatus.PENDING);
    const task = tasks.find(
      (t) => (t as { instance?: { entityId?: string } }).instance?.entityId === request.id,
    );
    if (task) {
      await approvals.decide(task.id, people.engManager.userId, entry.decide, 'อนุมัติ');
    }
  }

  const decided = await prisma.leaveRequest.count({
    where: { organizationId, status: LeaveRequestStatus.APPROVED },
  });
  const pending = await prisma.leaveRequest.count({
    where: { organizationId, status: LeaveRequestStatus.PENDING },
  });
  log.log(`leave: ${plan.length} request(s) — ${decided} approved, ${pending} waiting`);
}

/** Two expense claims, one of them still to be decided. */
async function seedExpenses(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  organizationId: string,
  people: Record<string, AuthenticatedUser>,
  log: Logger,
): Promise<void> {
  const already = await prisma.expenseClaim.count({ where: { organizationId } });
  if (already > 0) {
    log.log(`expenses: ${already} claim(s) already present, skipping`);
    return;
  }

  const expenses = app.get(ExpensesService);

  const claims = [
    {
      who: people.dev1,
      title: 'ค่าเดินทางไปพบลูกค้า',
      category: ExpenseCategory.TRAVEL,
      items: [
        {
          description: 'ค่าแท็กซี่ไป-กลับ',
          amount: 640,
          expenseDate: dayFromToday(-9),
          category: ExpenseCategory.TRAVEL,
        },
      ],
    },
    {
      who: people.sales1,
      title: 'ค่าอบรมการขาย',
      category: ExpenseCategory.TRAINING,
      items: [
        {
          description: 'ค่าลงทะเบียนสัมมนา',
          amount: 4500,
          expenseDate: dayFromToday(-4),
          category: ExpenseCategory.TRAINING,
        },
      ],
    },
  ];

  let created = 0;
  for (const claim of claims) {
    try {
      await expenses.create(claim.who, {
        title: claim.title,
        category: claim.category,
        items: claim.items,
      });
      created += 1;
    } catch (error) {
      log.warn(`expenses: skipped "${claim.title}" — ${(error as Error).message}`);
    }
  }
  log.log(`expenses: ${created} claim(s)`);
}

/**
 * Last month's payroll, run for real.
 *
 * Create → calculate → approve → mark paid, so the console shows a closed run
 * with payslips every employee can open, and the numbers come from the actual
 * Thai tax and social-security code rather than from this file.
 */
async function seedPayroll(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  organizationId: string,
  people: Record<string, AuthenticatedUser>,
  log: Logger,
): Promise<void> {
  const existing = await prisma.payrollRun.count({ where: { organizationId } });
  if (existing > 0) {
    log.log(`payroll: ${existing} run(s) already present, skipping`);
    return;
  }

  const payroll = app.get(PayrollService);

  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const year = month.getUTCFullYear();
  const monthNo = month.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const iso = (day: number): string =>
    `${year}-${String(monthNo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const period = await payroll.createPeriod(organizationId, {
    year,
    month: monthNo,
    periodStart: iso(1),
    periodEnd: iso(lastDay),
    payDate: iso(lastDay),
  });

  // Two people on purpose. Payroll refuses to let whoever prepared a run also
  // approve it, so the demo has to respect the same separation of duties a real
  // finance team would — the officer prepares, the HR manager signs it off.
  const officer = people.payrollOfficer;
  const approver = people.hrManager;

  const run = await payroll.createRun(officer, { periodId: period.id });
  await payroll.calculateRun(officer, run.id);
  await payroll.approveRun(approver, run.id);
  await payroll.markPaid(approver, run.id);

  const payslips = await prisma.payslip.count({ where: { runId: run.id } });
  const final = await prisma.payrollRun.findUniqueOrThrow({
    where: { id: run.id },
    select: { runNo: true, status: true, totalNet: true, employeeCount: true },
  });
  log.log(
    `payroll: ${final.runNo} ${final.status === PayrollRunStatus.PAID ? 'paid' : final.status} — ` +
      `${payslips} payslip(s) for ${final.employeeCount} employee(s), ` +
      `net ${final.totalNet.toString()} THB`,
  );
}

/**
 * A hiring pipeline with people at different stages.
 *
 * The applications come in through the **public careers endpoint**, with PDPA
 * consent, exactly as a stranger's would — so the demo shows the same path a
 * real applicant takes rather than rows conjured into the table.
 */
async function seedRecruitment(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  organization: { id: string; code: string },
  hr: AuthenticatedUser,
  log: Logger,
): Promise<void> {
  // `Application` is scoped through its posting rather than carrying an
  // organisation of its own, so the posting is what to check for.
  const existing = await prisma.jobPosting.count({ where: { organizationId: organization.id } });
  if (existing > 0) {
    log.log(`recruitment: ${existing} posting(s) already present, skipping`);
    return;
  }

  const recruitment = app.get(RecruitmentService);
  const applications = app.get(ApplicationsService);

  const slug = 'senior-backend-engineer';
  const posting = await recruitment.createPosting(organization.id, {
    slug,
    title: 'วิศวกรซอฟต์แวร์อาวุโส (Backend)',
    summary: 'ดูแลระบบหลังบ้านของบริษัท ทำงานกับ TypeScript และ PostgreSQL',
    description:
      'รับผิดชอบการออกแบบและพัฒนา API หลักของบริษัท ร่วมออกแบบฐานข้อมูล ' +
      'และดูแลคุณภาพโค้ดร่วมกับทีม',
    requirements: 'ประสบการณ์ Node.js อย่างน้อย 5 ปี · เข้าใจฐานข้อมูลเชิงสัมพันธ์เป็นอย่างดี',
    locationText: 'กรุงเทพฯ (ไฮบริด)',
  });
  await recruitment.updatePostingStatus(organization.id, posting.id, PostingStatus.PUBLISHED);

  const candidates = [
    {
      firstName: 'ณัฐวุฒิ',
      lastName: 'ศรีสุข',
      stage: ApplicationStage.INTERVIEW,
      title: 'Backend Engineer',
    },
    {
      firstName: 'พิมพ์ชนก',
      lastName: 'วัฒนากุล',
      stage: ApplicationStage.ASSESSMENT,
      title: 'Software Engineer',
    },
    {
      firstName: 'ธีรภัทร',
      lastName: 'อินทรกุล',
      stage: ApplicationStage.SCREENING,
      title: 'Full-stack Developer',
    },
    {
      firstName: 'กัญญาภัค',
      lastName: 'มณีรัตน์',
      stage: ApplicationStage.APPLIED,
      title: 'Node.js Developer',
    },
  ];

  for (const [index, candidate] of candidates.entries()) {
    const result = await applications.apply(organization.code, slug, {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: `${['nattawut', 'pimchanok', 'teerapat', 'kanyapak'][index]}@example.com`,
      phone: `08${index}1234567`,
      currentTitle: candidate.title,
      expectedSalary: 90_000 + index * 5_000,
      consent: true,
    });

    if (candidate.stage === ApplicationStage.APPLIED) continue;

    // Walk each one forward through the real stage transitions rather than
    // writing the final stage straight into the row.
    const order = [
      ApplicationStage.SCREENING,
      ApplicationStage.ASSESSMENT,
      ApplicationStage.INTERVIEW,
    ];
    for (const stage of order) {
      await applications.moveStage(hr, result.applicationId, { stage });
      if (stage === candidate.stage) break;
    }
  }

  log.log(`recruitment: 1 published posting, ${candidates.length} applicant(s)`);
}

/** An open review cycle with KPI goals, so the performance page has a shape. */
async function seedPerformance(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  prisma: PrismaService,
  organizationId: string,
  people: Record<string, AuthenticatedUser>,
  log: Logger,
): Promise<void> {
  const existing = await prisma.reviewCycle.count({ where: { organizationId } });
  if (existing > 0) {
    log.log(`performance: ${existing} cycle(s) already present, skipping`);
    return;
  }

  const performance = app.get(PerformanceService);
  const year = new Date().getUTCFullYear();

  const cycle = await performance.createCycle(organizationId, {
    code: `${year}-H2`,
    name: `รอบประเมินครึ่งปีหลัง ${year}`,
    periodStart: `${year}-07-01`,
    periodEnd: `${year}-12-31`,
  });

  const goals = [
    {
      owner: people.dev1,
      title: 'ลดเวลาตอบสนองเฉลี่ยของ API',
      weight: 40,
      unit: 'ms',
      baseline: 320,
      target: 180,
      direction: KpiDirection.LOWER_IS_BETTER,
    },
    {
      owner: people.dev1,
      title: 'ครอบคลุมเทสต์ของโมดูลหลัก',
      weight: 60,
      unit: '%',
      baseline: 62,
      target: 85,
      direction: KpiDirection.HIGHER_IS_BETTER,
    },
    {
      owner: people.dev2,
      title: 'ปิดงานค้างในคิวสนับสนุน',
      weight: 100,
      unit: 'งาน',
      baseline: 0,
      target: 40,
      direction: KpiDirection.HIGHER_IS_BETTER,
    },
  ];

  let created = 0;
  for (const goal of goals) {
    if (!goal.owner.employeeId) continue;
    try {
      await performance.createGoal(people.engManager, {
        cycleId: cycle.id,
        employeeId: goal.owner.employeeId,
        title: goal.title,
        weight: goal.weight,
        unit: goal.unit,
        baselineValue: goal.baseline,
        targetValue: goal.target,
        direction: goal.direction,
      });
      created += 1;
    } catch (error) {
      log.warn(`performance: skipped "${goal.title}" — ${(error as Error).message}`);
    }
  }

  log.log(`performance: 1 cycle, ${created} KPI goal(s)`);
}

/** A date `offset` days from today, as YYYY-MM-DD. */
function dayFromToday(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `\n${error.message}` : String(error));
  process.exitCode = 1;
});
