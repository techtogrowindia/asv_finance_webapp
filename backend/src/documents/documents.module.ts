import { Module } from '@nestjs/common';
import { DocumentFileController, DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController, DocumentFileController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
