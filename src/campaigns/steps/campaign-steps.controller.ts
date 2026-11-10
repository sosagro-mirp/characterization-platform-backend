import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { campaignsRetired } from '../campaigns-retired';
import { LegacyCampaignUsageInterceptor } from '../legacy-campaign-usage.interceptor';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ROLES } from '../../auth/constants';
import { CampaignStepsService } from './campaign-steps.service';

@ApiTags('Campaign Steps')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@UseInterceptors(LegacyCampaignUsageInterceptor)
@Controller('campaigns/:campaignId/steps')
export class CampaignStepsController {
  constructor(private readonly stepsService: CampaignStepsService) {}

  @Get()
  @ApiOperation({ deprecated: true, summary: 'Listar pasos de una campaña' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  findAll(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.stepsService.findAll(campaignId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear paso', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  create() {
    throw campaignsRetired();
  }

  @Patch(':stepId')
  @ApiOperation({ summary: 'Actualizar paso', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  update() {
    throw campaignsRetired();
  }

  @Delete(':stepId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar paso', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  remove() {
    throw campaignsRetired();
  }
}
