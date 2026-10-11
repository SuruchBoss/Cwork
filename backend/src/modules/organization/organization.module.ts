// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { UserRolesController } from './user-roles.controller';
import { UserRolesService } from './user-roles.service';
import { WorkCalendarService } from './work-calendar.service';

@Module({
  controllers: [OrganizationController, UserRolesController],
  providers: [OrganizationService, UserRolesService, WorkCalendarService],
  exports: [OrganizationService, WorkCalendarService],
})
export class OrganizationModule {}
