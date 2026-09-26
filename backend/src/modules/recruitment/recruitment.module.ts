// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { ApplicationsService } from './applications.service';
import { AssessmentsService } from './assessments.service';
import { InterviewsService } from './interviews.service';
import { OffersService } from './offers.service';
import { PublicCareersController, RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  controllers: [RecruitmentController, PublicCareersController],
  providers: [
    RecruitmentService,
    ApplicationsService,
    AssessmentsService,
    InterviewsService,
    OffersService,
    SequenceService,
  ],
  // Only the candidate side is wanted elsewhere: the nightly PDPA purge.
  exports: [RecruitmentService, ApplicationsService],
})
export class RecruitmentModule {}
