import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ROLES } from '../auth/constants';
import { Roles } from '../auth/decorators/roles.decorator';
import { FarmerCoverageService } from './farmer-coverage.service';

@ApiTags('Coverage')
@ApiBearerAuth()
// Spec 102 — el encuestador consulta la cobertura desde el flujo por productor.
@Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
@Controller()
export class FarmerCoverageController {
  constructor(private readonly service: FarmerCoverageService) {}

  @Get('farmers/:farmerId/coverage')
  @ApiOperation({
    summary: 'Cobertura de instrumentos de un productor (spec 100)',
    description:
      'Estado por instrumento (aplicado, parcial, falta, no aplica) con el detalle por unidad: productor, fincas y cultivos. Calculado al leer; no incluye documento, teléfono ni correo.',
  })
  getDetail(@Param('farmerId', new ParseUUIDPipe()) farmerId: string) {
    return this.service.getDetail(farmerId);
  }

  @Get('coverage/farmers')
  @ApiOperation({
    summary: 'Cobertura resumida de todos los productores (spec 100)',
    description:
      'Una fila por productor, sin paginar: se filtra en el cliente. Con API key, `documentId` llega en null.',
  })
  getList(@Req() req: { apiKey?: unknown }) {
    return this.service.getList(Boolean(req.apiKey));
  }

  @Get('coverage/farmers/snapshot')
  @ApiOperation({
    summary: 'Foto de cobertura para la caché offline del móvil (spec 103)',
    description:
      'Ficha compacta de todos los productores: fincas con rol y municipio, cultivos y cobertura por instrumento con unidades. Sin teléfono, correo ni coordenadas. Con API key, `documentId` llega en null.',
  })
  getSnapshot(@Req() req: { apiKey?: unknown }) {
    return this.service.getSnapshot(Boolean(req.apiKey));
  }
}
