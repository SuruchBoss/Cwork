import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './core/config/config.module';
import { AllExceptionsFilter } from './core/http/all-exceptions.filter';
import { AuditInterceptor } from './core/http/audit.interceptor';
import { RequestContextMiddleware } from './core/http/request-context.middleware';
import { PrismaModule } from './core/prisma/prisma.module';
import { PermissionsGuard } from './core/security/permissions.guard';
import { SequenceService } from './core/utils/sequence.service';
import { AssistantModule } from './modules/assistant/assistant.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuditModule } from './modules/audit/audit.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { DocumentsModule } from './modules/documents/documents.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LeaveModule } from './modules/leave/leave.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';

/**
 * Modular monolith. Each feature module owns its data and exposes a service;
 * modules talk to each other through those services, never through each other's
 * repositories. That boundary is what would let any of these be split out later.
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),

    AuditModule,
    AuthModule,
    HealthModule,

    OrganizationModule,
    EmployeesModule,
    ApprovalsModule,
    LeaveModule,
    AttendanceModule,
    PayrollModule,
    RecruitmentModule,
    PerformanceModule,
    DocumentsModule,
    FilesModule,
    NotificationsModule,
    AssistantModule,
    JobsModule,
  ],
  providers: [
    SequenceService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [SequenceService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
