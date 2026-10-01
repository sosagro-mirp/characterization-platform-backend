import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import { StorageModule } from 'src/storage/storage.module';
import { MediaAttachment } from './entities/media-attachment.entity';
import { MediaDeletionQueue } from './entities/media-deletion-queue.entity';
import { MediaAttachmentsController } from './media-attachments.controller';
import { MediaAttachmentsService } from './media-attachments.service';
import { MediaCleanupService } from './media-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MediaAttachment,
      MediaDeletionQueue,
      Survey,
      Question,
      Response,
      User,
    ]),
    StorageModule,
  ],
  controllers: [MediaAttachmentsController],
  providers: [MediaAttachmentsService, MediaCleanupService],
  exports: [MediaAttachmentsService, MediaCleanupService],
})
export class MediaAttachmentsModule {}
