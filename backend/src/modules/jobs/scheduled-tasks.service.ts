import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { subDays } from 'date-fns';
import { PrismaService } from '../../core/prisma/prisma.service';
import { APP_CONFIG } from '../../core/config/config.module';
import type { RootConfig } from '../../core/config/configuration';
import { AttendanceService } from '../attendance/attendance.service';
import { OffboardingService } from '../employees/offboarding.service';
import { FilesService } from '../files/files.service';
import { MalwareScannerService } from '../files/malware-scanner.service';
import { LeaveBalanceService } from '../leave/leave-balance.service';
import { RecruitmentService } from '../recruitment/recruitment.service';

/**
 * Nightly maintenance.
 *
 * Every task here is idempotent and bounded by date, so a missed run catches up
 * on the next one and a double run changes nothing. Cron times are UTC; the
 * defaults are chosen to land in the early hours of Asia/Bangkok.
 *
 * For a multi-instance deployment, put a leader election or a job queue in
 * front of these — see docs/operations.md.
 */
@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly offboarding: OffboardingService,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly recruitment: RecruitmentService,
    private readonly files: FilesService,
    private readonly scanner: MalwareScannerService,
    @Inject(APP_CONFIG) private readonly config: RootConfig,
  ) {}

  /**
   * Clears out rate-limit counters whose windows ended long ago.
   *
   * Only relevant when the counters are shared; the in-memory store forgets
   * them by itself. A day's grace is deliberate — a counter still inside its
   * block must survive, and nothing here is worth racing the clock over.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'purge-rate-limit-counters' })
  async purgeRateLimitCounters(): Promise<void> {
    if (this.config.security.throttleStorage !== 'postgres') return;

    const { count } = await this.prisma.rateLimitCounter.deleteMany({
      where: { expiresAt: { lt: subDays(new Date(), 1) }, blockedUntil: null },
    });
    if (count > 0) this.logger.log(`Purged ${count} expired rate-limit counter(s)`);
  }

  /**
   * Picks up files stored while the scanner was unreachable.
   *
   * An upload whose scan could not complete is held `PENDING` — recorded, but
   * refused on download. This is what eventually gives it a verdict, so a
   * clamd outage costs a delay rather than a lost file.
   *
   * Hourly rather than nightly: a file nobody can open is a support ticket.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'rescan-pending-files' })
  async rescanPendingFiles(): Promise<void> {
    if (!this.scanner.enabled) return;

    const pending = await this.files.findPending();
    if (pending.length === 0) return;

    let cleared = 0;
    let quarantined = 0;
    let stillWaiting = 0;

    for (const { id } of pending) {
      const status = await this.files.rescan(id);
      if (status === 'CLEAN' || status === 'SKIPPED') cleared += 1;
      else if (status === 'INFECTED') quarantined += 1;
      else stillWaiting += 1;
    }

    this.logger.log(
      `Rescanned ${pending.length} pending file(s): ` +
        `${cleared} cleared, ${quarantined} quarantined, ${stillWaiting} still waiting`,
    );
  }

  /** 18:00 UTC = 01:00 Asia/Bangkok — closes out the day that just ended. */
  @Cron('0 18 * * *', { name: 'attendance-close-out' })
  async closeOutAttendance(): Promise<void> {
    const organizations = await this.activeOrganizations();
    const yesterday = subDays(new Date(), 1);

    for (const org of organizations) {
      try {
        const result = await this.attendance.closeOutDay(org.id, yesterday);
        this.logger.log(
          `[${org.code}] attendance close-out: ${result.absent} absent, ${result.incomplete} incomplete`,
        );
      } catch (error) {
        // One tenant's failure must not stop the others.
        this.logger.error(
          `[${org.code}] attendance close-out failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** Ends employment for anyone whose final working day has passed. */
  @Cron('30 18 * * *', { name: 'finalise-separations' })
  async finaliseSeparations(): Promise<void> {
    try {
      const count = await this.offboarding.finaliseDueSeparations();
      if (count > 0) this.logger.log(`Finalised ${count} separation(s)`);
    } catch (error) {
      this.logger.error(
        'Separation finalisation failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** PDPA retention: erases candidate PII whose consent has lapsed. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'purge-expired-candidates' })
  async purgeCandidates(): Promise<void> {
    const organizations = await this.activeOrganizations();

    for (const org of organizations) {
      try {
        const count = await this.recruitment.purgeExpiredCandidates(org.id);
        if (count > 0) this.logger.log(`[${org.code}] erased ${count} expired candidate record(s)`);
      } catch (error) {
        this.logger.error(
          `[${org.code}] candidate purge failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /** Expired sessions and used reset tokens are pruned weekly. */
  @Cron(CronExpression.EVERY_WEEK, { name: 'prune-expired-tokens' })
  async pruneExpiredTokens(): Promise<void> {
    const cutoff = subDays(new Date(), 30);

    const [sessions, resets] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    ]);

    this.logger.log(`Pruned ${sessions.count} expired session(s), ${resets.count} reset token(s)`);
  }

  /**
   * Leave-year roll-over, on 1 January. Carries the capped remainder forward
   * and expires the rest.
   */
  @Cron('0 18 31 12 *', { name: 'leave-year-rollover' })
  async rolloverLeaveYear(): Promise<void> {
    const organizations = await this.activeOrganizations();
    const year = new Date().getUTCFullYear();

    for (const org of organizations) {
      try {
        const processed = await this.leaveBalances.rolloverYear(org.id, year);
        this.logger.log(`[${org.code}] rolled over ${processed} leave entitlement(s) from ${year}`);
      } catch (error) {
        this.logger.error(
          `[${org.code}] leave roll-over failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private activeOrganizations() {
    return this.prisma.organization.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, code: true },
    });
  }
}
