import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ROLES } from '../auth/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DiscrepanciesService } from './discrepancies.service';
import {
  ListDiscrepanciesQueryDto,
  ListFarmerDiscrepanciesQueryDto,
  ResolveDiscrepancyDto,
} from './dto/discrepancy.dto';

@ApiTags('Discrepancies')
@ApiBearerAuth()
@Controller()
export class DiscrepanciesController {
  constructor(private readonly discrepancies: DiscrepanciesService) {}

  @Get('farmers/:farmerId/discrepancies')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Discrepancias de un productor',
    description:
      'Spec 95: valores que una encuesta trajo distintos a los ya guardados del productor o de sus fincas. ' +
      'La extracción nunca los sobrescribe. Solo ADMIN y RESEARCHER.',
  })
  @ApiParam({ name: 'farmerId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Lista de discrepancias.' })
  @ApiResponse({ status: 403, description: 'Rol sin acceso.' })
  listForFarmer(
    @Param('farmerId', ParseUUIDPipe) farmerId: string,
    @Query() query: ListFarmerDiscrepanciesQueryDto,
  ) {
    return this.discrepancies.listForFarmer(farmerId, query.status);
  }

  @Get('discrepancies')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Listar discrepancias (paginado)',
    description:
      'Spec 95: todas las discrepancias, filtrables por `status` y `entityType`. Solo ADMIN y RESEARCHER.',
  })
  @ApiResponse({ status: 200, description: '{ items, total, page, limit }' })
  @ApiResponse({ status: 403, description: 'Rol sin acceso.' })
  list(@Query() query: ListDiscrepanciesQueryDto) {
    return this.discrepancies.list(query);
  }

  @Patch('discrepancies/:id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Aplicar o descartar una discrepancia',
    description:
      'Spec 95: `apply` sobrescribe el valor en el productor o la finca (en una transacción) y marca `applied`; ' +
      '`dismiss` no toca la entidad y marca `dismissed`. Solo ADMIN y RESEARCHER.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Discrepancia resuelta.' })
  @ApiResponse({ status: 404, description: 'Discrepancia no encontrada.' })
  @ApiResponse({ status: 409, description: 'Ya estaba resuelta.' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.discrepancies.resolve(id, dto.action, user.userId);
  }
}
