import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { PublicCareersController, RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  controllers: [RecruitmentController, PublicCareersController],
  providers: [RecruitmentService, SequenceService],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
