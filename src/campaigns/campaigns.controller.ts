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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { campaignsRetired } from './campaigns-retired';
import { LegacyCampaignUsageInterceptor } from './legacy-campaign-usage.interceptor';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { Public } from '../auth/decorators/public.decorator';
import { CampaignsService } from './campaigns.service';

@ApiTags('Campaigns')
@UseInterceptors(LegacyCampaignUsageInterceptor)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Crear campaña', deprecated: true })
  @ApiResponse({ status: 201, description: 'Campaña creada.' })
  create() {
    throw campaignsRetired();
  }

  @Get()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    deprecated: true,
    summary: 'Listar todas las campañas (administración)',
  })
  findAll() {
    return this.campaignsService.findAll();
  }

  @Public()
  @Get('active')
  @ApiOperation({
    deprecated: true,
    summary: 'Listar campañas activas',
    description: 'Endpoint público consumido por la PWA del encuestador.',
  })
  findActive() {
    return this.campaignsService.findActive();
  }

  @Public()
  @Get(':id/render')
  @ApiOperation({
    deprecated: true,
    summary: 'Estructura completa de la campaña',
    description:
      'Retorna la campaña con sus pasos (orden, condición, instrumento ' +
      'resumido). Endpoint público para cacheo offline.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOneForRender(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.findOneForRender(id);
  }

  @Get(':id/sessions-summary')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    deprecated: true,
    summary: 'Resumen de sesiones de una campaña',
    description:
      'Retorna el número de sesiones asociadas. Usar antes de eliminar para mostrar advertencia al usuario.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  getSessionsSummary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.getSessionsSummary(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ deprecated: true, summary: 'Detalle de campaña con pasos' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Actualizar metadatos de campaña',
    deprecated: true,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  update() {
    throw campaignsRetired();
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar campaña', deprecated: true })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove() {
    throw campaignsRetired();
  }
}
