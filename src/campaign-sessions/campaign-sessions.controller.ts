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
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { CampaignSessionsService } from './campaign-sessions.service';
import { CreateCampaignSessionDto } from './dto/create-campaign-session.dto';

@ApiTags('Campaign Sessions')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
@Controller('campaign-sessions')
export class CampaignSessionsController {
  constructor(private readonly sessionsService: CampaignSessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Iniciar sesión de campaña' })
  @ApiResponse({ status: 201, description: 'Sesión creada.' })
  create(
    @Body() dto: CreateCampaignSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionsService.create({ ...dto, userId: user.userId });
  }

  @Get('last-farmer')
  @ApiOperation({
    summary: 'Último agricultor encuestado por el usuario autenticado',
    description:
      'Retorna el farmer vinculado a la sesión más reciente del usuario que tenga farmer asignado, o null si no existe.',
  })
  @ApiResponse({ status: 200, description: '{ farmerId, name, lastName, farm? } | null' })
  async getLastFarmer(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionsService.getLastFarmer(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de sesión con surveys aplicados' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessionsService.findOne(id);
  }

  @Get(':id/next-step')
  @ApiOperation({
    summary: 'Calcular próximo paso de la campaña',
    description:
      'Evalúa condiciones contra respuestas previas y retorna el paso ' +
      'siguiente o null si la campaña terminó.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  async getNextStep(@Param('id', new ParseUUIDPipe()) id: string) {
    const next = await this.sessionsService.getNextStep(id);
    return next ?? { nextStep: null };
  }

  @Patch(':id/sync')
  @ApiOperation({ summary: 'Marcar sesión como sincronizada' })
  @ApiParam({ name: 'id', format: 'uuid' })
  markAsSynchronized(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessionsService.markAsSynchronized(id);
  }
}
