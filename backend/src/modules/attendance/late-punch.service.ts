import { Injectable, OnModuleInit } from '@nestjs/common';
import { ApprovalEntityType, ApprovalStatus, PunchType } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { formatDateOnly } from '../../core/utils/date.util';
import {
  ApprovalOutcomeRegistry,
  type ApprovalOutcome,
} from '../approvals/approval-outcome.registry';
import { ApprovalService } from '../approvals/approval.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * The manager confirmation for a late-captured offline punch (CW-025).
 *
 * A punch that reaches the server long after it was captured is still recorded
 * — an offline worker must never lose the time — and flagged `LATE_CAPTURE`.
 * This routes that flag through the existing approval engine so a manager can
 * *acknowledge* it (the delay is legitimate) or *reject* it (it looks forged).
 *
 * The confirmation never touches the punch. `attendance_punches` is append-only
 * at the database level and that property is load-bearing: a confirmation that
 * could edit or delete a punch would be a hole in the audit trail, not a
 * feature. So there is no backing row and nothing to mutate on the punch — the
 * `ApprovalInstance`, keyed on `(ATTENDANCE_LATE_PUNCH, punchId)`, *is* the
 * record of the decision. The only side effect of a decision is telling the
 * employee what a human concluded about their late punch.
 */
@Injectable()
export class LatePunchConfirmationService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly outcomes: ApprovalOutcomeRegistry,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.outcomes.register(ApprovalEntityType.ATTENDANCE_LATE_PUNCH, (outcome) =>
      this.onApprovalOutcome(outcome),
    );
  }

  /**
   * Opens a manager confirmation for a punch already recorded with the
   * `LATE_CAPTURE` flag. Best-effort routing: if no policy resolves an approver
   * the engine auto-approves and there is nothing to confirm, exactly as for
   * overtime and leave.
   */
  async openConfirmation(input: {
    organizationId: string;
    submittedByUserId: string;
    employeeId: string;
    punchId: string;
    punchType: PunchType;
    workDate: Date;
    delayHours: number;
  }): Promise<void> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { firstNameTh: true, lastNameTh: true, departmentId: true },
    });

    const name = employee ? `${employee.firstNameTh} ${employee.lastNameTh}` : 'พนักงาน';
    const delay = `${input.delayHours} ชั่วโมง`;

    await this.approvals.start({
      organizationId: input.organizationId,
      entityType: ApprovalEntityType.ATTENDANCE_LATE_PUNCH,
      entityId: input.punchId,
      submittedByUserId: input.submittedByUserId,
      subjectEmployeeId: input.employeeId,
      snapshot: {
        employeeId: input.employeeId,
        departmentId: employee?.departmentId ?? null,
        punchType: input.punchType,
        workDate: formatDateOnly(input.workDate),
        delayHours: input.delayHours,
      },
      notification: {
        title: 'การลงเวลาย้อนหลังรอการยืนยัน',
        body: `${name} ลงเวลา (${formatDateOnly(input.workDate)}) ที่ส่งเข้าระบบช้ากว่าที่บันทึกไว้ ${delay} — โปรดยืนยันหรือปฏิเสธ`,
      },
    });
  }

  // ------------------------------------------------------------------ internals

  /**
   * Records the manager's conclusion by telling the employee. Deliberately does
   * not write to `attendance_punches`: acknowledging or rejecting a flag changes
   * how a human reads the punch, never the punch itself.
   */
  private async onApprovalOutcome(outcome: ApprovalOutcome): Promise<void> {
    if (outcome.status !== ApprovalStatus.APPROVED && outcome.status !== ApprovalStatus.REJECTED) {
      return;
    }

    const punch = await this.prisma.attendancePunch.findUnique({
      where: { id: outcome.entityId },
      select: { workDate: true, employee: { select: { userId: true, organizationId: true } } },
    });
    if (!punch?.employee.userId) return;

    const acknowledged = outcome.status === ApprovalStatus.APPROVED;
    await this.notifications.notify(punch.employee.organizationId, punch.employee.userId, {
      type: acknowledged ? 'attendance.late_punch.acknowledged' : 'attendance.late_punch.rejected',
      title: acknowledged ? 'การลงเวลาย้อนหลังได้รับการยืนยัน' : 'การลงเวลาย้อนหลังถูกปฏิเสธ',
      body: acknowledged
        ? `การลงเวลาวันที่ ${formatDateOnly(punch.workDate)} ได้รับการยืนยันจากหัวหน้างานแล้ว`
        : `การลงเวลาวันที่ ${formatDateOnly(punch.workDate)} ถูกปฏิเสธ${outcome.comment ? ` — ${outcome.comment}` : ''}`,
      data: { punchId: outcome.entityId },
    });
  }
}
