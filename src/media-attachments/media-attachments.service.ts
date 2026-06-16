import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAttachment } from './entities/media-attachment.entity';

@Injectable()
export class MediaAttachmentsService {
  constructor(
    @InjectRepository(MediaAttachment)
    private readonly mediaAttachmentRepository: Repository<MediaAttachment>,
  ) {}

  findBySurvey(surveyId: string): Promise<MediaAttachment[]> {
    return this.mediaAttachmentRepository.find({
      where: { survey: { surveyId } },
      relations: ['question'],
      order: { createdAt: 'ASC' },
    });
  }
}
