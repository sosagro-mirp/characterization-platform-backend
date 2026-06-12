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
import { StepConditionsService } from './step-conditions.service';
import { CreateStepConditionDto } from './dto/create-step-condition.dto';
import { UpdateStepConditionDto } from './dto/update-step-condition.dto';

@ApiTags('Step Conditions')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
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
  @ApiOperation({ summary: 'Crear condición en un paso' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  create(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
    @Body() dto: CreateStepConditionDto,
  ) {
    return this.conditionsService.create(campaignId, stepId, dto);
  }

  @Patch(':conditionId')
  @ApiOperation({ summary: 'Actualizar condición' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  @ApiParam({ name: 'conditionId', format: 'uuid' })
  update(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
    @Param('conditionId', new ParseUUIDPipe()) conditionId: string,
    @Body() dto: UpdateStepConditionDto,
  ) {
    return this.conditionsService.update(campaignId, stepId, conditionId, dto);
  }

  @Delete(':conditionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar condición' })
  @ApiParam({ name: 'campaignId', format: 'uuid' })
  @ApiParam({ name: 'stepId', format: 'uuid' })
  @ApiParam({ name: 'conditionId', format: 'uuid' })
  remove(
    @Param('campaignId', new ParseUUIDPipe()) campaignId: string,
    @Param('stepId', new ParseUUIDPipe()) stepId: string,
    @Param('conditionId', new ParseUUIDPipe()) conditionId: string,
  ) {
    return this.conditionsService.remove(campaignId, stepId, conditionId);
  }
}
