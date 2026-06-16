import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import { MediaAttachment } from './entities/media-attachment.entity';
import { MediaAttachmentsController } from './media-attachments.controller';
import { MediaAttachmentsService } from './media-attachments.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAttachment, Survey, Question, Response, User])],
  controllers: [MediaAttachmentsController],
  providers: [MediaAttachmentsService],
  exports: [MediaAttachmentsService],
})
export class MediaAttachmentsModule {}
