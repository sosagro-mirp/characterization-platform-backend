import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ROLES } from '../../auth/constants';
import { CampaignStepsService } from './campaign-steps.service';
import { CreateCampaignStepDto } from './dto/create-campaign-step.dto';
import { UpdateCampaignStepDto } from './dto/update-campaign-step.dto';

@ApiTags('Campaign Steps')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('campaigns/:campaignId/steps')
export class CampaignStepsController {
  constructor(private readonly stepsService: CampaignStepsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar pasos de una campaña' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  findAll(@Param('campaignId', new ParseUUIDPipe()) campaignId: string) {
    return this.stepsService.findAll(campaignId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear paso' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  create(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Body() dto: CreateCampaignStepDto,
  ) {
    return this.stepsService.create(campaignId, dto);
  }

  @Patch(':stepId')
  @ApiOperation({ summary: 'Actualizar paso' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  update(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
    @Body() dto: UpdateCampaignStepDto,
  ) {
    return this.stepsService.update(campaignId, stepId, dto);
  }

  @Delete(':stepId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar paso' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  remove(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
  ) {
    return this.stepsService.remove(campaignId, stepId);
  }
}
