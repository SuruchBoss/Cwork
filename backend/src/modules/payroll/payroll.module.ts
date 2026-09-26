// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { OrganizationModule } from '../organization/organization.module';
import { BenefitsService } from './benefits.service';
import { CompensationService } from './compensation.service';
import { ExpensesService } from './expenses.service';
import { BenefitsController, ExpensesController, PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

@Module({
  imports: [OrganizationModule],
  controllers: [PayrollController, BenefitsController, ExpensesController],
  providers: [
    PayrollService,
    CompensationService,
    BenefitsService,
    ExpensesService,
    SequenceService,
  ],
  exports: [PayrollService, CompensationService, BenefitsService, ExpensesService],
})
export class PayrollModule {}
