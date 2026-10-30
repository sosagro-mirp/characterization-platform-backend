import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { ProductionUnitsService } from './production-units.service';

@ApiTags('Production units')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('production-units')
export class ProductionUnitsController {
  constructor(private readonly service: ProductionUnitsService) {}

  @Get()
  @ApiOperation({
    summary: 'Unidades productivas con cobertura por instrumento (spec 98)',
    description:
      'Una fila por finca, una columna por instrumento activo con alcance declarado. Sin paginar: se filtra en el cliente.',
  })
  getOverview() {
    return this.service.getOverview();
  }

  @Get(':farmId/coverage')
  @ApiOperation({ summary: 'Cobertura de una finca por instrumento' })
  getFarmCoverage(@Param('farmId', new ParseUUIDPipe()) farmId: string) {
    return this.service.getFarmCoverage(farmId);
  }
}
