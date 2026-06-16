import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { MediaAttachmentsService } from './media-attachments.service';

@ApiTags('Media Attachments')
@ApiBearerAuth()
@Controller()
export class MediaAttachmentsController {
  constructor(private readonly mediaAttachmentsService: MediaAttachmentsService) {}

  @Get('surveys/:surveyId/media-attachments')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar archivos multimedia de un survey' })
  findBySurvey(@Param('surveyId', ParseUUIDPipe) surveyId: string) {
    return this.mediaAttachmentsService.findBySurvey(surveyId);
  }
}
