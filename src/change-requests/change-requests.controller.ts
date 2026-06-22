import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChangeRequestsService } from './change-requests.service';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { ListChangeRequestsQueryDto } from './dto/list-change-requests-query.dto';
import { ResolvedSinceQueryDto } from './dto/resolved-since-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';

@ApiTags('Change Requests')
@Controller('change-requests')
export class ChangeRequestsController {
  constructor(private readonly service: ChangeRequestsService) {}

  @Post()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Crear solicitud de cambio (ticket)' })
  @ApiResponse({ status: 201, description: 'Ticket creado.' })
  @ApiResponse({ status: 200, description: 'Ticket ya existía (idempotencia por localId).' })
  @ApiResponse({ status: 400, description: 'Faltan category (web) o localId (mobile).' })
  @ApiResponse({ status: 404, description: 'Usuario o agricultor no encontrado.' })
  create(
    @Body() dto: CreateChangeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Listar todos los tickets con filtros opcionales' })
  @ApiResponse({ status: 200, description: 'Listado de solicitudes.' })
  findAll(@Query() query: ListChangeRequestsQueryDto) {
    return this.service.findAll(query);
  }

  @Get('my-resolved')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'Mis solicitudes resueltas (usado por mobile en sync)' })
  @ApiResponse({ status: 200, description: 'Solicitudes propias resueltas.' })
  myResolved(
    @Query() query: ResolvedSinceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.myResolved(user.userId, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Detalle de una solicitud de cambio' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/resolve')
  @ApiBearerAuth()
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Marcar solicitud como resuelta' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Solicitud resuelta.' })
  @ApiResponse({ status: 400, description: 'Ya estaba resuelta.' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada.' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.resolve(id, user.userId);
  }
}
