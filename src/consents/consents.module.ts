import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentDocument } from './entities/consent-document.entity';
import { ConsentRecord } from './entities/consent-record.entity';
import { ConsentDocumentsController } from './consent-documents.controller';
import { ConsentDocumentsService } from './consent-documents.service';
import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsentDocument, ConsentRecord])],
  controllers: [ConsentDocumentsController, ConsentRecordsController],
  providers: [ConsentDocumentsService, ConsentRecordsService],
  exports: [ConsentDocumentsService, ConsentRecordsService],
})
export class ConsentsModule {}
