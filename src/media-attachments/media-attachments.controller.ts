import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { CreatePresignedUrlDto } from './dto/create-presigned-url.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';
import { MediaAttachmentResponseDto } from './dto/media-attachment-response.dto';
import { MediaAttachmentsService } from './media-attachments.service';

@ApiTags('Media Attachments')
@ApiBearerAuth()
@Controller()
export class MediaAttachmentsController {
  constructor(
    private readonly mediaAttachmentsService: MediaAttachmentsService,
  ) {}

  @Post('media-attachments/presigned-url')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Solicitar presigned URL para subir un archivo a R2',
  })
  createPresignedUrl(
    @Body() dto: CreatePresignedUrlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaAttachmentsService.createPresignedUrl(dto, user.userId);
  }

  @Patch('media-attachments/:attachmentId/confirm')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({
    summary: 'Confirmar que el archivo fue subido exitosamente a R2',
  })
  confirmUpload(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.mediaAttachmentsService.confirmUpload(attachmentId, dto);
  }

  @Get('media-attachments/:attachmentId/download-url')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary:
      'Emitir una URL firmada de lectura (vida corta) para un archivo multimedia',
  })
  @ApiResponse({ status: 200, type: DownloadUrlResponseDto })
  @ApiResponse({ status: 404, description: 'El adjunto no existe' })
  @ApiResponse({ status: 409, description: 'El adjunto aún no fue subido' })
  getDownloadUrl(
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaAttachmentsService.getDownloadUrl(attachmentId, user);
  }

  @Get('surveys/:surveyId/media-attachments')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar archivos multimedia de un survey' })
  @ApiResponse({ status: 200, type: [MediaAttachmentResponseDto] })
  findBySurvey(@Param('surveyId', ParseUUIDPipe) surveyId: string) {
    return this.mediaAttachmentsService.findBySurvey(surveyId);
  }
}
