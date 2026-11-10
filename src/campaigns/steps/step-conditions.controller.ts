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
import { StepConditionsService } from './step-conditions.service';

@ApiTags('Step Conditions')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@UseInterceptors(LegacyCampaignUsageInterceptor)
@Controller('campaigns/:campaignId/steps/:stepId/conditions')
export class StepConditionsController {
  constructor(private readonly conditionsService: StepConditionsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar condiciones de un paso' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  findAll(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
  ) {
    return this.conditionsService.findAll(campaignId, stepId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear condición en un paso', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  create() {
    throw campaignsRetired();
  }

  @Patch(':conditionId')
  @ApiOperation({ summary: 'Actualizar condición', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  @ApiParam({ name: 'conditionId', format: 'uuid' })
  update() {
    throw campaignsRetired();
  }

  @Delete(':conditionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar condición', deprecated: true })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  @ApiParam({ name: 'conditionId', format: 'uuid' })
  remove() {
    throw campaignsRetired();
  }
}
