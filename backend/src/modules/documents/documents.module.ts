import { Module } from '@nestjs/common';
import { SequenceService } from '../../core/utils/sequence.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, SequenceService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
