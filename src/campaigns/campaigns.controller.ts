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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@ApiTags('Campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Crear campaña' })
  @ApiResponse({ status: 201, description: 'Campaña creada.' })
  create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.create(dto, user?.userId);
  }

  @Get()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Listar todas las campañas (administración)' })
  findAll() {
    return this.campaignsService.findAll();
  }

  @Public()
  @Get('active')
  @ApiOperation({
    summary: 'Listar campañas activas',
    description: 'Endpoint público consumido por la PWA del encuestador.',
  })
  findActive() {
    return this.campaignsService.findActive();
  }

  @Public()
  @Get(':id/render')
  @ApiOperation({
    summary: 'Estructura completa de la campaña',
    description:
      'Retorna la campaña con sus pasos (orden, condición, instrumento ' +
      'resumido). Endpoint público para cacheo offline.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOneForRender(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Get(':id/sessions-summary')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Resumen de sesiones de una campaña',
    description: 'Retorna el número de sesiones asociadas. Usar antes de eliminar para mostrar advertencia al usuario.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  getSessionsSummary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.getSessionsSummary(id);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Detalle de campaña con pasos' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Actualizar metadatos de campaña' })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaignsService.update(id, dto, user?.userId);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar campaña' })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaignsService.remove(id);
  }
}
