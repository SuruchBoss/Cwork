import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, DayPortion, DocumentRequestType, LeaveRequestStatus } from '@prisma/client';
import { DomainError } from '../../core/errors/domain.errors';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AuthenticatedUser } from '../../core/security/current-user';
import { Permission } from '../../core/security/permissions';
import { formatDateOnly, yearsOfService } from '../../core/utils/date.util';
import { ApprovalService } from '../approvals/approval.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { LeaveBalanceService } from '../leave/leave-balance.service';
import { LeaveService } from '../leave/leave.service';
import { OrganizationService } from '../organization/organization.service';
import { KnowledgeService } from './knowledge.service';

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** Citations the assistant should surface with its answer. */
  citations?: Array<{ documentId: string; title: string; chunkIndex: number }>;
}

/**
 * Executes assistant tool calls.
 *
 * Every method takes the authenticated principal and resolves the subject from
 * it. No tool accepts an employee id, so there is no parameter a prompt
 * injection could set to read someone else's record — the blast radius of a
 * compromised model is limited to what this user could already see.
 */
@Injectable()
export class AssistantToolsService {
  private readonly logger = new Logger(AssistantToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly attendance: AttendanceService,
    private readonly documents: DocumentsService,
    private readonly knowledge: KnowledgeService,
    private readonly organization: OrganizationService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  async execute(
    user: AuthenticatedUser,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    // Every tool call is audited with its arguments — an assistant action must
    // be as traceable as a click in the admin console.
    await this.audit.record({
      organizationId: user.organizationId,
      actorUserId: user.userId,
      action: AuditAction.AI_TOOL_CALL,
      entityType: 'AssistantTool',
      entityId: toolName,
      summary: `Assistant called ${toolName}`,
      changes: { input },
    });

    try {
      switch (toolName) {
        case 'get_my_profile':
          return await this.getMyProfile(user);
        case 'get_leave_balance':
          return await this.getLeaveBalance(user, input);
        case 'list_my_leave_requests':
          return await this.listMyLeaveRequests(user, input);
        case 'preview_leave_request':
          return await this.previewLeaveRequest(user, input);
        case 'submit_leave_request':
          return await this.submitLeaveRequest(user, input);
        case 'get_attendance_today':
          return await this.getAttendanceToday(user);
        case 'get_attendance_summary':
          return await this.getAttendanceSummary(user, input);
        case 'get_latest_payslip':
          return await this.getLatestPayslip(user, input);
        case 'request_document':
          return await this.requestDocument(user, input);
        case 'search_hr_policy':
          return await this.searchPolicy(user, input);
        case 'list_holidays':
          return await this.listHolidays(user, input);
        case 'get_pending_approvals':
          return await this.getPendingApprovals(user);
        default:
          return { ok: false, error: `ไม่รู้จักเครื่องมือ "${toolName}"` };
      }
    } catch (error) {
      // Domain errors carry a message written for humans, so pass them through;
      // anything else is logged and reported generically.
      if (error instanceof DomainError) {
        return { ok: false, error: error.message };
      }
      this.logger.error(
        `Assistant tool ${toolName} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      return { ok: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูล กรุณาลองใหม่หรือติดต่อ HR' };
    }
  }

  // ---------------------------------------------------------------- read tools

  private async getMyProfile(user: AuthenticatedUser): Promise<ToolExecutionResult> {
    if (!user.employeeId) return { ok: false, error: 'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน' };

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: user.employeeId },
      select: {
        employeeCode: true,
        firstNameTh: true,
        lastNameTh: true,
        nickname: true,
        hireDate: true,
        status: true,
        employmentType: true,
        probationEndDate: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
        workLocation: { select: { name: true } },
        manager: { select: { firstNameTh: true, lastNameTh: true } },
      },
    });

    return {
      ok: true,
      data: {
        employeeCode: employee.employeeCode,
        name: `${employee.firstNameTh} ${employee.lastNameTh}`,
        nickname: employee.nickname,
        position: employee.position?.title ?? null,
        department: employee.department?.name ?? null,
        workLocation: employee.workLocation?.name ?? null,
        manager: employee.manager
          ? `${employee.manager.firstNameTh} ${employee.manager.lastNameTh}`
          : null,
        hireDate: formatDateOnly(employee.hireDate),
        yearsOfService: yearsOfService(employee.hireDate),
        employmentType: employee.employmentType,
        status: employee.status,
        probationEndDate: employee.probationEndDate
          ? formatDateOnly(employee.probationEndDate)
          : null,
      },
    };
  }

  private async getLeaveBalance(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (!user.employeeId) return { ok: false, error: 'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน' };

    const year = asInt(input.year) ?? new Date().getUTCFullYear();
    const balances = await this.leaveBalances.getBalances(
      user.organizationId,
      user.employeeId,
      year,
    );

    return {
      ok: true,
      data: {
        year,
        balances: balances.map((b) => ({
          code: b.code,
          name: b.name,
          granted: b.granted,
          used: b.used,
          pending: b.pending,
          available: b.available,
          isPaid: b.isPaid,
        })),
      },
    };
  }

  private async listMyLeaveRequests(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (!user.employeeId) return { ok: false, error: 'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน' };

    const status = asString(input.status) as LeaveRequestStatus | undefined;
    const limit = Math.min(asInt(input.limit) ?? 10, 20);

    const requests = await this.prisma.leaveRequest.findMany({
      where: { employeeId: user.employeeId, ...(status ? { status } : {}) },
      orderBy: { startDate: 'desc' },
      take: limit,
      select: {
        requestNo: true,
        startDate: true,
        endDate: true,
        totalDays: true,
        status: true,
        reason: true,
        leaveType: { select: { code: true, name: true } },
      },
    });

    return {
      ok: true,
      data: requests.map((r) => ({
        requestNo: r.requestNo,
        leaveType: r.leaveType.name,
        from: formatDateOnly(r.startDate),
        to: formatDateOnly(r.endDate),
        days: Number(r.totalDays),
        status: r.status,
        reason: r.reason,
      })),
    };
  }

  private async previewLeaveRequest(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const leaveType = await this.resolveLeaveType(
      user.organizationId,
      asString(input.leaveTypeCode),
    );
    if (!leaveType) {
      return { ok: false, error: `ไม่พบประเภทการลารหัส "${String(input.leaveTypeCode)}"` };
    }

    const preview = await this.leave.preview(user, {
      leaveTypeId: leaveType.id,
      startDate: asString(input.startDate)!,
      endDate: asString(input.endDate)!,
      startPortion: asPortion(input.startPortion),
      endPortion: asPortion(input.endPortion),
    });

    return {
      ok: true,
      data: {
        leaveType: preview.leaveType.name,
        from: asString(input.startDate),
        to: asString(input.endDate),
        chargedDays: preview.totalDays,
        chargedDates: preview.days.map((d) => `${d.date} (${d.dayValue} วัน)`),
        balanceBefore: preview.balanceBefore,
        balanceAfter: preview.balanceAfter,
        warnings: preview.warnings,
      },
    };
  }

  private async getAttendanceToday(user: AuthenticatedUser): Promise<ToolExecutionResult> {
    const today = await this.attendance.getToday(user);

    return {
      ok: true,
      data: {
        date: today.date,
        isClockedIn: today.isClockedIn,
        nextAction: today.nextAction,
        shift: today.shift
          ? `${today.shift.name} (${today.shift.startTime}-${today.shift.endTime})`
          : null,
        firstClockInAt: today.record?.firstClockInAt ?? null,
        lastClockOutAt: today.record?.lastClockOutAt ?? null,
        status: today.record?.status ?? 'NOT_STARTED',
        lateMinutes: today.record?.lateMinutes ?? 0,
      },
    };
  }

  private async getAttendanceSummary(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (!user.employeeId) return { ok: false, error: 'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน' };

    const now = new Date();
    const year = asInt(input.year) ?? now.getUTCFullYear();
    const month = asInt(input.month) ?? now.getUTCMonth() + 1;

    const result = await this.attendance.monthlySummary(
      user.organizationId,
      user.employeeId,
      year,
      month,
    );

    return {
      ok: true,
      data: {
        year,
        month,
        presentDays: result.summary.presentDays,
        absentDays: result.summary.absentDays,
        leaveDays: result.summary.leaveDays,
        lateDays: result.summary.lateDays,
        totalLateMinutes: result.summary.lateMinutes,
        workedHours: Math.round((result.summary.workedMinutes / 60) * 10) / 10,
        approvedOvertimeHours: Math.round((result.summary.approvedOvertimeMinutes / 60) * 10) / 10,
      },
    };
  }

  private async getLatestPayslip(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (!user.employeeId) return { ok: false, error: 'บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน' };

    const year = asInt(input.year);
    const month = asInt(input.month);

    const payslip = await this.prisma.payslip.findFirst({
      where: {
        employeeId: user.employeeId,
        publishedAt: { not: null },
        ...(year || month
          ? {
              run: {
                period: { ...(year ? { year } : {}), ...(month ? { month } : {}) },
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { orderIndex: 'asc' } },
        run: { include: { period: { select: { code: true, payDate: true } } } },
      },
    });

    if (!payslip) return { ok: false, error: 'ยังไม่มีสลิปเงินเดือนที่เผยแพร่สำหรับงวดที่ระบุ' };

    return {
      ok: true,
      data: {
        period: payslip.run.period.code,
        payDate: formatDateOnly(payslip.run.period.payDate),
        currency: payslip.currency,
        grossEarnings: Number(payslip.grossEarnings),
        totalDeductions: Number(payslip.totalDeductions),
        netPay: Number(payslip.netPay),
        withholdingTax: Number(payslip.withholdingTax),
        socialSecurity: Number(payslip.ssoEmployee),
        overtimeHours: Number(payslip.overtimeHours),
        items: payslip.items.map((item) => ({
          name: item.name,
          type: item.type,
          amount: Number(item.amount),
        })),
      },
    };
  }

  private async searchPolicy(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const query = asString(input.query);
    if (!query) return { ok: false, error: 'กรุณาระบุคำค้น' };

    const hits = await this.knowledge.search(user.organizationId, query, user.roles, 5);

    if (hits.length === 0) {
      return {
        ok: true,
        data: {
          found: false,
          message: 'ไม่พบข้อมูลนี้ในระเบียบบริษัทที่บันทึกไว้ในระบบ',
        },
      };
    }

    return {
      ok: true,
      data: {
        found: true,
        passages: hits.map((hit) => ({
          title: hit.title,
          category: hit.category,
          content: hit.content,
        })),
      },
      citations: hits.map((hit) => ({
        documentId: hit.documentId,
        title: hit.title,
        chunkIndex: hit.chunkIndex,
      })),
    };
  }

  private async listHolidays(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const year = asInt(input.year) ?? new Date().getUTCFullYear();
    const holidays = await this.organization.listHolidays(user.organizationId, year);

    return {
      ok: true,
      data: holidays.map((h) => ({ date: formatDateOnly(h.date), name: h.name })),
    };
  }

  private async getPendingApprovals(user: AuthenticatedUser): Promise<ToolExecutionResult> {
    if (!user.permissions.includes(Permission.APPROVAL_ACT)) {
      return { ok: false, error: 'บัญชีนี้ไม่มีสิทธิ์อนุมัติคำขอ' };
    }

    const tasks = await this.approvals.listMyTasks(user.userId);

    return {
      ok: true,
      data: tasks.map((task) => ({
        type: task.instance.entityType,
        submittedBy: task.instance.submittedBy.employee
          ? `${task.instance.submittedBy.employee.firstNameTh} ${task.instance.submittedBy.employee.lastNameTh}`
          : task.instance.submittedBy.email,
        submittedAt: task.instance.submittedAt,
        summary: task.instance.snapshot,
        dueAt: task.dueAt,
      })),
    };
  }

  // --------------------------------------------------------------- write tools

  private async submitLeaveRequest(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (input.confirmed !== true) {
      return {
        ok: false,
        error:
          'ยังไม่ได้รับการยืนยันจากผู้ใช้ กรุณาสรุปรายละเอียดให้ผู้ใช้ยืนยันก่อนแล้วเรียกใหม่พร้อม confirmed=true',
      };
    }

    const leaveType = await this.resolveLeaveType(
      user.organizationId,
      asString(input.leaveTypeCode),
    );
    if (!leaveType) {
      return { ok: false, error: `ไม่พบประเภทการลารหัส "${String(input.leaveTypeCode)}"` };
    }

    const created = await this.leave.createViaAssistant(user, {
      leaveTypeId: leaveType.id,
      startDate: asString(input.startDate)!,
      endDate: asString(input.endDate)!,
      startPortion: asPortion(input.startPortion),
      endPortion: asPortion(input.endPortion),
      reason: asString(input.reason),
    });

    return {
      ok: true,
      data: {
        requestNo: created.requestNo,
        leaveType: created.leaveType.name,
        from: formatDateOnly(created.startDate),
        to: formatDateOnly(created.endDate),
        days: Number(created.totalDays),
        status: created.status,
        message: 'ยื่นคำขอลาเรียบร้อยแล้ว รอผู้อนุมัติพิจารณา',
      },
    };
  }

  private async requestDocument(
    user: AuthenticatedUser,
    input: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (input.confirmed !== true) {
      return {
        ok: false,
        error:
          'ยังไม่ได้รับการยืนยันจากผู้ใช้ กรุณาสรุปรายละเอียดให้ผู้ใช้ยืนยันก่อนแล้วเรียกใหม่พร้อม confirmed=true',
      };
    }

    const type = asString(input.type) as DocumentRequestType | undefined;
    if (!type) return { ok: false, error: 'กรุณาระบุประเภทเอกสาร' };

    const created = await this.documents.create(
      user,
      {
        type,
        language: asString(input.language) ?? 'th',
        purpose: asString(input.purpose),
        addressedTo: asString(input.addressedTo),
      },
      true,
    );

    return {
      ok: true,
      data: {
        referenceNo: created.referenceNo,
        type: created.type,
        status: created.status,
        message: 'ยื่นคำขอเอกสารเรียบร้อยแล้ว HR จะดำเนินการและแจ้งกลับเมื่อเอกสารพร้อม',
      },
    };
  }

  // ------------------------------------------------------------------ internals

  private resolveLeaveType(organizationId: string, code: string | undefined) {
    if (!code) return null;
    return this.prisma.leaveType.findFirst({
      where: { organizationId, code: code.toUpperCase(), isActive: true, deletedAt: null },
    });
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function asPortion(value: unknown): DayPortion | undefined {
  const s = asString(value);
  if (!s) return undefined;
  return (Object.values(DayPortion) as string[]).includes(s) ? (s as DayPortion) : undefined;
}
