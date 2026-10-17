// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../core/security/current-user';
import { RequirePermissions } from '../../core/security/decorators';
import { Permission } from '../../core/security/permissions';
import { IMPORT_BODY, IMPORT_LIMITS, requireUpload } from '../../core/spreadsheet/upload';
import { BindScannerNumberDto, DecideScannerDayDto, ScannerDaysQueryDto } from './dto/scanner.dto';
import { ScannerImportService } from './scanner-import.service';

/**
 * Taking in a fingerprint scanner's export, and the review page HR works from
 * (CW-061). All of it is for people who manage attendance: the export covers the
 * whole company, and the review page shows names against times.
 */
@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance/scanner')
export class ScannerController {
  constructor(private readonly scanner: ScannerImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: "Check a fingerprint scanner's export without importing it",
    description:
      'Reads the file the scanner wrote (text with a byte-order mark, whatever it is called) and says what each day is, which scanner numbers nobody has registered, and how many punches it would add. Writes nothing.',
  })
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.scanner.preview(user, requireUpload(file));
  }

  @Post('import')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: IMPORT_LIMITS }))
  @ApiConsumes('multipart/form-data')
  @ApiBody(IMPORT_BODY)
  @ApiOperation({
    summary: "Import a fingerprint scanner's export (CW-061)",
    description:
      'Keeps every day as the scanner wrote it and adds the punches that count, once each: an overlapping file adds only what is new. A file with any problem is refused with 422 and nothing is written. Audited as one event.',
  })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.scanner.commit(user, requireUpload(file));
  }

  @Get('imports')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({ summary: 'The scanner files imported so far' })
  imports(@CurrentUser() user: AuthenticatedUser) {
    return this.scanner.imports(user);
  }

  @Get('days')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({
    summary: 'Scanner days for review, with totals that follow what HR decides',
    description:
      'Every raw day stays listed under `status=ALL`; `WAITING` (the default) is the days that need HR.',
  })
  days(@CurrentUser() user: AuthenticatedUser, @Query() query: ScannerDaysQueryDto) {
    return this.scanner.days(user, query);
  }

  @Get('days/:id')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({ summary: 'One scanner day, with every decision made about it' })
  day(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.scanner.day(user, id);
  }

  @Post('days/:id/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({
    summary: 'Decide a scanner day: use some of its times, or do not count it',
    description:
      "Adds to the day's history rather than replacing it. The times used are picked among the ones the scanner recorded.",
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideScannerDayDto,
  ) {
    return this.scanner.decide(user, id, dto);
  }

  @Get('unmapped')
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({ summary: 'Scanner numbers that belong to no employee, with their days' })
  unmapped(@CurrentUser() user: AuthenticatedUser) {
    return this.scanner.unmapped(user);
  }

  @Post('unmapped/bind')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({
    summary: 'Register a scanner number on an employee',
    description:
      "Sets the employee's scanner ID and counts the days that were waiting on the number.",
  })
  bind(@CurrentUser() user: AuthenticatedUser, @Body() dto: BindScannerNumberDto) {
    return this.scanner.bind(user, dto);
  }

  @Post('rematch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ATTENDANCE_MANAGE)
  @ApiOperation({ summary: 'Match days of unregistered numbers against the employees now' })
  rematch(@CurrentUser() user: AuthenticatedUser) {
    return this.scanner.rematch(user);
  }
}
