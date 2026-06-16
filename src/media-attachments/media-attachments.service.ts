import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Question } from 'src/questions/entities/question.entity';
import { Survey } from 'src/surveys/entities/survey.entity';
import { User } from 'src/users/entities/user.entity';
import { StorageService } from 'src/storage/storage.service';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreatePresignedUrlDto } from './dto/create-presigned-url.dto';
import { MediaAttachment, MediaAttachmentStatus } from './entities/media-attachment.entity';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
};

@Injectable()
export class MediaAttachmentsService {
  constructor(
    @InjectRepository(MediaAttachment)
    private readonly attachmentRepository: Repository<MediaAttachment>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storageService: StorageService,
  ) {}

  async createPresignedUrl(
    dto: CreatePresignedUrlDto,
    userId: string,
  ): Promise<{ attachmentId: string; presignedUrl: string; storageKey: string; expiresAt: string }> {
    const survey = await this.surveyRepository.findOne({
      where: { surveyId: dto.surveyId },
    });
    if (!survey) throw new NotFoundException('Survey not found');

    const question = await this.questionRepository.findOne({
      where: { questionId: dto.questionId },
    });
    if (!question) throw new NotFoundException('Question not found');

    const user = await this.userRepository.findOne({ where: { userId } });

    const ext = MIME_TO_EXT[dto.mimeType] ?? 'bin';
    const fileId = randomUUID();
    const storageKey = `surveys/${dto.surveyId}/questions/${dto.questionId}/${fileId}.${ext}`;

    const presignedUrl = await this.storageService.generatePresignedUploadUrl(
      storageKey,
      dto.mimeType,
    );

    const attachment = this.attachmentRepository.create({
      survey,
      question,
      storageKey,
      mimeType: dto.mimeType,
      fileSizeBytes: dto.fileSizeBytes,
      originalFilename: dto.originalFilename,
      status: MediaAttachmentStatus.PENDING,
      createdBy: user ?? undefined,
    });

    const saved = await this.attachmentRepository.save(attachment);

    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

    return {
      attachmentId: saved.attachmentId,
      presignedUrl,
      storageKey,
      expiresAt,
    };
  }

  async confirmUpload(
    attachmentId: string,
    dto: ConfirmUploadDto,
  ): Promise<{ attachmentId: string; publicUrl: string }> {
    const attachment = await this.attachmentRepository.findOne({
      where: { attachmentId },
    });

    if (!attachment) throw new NotFoundException('Media attachment not found');

    if (attachment.status === MediaAttachmentStatus.UPLOADED) {
      return { attachmentId, publicUrl: attachment.publicUrl! };
    }

    if (attachment.status === MediaAttachmentStatus.FAILED) {
      throw new BadRequestException('Upload previously marked as failed');
    }

    const publicUrl = this.storageService.buildPublicUrl(attachment.storageKey);

    attachment.status = MediaAttachmentStatus.UPLOADED;
    attachment.publicUrl = publicUrl;
    if (dto.actualFileSizeBytes) {
      attachment.fileSizeBytes = dto.actualFileSizeBytes;
    }

    await this.attachmentRepository.save(attachment);

    return { attachmentId, publicUrl };
  }

  findBySurvey(surveyId: string): Promise<MediaAttachment[]> {
    return this.attachmentRepository.find({
      where: { survey: { surveyId } },
      relations: ['question'],
      order: { createdAt: 'ASC' },
    });
  }
}
