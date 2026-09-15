import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, PostingStatus, RequisitionStatus } from '@prisma/client';
import { Audited } from '../../core/http/audit.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { Public, RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { requireEmployeeId } from '../employees/domain/employee-access';
import {
  ApplicationQueryDto,
  ApplyDto,
  CreateAssessmentTemplateDto,
  CreateOfferDto,
  CreatePostingDto,
  CreateRequisitionDto,
  InviteAssessmentDto,
  MoveStageDto,
  ScheduleInterviewDto,
  SubmitAssessmentDto,
  SubmitScorecardDto,
  UpdatePostingStatusDto,
} from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('Recruitment')
@ApiBearerAuth()
@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  // -------------------------------------------------------------- requisitions

  @Get('requisitions')
  @RequirePermissions(Permission.RECRUITMENT_READ)
  @ApiOperation({ summary: 'List headcount requisitions' })
  listRequisitions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: RequisitionStatus,
  ) {
    return this.recruitment.listRequisitions(user.organizationId, status);
  }

  @Post('requisitions')
  @RequirePermissions(Permission.RECRUITMENT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'JobRequisition' })
  @ApiOperation({ summary: 'Raise a headcount requisition' })
  createRequisition(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRequisitionDto) {
    return this.recruitment.createRequisition(user, dto);
  }

  // ------------------------------------------------------------------ postings

  @Get('postings')
  @RequirePermissions(Permission.RECRUITMENT_READ)
  @ApiOperation({ summary: 'List job postings' })
  listPostings(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: PostingStatus) {
    return this.recruitment.listPostings(user.organizationId, status);
  }

  @Post('postings')
  @RequirePermissions(Permission.RECRUITMENT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'JobPosting' })
  @ApiOperation({ summary: 'Create a job posting' })
  createPosting(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePostingDto) {
    return this.recruitment.createPosting(user.organizationId, dto);
  }

  @Patch('postings/:id/status')
  @RequirePermissions(Permission.RECRUITMENT_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'JobPosting' })
  @ApiOperation({ summary: 'Publish, pause or close a posting' })
  updatePostingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostingStatusDto,
  ) {
    return this.recruitment.updatePostingStatus(user.organizationId, id, dto.status);
  }

  // -------------------------------------------------------------- applications

  @Get('applications')
  @RequirePermissions(Permission.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Applicant pipeline' })
  listApplications(@CurrentUser() user: AuthenticatedUser, @Query() query: ApplicationQueryDto) {
    return this.recruitment.listApplications(user.organizationId, query);
  }

  @Get('applications/:id')
  @RequirePermissions(Permission.RECRUITMENT_READ)
  @ApiOperation({ summary: 'Application detail with assessments and interviews' })
  getApplication(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruitment.getApplication(user.organizationId, id);
  }

  @Post('applications/:id/stage')
  @RequirePermissions(Permission.RECRUITMENT_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'Application' })
  @ApiOperation({ summary: 'Move a candidate to another pipeline stage' })
  moveStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveStageDto,
  ) {
    return this.recruitment.moveStage(user, id, dto);
  }

  // --------------------------------------------------------------- assessments

  @Get('assessment-templates')
  @RequirePermissions(Permission.RECRUITMENT_READ)
  @ApiOperation({ summary: 'List assessment templates' })
  listTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.recruitment.listTemplates(user.organizationId);
  }

  @Post('assessment-templates')
  @RequirePermissions(Permission.ASSESSMENT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'AssessmentTemplate' })
  @ApiOperation({ summary: 'Create an assessment with its questions' })
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAssessmentTemplateDto) {
    return this.recruitment.createTemplate(user.organizationId, dto);
  }

  @Post('assessments/invite')
  @RequirePermissions(Permission.ASSESSMENT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'AssessmentInvitation' })
  @ApiOperation({
    summary: 'Invite a candidate to sit an assessment',
    description: 'The returned token is shown once and stored only as a hash.',
  })
  invite(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteAssessmentDto) {
    return this.recruitment.inviteToAssessment(user.organizationId, dto);
  }

  // ---------------------------------------------------------------- interviews

  @Post('interviews')
  @RequirePermissions(Permission.RECRUITMENT_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Interview' })
  @ApiOperation({ summary: 'Schedule an interview' })
  scheduleInterview(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScheduleInterviewDto) {
    return this.recruitment.scheduleInterview(user.organizationId, dto);
  }

  @Get('interviews/mine')
  @RequirePermissions(Permission.INTERVIEW_CONDUCT)
  @ApiOperation({ summary: 'Interviews I am scheduled to conduct' })
  myInterviews(@CurrentUser() user: AuthenticatedUser) {
    return this.recruitment.listMyInterviews(requireEmployeeId(user));
  }

  @Post('interviews/:id/scorecard')
  @RequirePermissions(Permission.INTERVIEW_CONDUCT)
  @Audited({ action: AuditAction.CREATE, entityType: 'InterviewScorecard' })
  @ApiOperation({ summary: 'Submit my interview scorecard' })
  submitScorecard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitScorecardDto,
  ) {
    return this.recruitment.submitScorecard(user, id, dto);
  }

  // -------------------------------------------------------------------- offers

  @Post('offers')
  @RequirePermissions(Permission.OFFER_MANAGE)
  @Audited({ action: AuditAction.CREATE, entityType: 'JobOffer' })
  @ApiOperation({ summary: 'Create a job offer' })
  createOffer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOfferDto) {
    return this.recruitment.createOffer(user.organizationId, dto);
  }

  @Post('offers/:id/respond')
  @RequirePermissions(Permission.OFFER_MANAGE)
  @Audited({ action: AuditAction.UPDATE, entityType: 'JobOffer' })
  @ApiOperation({ summary: 'Record the candidate’s response to an offer' })
  respondToOffer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { accepted: boolean; reason?: string },
  ) {
    return this.recruitment.respondToOffer(user.organizationId, id, body.accepted, body.reason);
  }

  @Post('offers/:id/convert')
  @RequirePermissions(Permission.EMPLOYEE_CREATE)
  @Audited({ action: AuditAction.CREATE, entityType: 'Employee', summary: 'Hired from offer' })
  @ApiOperation({ summary: 'Turn an accepted offer into an employee record' })
  convert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { employeeCode?: string },
  ) {
    return this.recruitment.convertToEmployee(user, id, body?.employeeCode);
  }
}

/**
 * Unauthenticated careers-page endpoints.
 *
 * Everything here is rate-limited and returns only what a public visitor should
 * see — never internal ids, pipeline state, or other candidates.
 */
@ApiTags('Careers (public)')
@Controller('careers')
export class PublicCareersController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Public()
  @Get(':orgCode/jobs')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Published job openings' })
  listJobs(@Param('orgCode') orgCode: string) {
    return this.recruitment.listPublicPostings(orgCode);
  }

  @Public()
  @Get(':orgCode/jobs/:slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Job posting detail' })
  getJob(@Param('orgCode') orgCode: string, @Param('slug') slug: string) {
    return this.recruitment.getPublicPosting(orgCode, slug);
  }

  @Public()
  @Post(':orgCode/jobs/:slug/apply')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Apply for a job (PDPA consent required)' })
  apply(@Param('orgCode') orgCode: string, @Param('slug') slug: string, @Body() dto: ApplyDto) {
    return this.recruitment.apply(orgCode, slug, dto);
  }

  @Public()
  @Get('assessments/:token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open an assessment with a single-use token' })
  startAssessment(@Param('token') token: string) {
    return this.recruitment.startAssessment(token);
  }

  @Public()
  @Post('assessments/submit')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit assessment answers' })
  submitAssessment(@Body() dto: SubmitAssessmentDto) {
    return this.recruitment.submitAssessment(dto);
  }
}
