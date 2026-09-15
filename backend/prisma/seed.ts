/**
 * Development seed.
 *
 * Creates one organisation with realistic Thai HR configuration: roles, leave
 * types, shifts, pay components, approval policies, a small org chart, and HR
 * policy documents for the assistant to answer from.
 *
 * Safe to re-run: every write is an upsert keyed on a natural key.
 *
 * Run with: npm run db:seed
 */
import { hash as argonHash } from '@node-rs/argon2';
import {
  ApprovalEntityType,
  ApproverType,
  AttendanceStatus,
  BenefitCategory,
  EmployeeStatus,
  EmploymentType,
  Gender,
  KnowledgeStatus,
  LeaveAccrualMethod,
  PayComponentType,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { SYSTEM_ROLE_DEFINITIONS, SystemRole } from '../src/core/security/roles';

const prisma = new PrismaClient();

const ORG_CODE = 'MARMA';
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? 'MarMaHris2026!';

async function main(): Promise<void> {
  console.log('Seeding MarMa HRIS…');

  const organization = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    create: {
      code: ORG_CODE,
      name: 'บริษัท มาร์มา จำกัด',
      legalName: 'MarMa Company Limited',
      taxId: '0105560000000',
      timezone: 'Asia/Bangkok',
      currency: 'THB',
      defaultLocale: 'th',
      settings: {
        overtime: { NORMAL_DAY: 1.5, DAY_OFF: 1, HOLIDAY: 2, HOLIDAY_OVERTIME: 3 },
        probationMonths: 4,
      },
    },
    update: {},
  });
  console.log(`  organisation: ${organization.name}`);

  // ---- Roles --------------------------------------------------------------
  const roles = new Map<string, string>();
  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: organization.id, key: definition.key } },
      create: {
        organizationId: organization.id,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        permissions: definition.permissions,
        isSystem: true,
      },
      update: { permissions: definition.permissions, name: definition.name },
    });
    roles.set(definition.key, role.id);
  }
  console.log(`  roles: ${roles.size}`);

  // ---- Departments & positions -------------------------------------------
  const departments = await upsertMany(
    [
      { code: 'EXEC', name: 'ผู้บริหาร', nameEn: 'Executive' },
      { code: 'HR', name: 'ฝ่ายทรัพยากรบุคคล', nameEn: 'Human Resources' },
      { code: 'FIN', name: 'ฝ่ายบัญชีและการเงิน', nameEn: 'Finance' },
      { code: 'ENG', name: 'ฝ่ายวิศวกรรม', nameEn: 'Engineering' },
      { code: 'SALES', name: 'ฝ่ายขาย', nameEn: 'Sales' },
    ],
    (d) =>
      prisma.department.upsert({
        where: { organizationId_code: { organizationId: organization.id, code: d.code } },
        create: { ...d, organizationId: organization.id },
        update: { name: d.name, nameEn: d.nameEn },
      }),
  );

  const positions = await upsertMany(
    [
      { code: 'CEO', title: 'ประธานเจ้าหน้าที่บริหาร', titleEn: 'Chief Executive Officer', level: 9, dept: 'EXEC' },
      { code: 'HRM', title: 'ผู้จัดการฝ่ายบุคคล', titleEn: 'HR Manager', level: 6, dept: 'HR' },
      { code: 'HRO', title: 'เจ้าหน้าที่บุคคล', titleEn: 'HR Officer', level: 3, dept: 'HR' },
      { code: 'PAYO', title: 'เจ้าหน้าที่เงินเดือน', titleEn: 'Payroll Officer', level: 3, dept: 'FIN' },
      { code: 'EM', title: 'ผู้จัดการฝ่ายวิศวกรรม', titleEn: 'Engineering Manager', level: 6, dept: 'ENG' },
      { code: 'SWE', title: 'วิศวกรซอฟต์แวร์', titleEn: 'Software Engineer', level: 3, dept: 'ENG' },
      { code: 'SWE2', title: 'วิศวกรซอฟต์แวร์อาวุโส', titleEn: 'Senior Software Engineer', level: 4, dept: 'ENG' },
      { code: 'SALES', title: 'พนักงานขาย', titleEn: 'Sales Executive', level: 3, dept: 'SALES' },
    ],
    (p) =>
      prisma.position.upsert({
        where: { organizationId_code: { organizationId: organization.id, code: p.code } },
        create: {
          organizationId: organization.id,
          code: p.code,
          title: p.title,
          titleEn: p.titleEn,
          level: p.level,
          departmentId: departments.get(p.dept)!.id,
        },
        update: { title: p.title, level: p.level },
      }),
  );

  // ---- Work location ------------------------------------------------------
  const headOffice = await prisma.workLocation.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'HQ' } },
    create: {
      organizationId: organization.id,
      code: 'HQ',
      name: 'สำนักงานใหญ่ (สาทร)',
      addressLine: '123 ถนนสาทรใต้',
      district: 'สาทร',
      province: 'กรุงเทพมหานคร',
      postalCode: '10120',
      latitude: 13.7211,
      longitude: 100.5285,
      geofenceRadiusM: 250,
    },
    update: {},
  });

  // ---- Shifts & schedule --------------------------------------------------
  const dayShift = await prisma.shift.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'DAY' } },
    create: {
      organizationId: organization.id,
      code: 'DAY',
      name: 'กะปกติ 09:00-18:00',
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      graceInMinutes: 15,
      graceOutMinutes: 5,
      standardWorkMinutes: 480,
    },
    update: {},
  });

  await prisma.shift.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'FLEX' } },
    create: {
      organizationId: organization.id,
      code: 'FLEX',
      name: 'เวลายืดหยุ่น (core 10:00-16:00)',
      startTime: '08:00',
      endTime: '20:00',
      breakMinutes: 60,
      standardWorkMinutes: 480,
      isFlexible: true,
      coreStartTime: '10:00',
      coreEndTime: '16:00',
    },
    update: {},
  });

  const schedule = await prisma.workSchedule.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'MON_FRI' } },
    create: {
      organizationId: organization.id,
      code: 'MON_FRI',
      name: 'จันทร์-ศุกร์',
      workingDays: [1, 2, 3, 4, 5],
      defaultShiftId: dayShift.id,
    },
    update: { defaultShiftId: dayShift.id },
  });

  // ---- Public holidays ----------------------------------------------------
  const year = new Date().getUTCFullYear();
  const holidays = [
    { month: 1, day: 1, name: 'วันขึ้นปีใหม่', nameEn: "New Year's Day" },
    { month: 4, day: 6, name: 'วันจักรี', nameEn: 'Chakri Memorial Day' },
    { month: 4, day: 13, name: 'วันสงกรานต์', nameEn: 'Songkran Festival' },
    { month: 4, day: 14, name: 'วันสงกรานต์', nameEn: 'Songkran Festival' },
    { month: 4, day: 15, name: 'วันสงกรานต์', nameEn: 'Songkran Festival' },
    { month: 5, day: 1, name: 'วันแรงงานแห่งชาติ', nameEn: 'National Labour Day' },
    { month: 7, day: 28, name: 'วันเฉลิมพระชนมพรรษา ร.10', nameEn: "King's Birthday" },
    { month: 8, day: 12, name: 'วันแม่แห่งชาติ', nameEn: "Mother's Day" },
    { month: 10, day: 23, name: 'วันปิยมหาราช', nameEn: 'Chulalongkorn Day' },
    { month: 12, day: 5, name: 'วันพ่อแห่งชาติ', nameEn: "Father's Day" },
    { month: 12, day: 10, name: 'วันรัฐธรรมนูญ', nameEn: 'Constitution Day' },
    { month: 12, day: 31, name: 'วันสิ้นปี', nameEn: "New Year's Eve" },
  ];

  for (const holiday of holidays) {
    const date = new Date(Date.UTC(year, holiday.month - 1, holiday.day));
    await prisma.holiday.upsert({
      where: {
        organizationId_date_workLocationId: {
          organizationId: organization.id,
          date,
          workLocationId: null as unknown as string,
        },
      },
      create: { organizationId: organization.id, date, name: holiday.name, nameEn: holiday.nameEn },
      update: {},
    }).catch(() => undefined); // composite unique with a null column: ignore duplicates
  }

  // ---- Leave types (Thai Labour Protection Act minimums) ------------------
  const leaveTypes = await upsertMany(
    [
      {
        code: 'ANNUAL',
        name: 'ลาพักร้อน',
        nameEn: 'Annual leave',
        defaultQuota: 6,
        accrualMethod: LeaveAccrualMethod.SENIORITY_TIERED,
        seniorityTiers: [
          { years: 0, quota: 6 },
          { years: 1, quota: 8 },
          { years: 3, quota: 10 },
          { years: 5, quota: 12 },
          { years: 10, quota: 15 },
        ],
        isStatutory: true,
        minNoticeDays: 3,
        carryOverMaxDays: 5,
        minServiceDays: 120,
        colorHex: '#2563eb',
        orderIndex: 1,
      },
      {
        code: 'SICK',
        name: 'ลาป่วย',
        nameEn: 'Sick leave',
        defaultQuota: 30,
        accrualMethod: LeaveAccrualMethod.ANNUAL_GRANT,
        isStatutory: true,
        requiresAttachment: true,
        attachmentRequiredAfterDays: 3,
        minNoticeDays: 0,
        colorHex: '#dc2626',
        orderIndex: 2,
      },
      {
        code: 'PERSONAL',
        name: 'ลากิจ',
        nameEn: 'Personal leave',
        defaultQuota: 3,
        accrualMethod: LeaveAccrualMethod.ANNUAL_GRANT,
        isStatutory: true,
        minNoticeDays: 1,
        colorHex: '#f59e0b',
        orderIndex: 3,
      },
      {
        code: 'MATERNITY',
        name: 'ลาคลอด',
        nameEn: 'Maternity leave',
        defaultQuota: 98,
        accrualMethod: LeaveAccrualMethod.ANNUAL_GRANT,
        isStatutory: true,
        genderRestriction: Gender.FEMALE,
        allowHalfDay: false,
        requiresAttachment: true,
        colorHex: '#db2777',
        orderIndex: 4,
      },
      {
        code: 'PATERNITY',
        name: 'ลาเพื่อดูแลบุตร',
        nameEn: 'Paternity leave',
        defaultQuota: 15,
        accrualMethod: LeaveAccrualMethod.ANNUAL_GRANT,
        genderRestriction: Gender.MALE,
        colorHex: '#0891b2',
        orderIndex: 5,
      },
      {
        code: 'ORDINATION',
        name: 'ลาอุปสมบท',
        nameEn: 'Ordination leave',
        defaultQuota: 15,
        accrualMethod: LeaveAccrualMethod.NONE,
        allowHalfDay: false,
        minNoticeDays: 30,
        minServiceDays: 365,
        colorHex: '#ca8a04',
        orderIndex: 6,
      },
      {
        code: 'MILITARY',
        name: 'ลารับราชการทหาร',
        nameEn: 'Military service leave',
        defaultQuota: 60,
        accrualMethod: LeaveAccrualMethod.NONE,
        isStatutory: true,
        requiresAttachment: true,
        colorHex: '#4b5563',
        orderIndex: 7,
      },
      {
        code: 'UNPAID',
        name: 'ลาไม่รับค่าจ้าง',
        nameEn: 'Unpaid leave',
        defaultQuota: 0,
        accrualMethod: LeaveAccrualMethod.NONE,
        isPaid: false,
        allowNegativeBalance: true,
        colorHex: '#6b7280',
        orderIndex: 8,
      },
    ],
    (t) =>
      prisma.leaveType.upsert({
        where: { organizationId_code: { organizationId: organization.id, code: t.code } },
        create: { ...t, organizationId: organization.id },
        update: {},
      }),
  );
  console.log(`  leave types: ${leaveTypes.size}`);

  // ---- Pay components -----------------------------------------------------
  const payComponents = [
    { code: 'HOUSING', name: 'ค่าที่พัก', type: PayComponentType.EARNING, isTaxable: true, includeInSsoBase: true, orderIndex: 1 },
    { code: 'TRANSPORT', name: 'ค่าเดินทาง', type: PayComponentType.EARNING, isTaxable: true, includeInSsoBase: true, orderIndex: 2 },
    { code: 'PHONE', name: 'ค่าโทรศัพท์', type: PayComponentType.EARNING, isTaxable: true, includeInSsoBase: false, orderIndex: 3 },
    { code: 'POSITION', name: 'ค่าตำแหน่ง', type: PayComponentType.EARNING, isTaxable: true, includeInSsoBase: true, orderIndex: 4 },
    { code: 'MEAL', name: 'ค่าอาหาร', type: PayComponentType.EARNING, isTaxable: false, includeInSsoBase: false, orderIndex: 5 },
    { code: 'LOAN', name: 'หักชำระเงินกู้', type: PayComponentType.DEDUCTION, isTaxable: false, includeInSsoBase: false, orderIndex: 10 },
    { code: 'ADVANCE', name: 'หักเงินยืมทดรอง', type: PayComponentType.DEDUCTION, isTaxable: false, includeInSsoBase: false, orderIndex: 11 },
  ];

  for (const component of payComponents) {
    await prisma.payComponent.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: component.code } },
      create: { ...component, organizationId: organization.id },
      update: {},
    });
  }

  // ---- Benefit plans ------------------------------------------------------
  const benefitPlans = [
    {
      code: 'HEALTH_GROUP',
      name: 'ประกันสุขภาพกลุ่ม',
      category: BenefitCategory.HEALTH_INSURANCE,
      provider: 'AIA',
      coverageAmount: 500_000,
      employerCostPerPeriod: 1_200,
      eligibilityRule: { minServiceMonths: 4, employmentTypes: [EmploymentType.FULL_TIME] },
    },
    {
      code: 'DENTAL',
      name: 'สวัสดิการทันตกรรม',
      category: BenefitCategory.DENTAL,
      annualLimit: 3_000,
      eligibilityRule: { minServiceMonths: 4 },
    },
    {
      code: 'TRAINING',
      name: 'งบพัฒนาตนเอง',
      category: BenefitCategory.TRAINING,
      annualLimit: 20_000,
      eligibilityRule: { minServiceMonths: 12 },
    },
    {
      code: 'PVD',
      name: 'กองทุนสำรองเลี้ยงชีพ',
      category: BenefitCategory.PROVIDENT_FUND,
      eligibilityRule: { minServiceMonths: 4, employmentTypes: [EmploymentType.FULL_TIME] },
    },
  ];

  for (const plan of benefitPlans) {
    await prisma.benefitPlan.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: plan.code } },
      create: { ...plan, organizationId: organization.id },
      update: {},
    });
  }

  // ---- People -------------------------------------------------------------
  const passwordHash = await argonHash(DEFAULT_PASSWORD, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const people = [
    {
      code: 'EMP-0001',
      first: 'สมศักดิ์',
      last: 'ธนาวงศ์',
      email: 'ceo@marma.example',
      dept: 'EXEC',
      position: 'CEO',
      role: SystemRole.SUPER_ADMIN,
      salary: 250_000,
      gender: Gender.MALE,
      manager: null as string | null,
    },
    {
      code: 'EMP-0002',
      first: 'วราภรณ์',
      last: 'สุขสวัสดิ์',
      email: 'hr.manager@marma.example',
      dept: 'HR',
      position: 'HRM',
      role: SystemRole.HR_ADMIN,
      salary: 90_000,
      gender: Gender.FEMALE,
      manager: 'EMP-0001',
    },
    {
      code: 'EMP-0003',
      first: 'ณัฐพล',
      last: 'จันทร์เพ็ญ',
      email: 'hr.officer@marma.example',
      dept: 'HR',
      position: 'HRO',
      role: SystemRole.HR_OFFICER,
      salary: 38_000,
      gender: Gender.MALE,
      manager: 'EMP-0002',
    },
    {
      code: 'EMP-0004',
      first: 'พิมพ์ชนก',
      last: 'ศรีสุข',
      email: 'payroll@marma.example',
      dept: 'FIN',
      position: 'PAYO',
      role: SystemRole.PAYROLL_OFFICER,
      salary: 45_000,
      gender: Gender.FEMALE,
      manager: 'EMP-0001',
    },
    {
      code: 'EMP-0005',
      first: 'ธนกร',
      last: 'วิริยะกุล',
      email: 'eng.manager@marma.example',
      dept: 'ENG',
      position: 'EM',
      role: SystemRole.MANAGER,
      salary: 120_000,
      gender: Gender.MALE,
      manager: 'EMP-0001',
    },
    {
      code: 'EMP-0006',
      first: 'สุชานาถ',
      last: 'ประเสริฐ',
      email: 'dev1@marma.example',
      dept: 'ENG',
      position: 'SWE2',
      role: SystemRole.EMPLOYEE,
      salary: 75_000,
      gender: Gender.FEMALE,
      manager: 'EMP-0005',
    },
    {
      code: 'EMP-0007',
      first: 'อนุชา',
      last: 'แก้วมณี',
      email: 'dev2@marma.example',
      dept: 'ENG',
      position: 'SWE',
      role: SystemRole.EMPLOYEE,
      salary: 45_000,
      gender: Gender.MALE,
      manager: 'EMP-0005',
    },
    {
      code: 'EMP-0008',
      first: 'กมลชนก',
      last: 'บุญมี',
      email: 'sales1@marma.example',
      dept: 'SALES',
      position: 'SALES',
      role: SystemRole.EMPLOYEE,
      salary: 32_000,
      gender: Gender.FEMALE,
      manager: 'EMP-0001',
    },
  ];

  const employeesByCode = new Map<string, string>();

  for (const person of people) {
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId: organization.id, email: person.email } },
      create: {
        organizationId: organization.id,
        email: person.email,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
      },
      update: { passwordHash, status: UserStatus.ACTIVE },
    });

    await prisma.userRole.upsert({
      where: {
        userId_roleId_departmentId: {
          userId: user.id,
          roleId: roles.get(person.role)!,
          departmentId: null as unknown as string,
        },
      },
      create: { userId: user.id, roleId: roles.get(person.role)! },
      update: {},
    }).catch(async () => {
      const already = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: roles.get(person.role)! },
      });
      if (!already) {
        await prisma.userRole.create({ data: { userId: user.id, roleId: roles.get(person.role)! } });
      }
    });

    const hireDate = new Date(Date.UTC(year - 2, 0, 15));

    const employee = await prisma.employee.upsert({
      where: { organizationId_employeeCode: { organizationId: organization.id, employeeCode: person.code } },
      create: {
        organizationId: organization.id,
        employeeCode: person.code,
        userId: user.id,
        firstNameTh: person.first,
        lastNameTh: person.last,
        gender: person.gender,
        workEmail: person.email,
        departmentId: departments.get(person.dept)!.id,
        positionId: positions.get(person.position)!.id,
        workLocationId: headOffice.id,
        employmentType: EmploymentType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        hireDate,
      },
      update: { userId: user.id },
    });

    employeesByCode.set(person.code, employee.id);

    await prisma.employeeCompensation.upsert({
      where: { employeeId_effectiveFrom: { employeeId: employee.id, effectiveFrom: hireDate } },
      create: {
        employeeId: employee.id,
        effectiveFrom: hireDate,
        baseSalary: person.salary,
        pvdEmployeeRate: 3,
        pvdEmployerRate: 3,
        isOvertimeEligible: person.salary < 100_000,
      },
      update: {},
    });

    await prisma.scheduleAssignment.findFirst({
      where: { employeeId: employee.id, scheduleId: schedule.id },
    }).then(async (existing) => {
      if (!existing) {
        await prisma.scheduleAssignment.create({
          data: { employeeId: employee.id, scheduleId: schedule.id, effectiveFrom: hireDate },
        });
      }
    });
  }

  // Reporting lines, once every employee exists.
  for (const person of people.filter((p) => p.manager)) {
    await prisma.employee.update({
      where: { id: employeesByCode.get(person.code)! },
      data: { managerId: employeesByCode.get(person.manager!)! },
    });
  }

  await prisma.department.update({
    where: { id: departments.get('HR')!.id },
    data: { headEmployeeId: employeesByCode.get('EMP-0002')! },
  });
  await prisma.department.update({
    where: { id: departments.get('ENG')!.id },
    data: { headEmployeeId: employeesByCode.get('EMP-0005')! },
  });

  console.log(`  employees: ${employeesByCode.size}`);

  // ---- Approval policies --------------------------------------------------
  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.LEAVE_REQUEST,
    name: 'ลา 1-2 วัน — หัวหน้าโดยตรง',
    conditions: { totalDays: { lte: 2 } },
    priority: 10,
    steps: [{ orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1, slaHours: 48 }],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.LEAVE_REQUEST,
    name: 'ลามากกว่า 2 วัน — หัวหน้า + HR',
    conditions: { totalDays: { gt: 2 } },
    priority: 20,
    steps: [
      { orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1, slaHours: 48 },
      { orderIndex: 1, approverType: ApproverType.ROLE, roleId: roles.get(SystemRole.HR_OFFICER), slaHours: 48 },
    ],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.OVERTIME_REQUEST,
    name: 'โอที — หัวหน้าโดยตรง',
    conditions: {},
    priority: 0,
    steps: [{ orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1, slaHours: 24 }],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.EXPENSE_CLAIM,
    name: 'เบิกไม่เกิน 5,000 — หัวหน้าโดยตรง',
    conditions: { totalAmount: { lte: 5000 } },
    priority: 10,
    steps: [{ orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1 }],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.EXPENSE_CLAIM,
    name: 'เบิกเกิน 5,000 — หัวหน้า + การเงิน',
    conditions: { totalAmount: { gt: 5000 } },
    priority: 20,
    steps: [
      { orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1 },
      { orderIndex: 1, approverType: ApproverType.ROLE, roleId: roles.get(SystemRole.PAYROLL_OFFICER) },
    ],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.RESIGNATION,
    name: 'ลาออก — หัวหน้า + HR',
    conditions: {},
    priority: 0,
    steps: [
      { orderIndex: 0, approverType: ApproverType.LINE_MANAGER, levelsUp: 1 },
      { orderIndex: 1, approverType: ApproverType.ROLE, roleId: roles.get(SystemRole.HR_ADMIN) },
    ],
  });

  await seedApprovalPolicy(organization.id, {
    entityType: ApprovalEntityType.DOCUMENT_REQUEST,
    name: 'ขอเอกสาร — HR',
    conditions: {},
    priority: 0,
    steps: [{ orderIndex: 0, approverType: ApproverType.ROLE, roleId: roles.get(SystemRole.HR_OFFICER) }],
  });

  // ---- HR knowledge base --------------------------------------------------
  const knowledgeDocs = [
    {
      title: 'ระเบียบการลาพักร้อน',
      category: 'การลา',
      content: `# ระเบียบการลาพักร้อน

พนักงานประจำมีสิทธิลาพักร้อนตามอายุงาน ดังนี้
- อายุงานน้อยกว่า 1 ปี: 6 วันต่อปี (ใช้ได้เมื่อผ่านทดลองงาน 120 วัน)
- อายุงาน 1 ปีขึ้นไป: 8 วันต่อปี
- อายุงาน 3 ปีขึ้นไป: 10 วันต่อปี
- อายุงาน 5 ปีขึ้นไป: 12 วันต่อปี
- อายุงาน 10 ปีขึ้นไป: 15 วันต่อปี

## การยื่นคำขอ
ต้องยื่นล่วงหน้าอย่างน้อย 3 วันทำการ ผ่านระบบ MarMa HRIS
การลา 1-2 วัน อนุมัติโดยหัวหน้างานโดยตรง
การลาเกิน 2 วัน ต้องผ่านหัวหน้างานและฝ่ายบุคคล

## วันคงเหลือ
วันลาพักร้อนที่ไม่ได้ใช้สามารถทบไปปีถัดไปได้ไม่เกิน 5 วัน
ส่วนที่เกิน 5 วันจะหมดอายุในวันที่ 31 ธันวาคมของทุกปี
สามารถลาครึ่งวันได้ (ครึ่งเช้าหรือครึ่งบ่าย)`,
    },
    {
      title: 'ระเบียบการลาป่วยและลากิจ',
      category: 'การลา',
      content: `# ระเบียบการลาป่วย

พนักงานมีสิทธิลาป่วยได้เท่าที่ป่วยจริง แต่ได้รับค่าจ้างไม่เกิน 30 วันทำงานต่อปี
การลาป่วยตั้งแต่ 3 วันทำงานขึ้นไปติดต่อกัน ต้องแนบใบรับรองแพทย์
หากไม่สามารถแจ้งล่วงหน้าได้ ให้แจ้งหัวหน้างานโดยเร็วที่สุดในวันแรกที่ลา

# ระเบียบการลากิจ

พนักงานมีสิทธิลากิจธุระจำเป็นโดยได้รับค่าจ้าง 3 วันทำงานต่อปี
ต้องยื่นล่วงหน้าอย่างน้อย 1 วันทำการ เว้นแต่กรณีฉุกเฉิน
การลากิจเกินสิทธิจะถูกบันทึกเป็นลาไม่รับค่าจ้าง`,
    },
    {
      title: 'ระเบียบการทำงานล่วงเวลา (โอที)',
      category: 'เวลาทำงาน',
      content: `# การทำงานล่วงเวลา

การทำโอทีต้องได้รับอนุมัติจากหัวหน้างานล่วงหน้าผ่านระบบ MarMa HRIS
ระบบจะจ่ายค่าล่วงเวลาตามจำนวนชั่วโมงที่ "ได้รับอนุมัติ" เท่านั้น ไม่ใช่ตามเวลาที่บันทึกเข้า-ออกงาน

## อัตราค่าล่วงเวลา (ตามพระราชบัญญัติคุ้มครองแรงงาน)
- ทำล่วงเวลาในวันทำงานปกติ: 1.5 เท่าของค่าจ้างรายชั่วโมง
- ทำงานในวันหยุดประจำสัปดาห์: 1 เท่าเพิ่มเติม
- ทำงานในวันหยุดนักขัตฤกษ์: 2 เท่า
- ทำล่วงเวลาในวันหยุด: 3 เท่า

## ข้อจำกัด
คำขอโอทีหนึ่งครั้งไม่เกิน 12 ชั่วโมง
พนักงานระดับผู้บริหาร (เงินเดือนตั้งแต่ 100,000 บาท) ไม่มีสิทธิรับค่าล่วงเวลา`,
    },
    {
      title: 'ระเบียบการลงเวลาเข้า-ออกงาน',
      category: 'เวลาทำงาน',
      content: `# การลงเวลาทำงาน

เวลาทำงานปกติ 09:00 - 18:00 น. พักกลางวัน 1 ชั่วโมง (รวม 8 ชั่วโมงทำงาน)
ผ่อนผันการเข้างานสาย 15 นาที หลังจากนั้นระบบจะบันทึกเป็น "มาสาย"

## วิธีลงเวลา
ลงเวลาผ่านแอปมือถือ MarMa HRIS โดยเปิด GPS
ระบบจะตรวจสอบว่าอยู่ในรัศมี 250 เมตรจากสำนักงาน
หากอยู่นอกพื้นที่ ระบบยังบันทึกเวลาให้ แต่จะติดธงให้ HR ตรวจสอบ

## ลืมลงเวลา
หากลืมลงเวลาเข้าหรือออก ให้ยื่น "คำขอแก้ไขเวลา" พร้อมระบุเหตุผลผ่านระบบ
หัวหน้างานหรือ HR จะพิจารณาอนุมัติ
เมื่อรอบเงินเดือนปิดแล้ว จะไม่สามารถแก้ไขเวลาย้อนหลังได้`,
    },
    {
      title: 'ระเบียบการเบิกค่าใช้จ่าย',
      category: 'การเงิน',
      content: `# การเบิกค่าใช้จ่าย

ยื่นคำขอเบิกผ่านระบบ MarMa HRIS พร้อมแนบใบเสร็จรับเงินทุกรายการ
กำหนดส่งภายใน 30 วันนับจากวันที่เกิดค่าใช้จ่าย

## สายการอนุมัติ
- ไม่เกิน 5,000 บาท: หัวหน้างานโดยตรง
- เกิน 5,000 บาท: หัวหน้างาน และฝ่ายการเงิน

## การจ่ายเงิน
ค่าใช้จ่ายที่อนุมัติแล้วจะจ่ายพร้อมเงินเดือนงวดถัดไป
เงินค่าเบิกคืนไม่ถือเป็นเงินได้ จึงไม่นำไปคำนวณภาษีและประกันสังคม`,
    },
    {
      title: 'สวัสดิการพนักงาน',
      category: 'สวัสดิการ',
      content: `# สวัสดิการพนักงาน

## ประกันสุขภาพกลุ่ม
วงเงินคุ้มครอง 500,000 บาทต่อปี บริษัทจ่ายเบี้ยประกันให้ทั้งหมด
มีสิทธิเมื่ออายุงานครบ 4 เดือน (พนักงานประจำเท่านั้น)

## ทันตกรรม
วงเงิน 3,000 บาทต่อปี เบิกได้ตามจริงพร้อมใบเสร็จ

## งบพัฒนาตนเอง
วงเงิน 20,000 บาทต่อปี สำหรับคอร์สอบรม หนังสือ หรือการสอบใบรับรอง
มีสิทธิเมื่ออายุงานครบ 1 ปี ต้องได้รับอนุมัติจากหัวหน้างานก่อน

## กองทุนสำรองเลี้ยงชีพ
พนักงานสะสม 3% บริษัทสมทบ 3% ของเงินเดือน
มีสิทธิเมื่ออายุงานครบ 4 เดือน

## ประกันสังคม
หักในอัตรา 5% ของค่าจ้าง สูงสุด 750 บาทต่อเดือน (ฐานสูงสุด 15,000 บาท)
บริษัทสมทบในจำนวนเท่ากัน`,
    },
    {
      title: 'ขั้นตอนการลาออก',
      category: 'การพ้นสภาพ',
      content: `# ขั้นตอนการลาออก

## การแจ้งล่วงหน้า
ต้องยื่นใบลาออกผ่านระบบ MarMa HRIS ล่วงหน้าอย่างน้อย 30 วัน
สายการอนุมัติ: หัวหน้างานโดยตรง จากนั้นผู้จัดการฝ่ายบุคคล

## การส่งมอบงาน
เมื่อได้รับอนุมัติ ระบบจะสร้างรายการเคลียร์ของอัตโนมัติ ได้แก่
1. คืนคอมพิวเตอร์และอุปกรณ์ไอที
2. ปิดสิทธิ์การเข้าถึงระบบและอีเมล
3. คืนบัตรพนักงานและกุญแจ
4. ส่งมอบงานให้ผู้รับผิดชอบแทน
5. เคลียร์เงินยืมทดรองและค่าใช้จ่ายค้างเบิก
6. สรุปวันลาคงเหลือและคำนวณเงินชดเชย
7. สัมภาษณ์พนักงานลาออก

## วันทำงานสุดท้าย
บัญชีผู้ใช้จะถูกปิดอัตโนมัติหลังวันทำงานสุดท้าย
เงินเดือนงวดสุดท้ายและเงินค่าจ้างสำหรับวันลาพักร้อนคงเหลือจะจ่ายในรอบเงินเดือนถัดไป`,
    },
    {
      title: 'การประเมินผลงานและ KPI',
      category: 'การประเมินผล',
      content: `# การประเมินผลงาน

บริษัทประเมินผลงานปีละ 1 ครั้ง (รอบปฏิทิน มกราคม - ธันวาคม)

## น้ำหนักคะแนน
- ผลงานตาม KPI: 70%
- สมรรถนะ (Competency): 30%

## การตั้ง KPI
ตั้ง KPI ร่วมกับหัวหน้างานภายในเดือนมกราคม
น้ำหนักรวมของ KPI ทุกข้อของพนักงานหนึ่งคนต้องเท่ากับ 100%
ผลสำเร็จของแต่ละข้อคิดสูงสุด 150% เพื่อไม่ให้ KPI ข้อเดียวกลบผลข้ออื่น

## เกรดผลการประเมิน
- A (90 คะแนนขึ้นไป): ดีเยี่ยม
- B (75-89): ดี
- C (60-74): ตามเป้าหมาย
- D (40-59): ต้องปรับปรุง
- E (ต่ำกว่า 40): ไม่ผ่านเกณฑ์

พนักงานต้องกดรับทราบผลการประเมินในระบบหลังหัวหน้างานส่งผลแล้ว`,
    },
  ];

  for (const doc of knowledgeDocs) {
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { organizationId: organization.id, title: doc.title },
    });
    if (existing) continue;

    const created = await prisma.knowledgeDocument.create({
      data: {
        organizationId: organization.id,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        status: KnowledgeStatus.PUBLISHED,
        indexedAt: new Date(),
      },
    });

    const chunks = doc.content
      .split(/\n{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content, index) => ({
        documentId: created.id,
        chunkIndex: index,
        content,
        tokenCount: Math.ceil(content.length / 2),
        metadata: { title: doc.title, category: doc.category },
      })),
    });
  }
  console.log(`  knowledge documents: ${knowledgeDocs.length}`);

  // ---- A little attendance history, so dashboards are not empty ----------
  const devEmployeeId = employeesByCode.get('EMP-0007')!;
  for (let daysAgo = 1; daysAgo <= 5; daysAgo += 1) {
    const workDate = new Date();
    workDate.setUTCDate(workDate.getUTCDate() - daysAgo);
    const day = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate()));
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;

    await prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: devEmployeeId, workDate: day } },
      create: {
        organizationId: organization.id,
        employeeId: devEmployeeId,
        workDate: day,
        shiftId: dayShift.id,
        workLocationId: headOffice.id,
        firstClockInAt: new Date(`${day.toISOString().slice(0, 10)}T02:00:00.000Z`),
        lastClockOutAt: new Date(`${day.toISOString().slice(0, 10)}T11:05:00.000Z`),
        breakMinutes: 60,
        workedMinutes: 485,
        status: AttendanceStatus.PRESENT,
      },
      update: {},
    });
  }

  console.log('\nSeed complete.');
  console.log(`  Sign in at /api/v1/auth/login with any of:`);
  for (const person of people) {
    console.log(`    ${person.email.padEnd(30)} (${person.role})`);
  }
  console.log(`  Password: ${DEFAULT_PASSWORD}`);
}

async function upsertMany<T extends { code: string }, R extends { id: string }>(
  items: T[],
  upsert: (item: T) => Promise<R>,
): Promise<Map<string, R>> {
  const result = new Map<string, R>();
  for (const item of items) {
    result.set(item.code, await upsert(item));
  }
  return result;
}

async function seedApprovalPolicy(
  organizationId: string,
  policy: {
    entityType: ApprovalEntityType;
    name: string;
    conditions: Record<string, unknown>;
    priority: number;
    steps: Array<{
      orderIndex: number;
      approverType: ApproverType;
      levelsUp?: number;
      roleId?: string;
      slaHours?: number;
    }>;
  },
): Promise<void> {
  const existing = await prisma.approvalPolicy.findFirst({
    where: { organizationId, entityType: policy.entityType, name: policy.name },
  });
  if (existing) return;

  await prisma.approvalPolicy.create({
    data: {
      id: randomUUID(),
      organizationId,
      entityType: policy.entityType,
      name: policy.name,
      conditions: policy.conditions as never,
      priority: policy.priority,
      steps: {
        create: policy.steps.map((step) => ({
          orderIndex: step.orderIndex,
          approverType: step.approverType,
          levelsUp: step.levelsUp ?? 1,
          roleId: step.roleId,
          slaHours: step.slaHours,
        })),
      },
    },
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
