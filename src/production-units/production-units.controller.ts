import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { ExportProductionUnitsDto } from './dto/export-production-units.dto';
import { ProductionUnitsExportService } from './production-units-export.service';
import { ProductionUnitsService } from './production-units.service';

@ApiTags('Production units')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('production-units')
export class ProductionUnitsController {
  constructor(
    private readonly service: ProductionUnitsService,
    private readonly exporter: ProductionUnitsExportService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Unidades productivas con cobertura por instrumento (spec 98)',
    description:
      'Una fila por finca, una columna por instrumento activo con alcance declarado. Sin paginar: se filtra en el cliente.',
  })
  getOverview() {
    return this.service.getOverview();
  }

  @Post('export')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOperation({
    summary: 'Exporta a Excel las fincas filtradas y registra la exportación',
  })
  async export(
    @Body() dto: ExportProductionUnitsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer } = await this.exporter.export(dto.farmIds, dto.filters, {
      userId: user.userId,
      email: user.email,
    });
    return new StreamableFile(buffer);
  }

  @Get('exports')
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Registro de exportaciones (solo ADMIN)' })
  listExports() {
    return this.exporter.listLogs();
  }

  @Get(':farmId/coverage')
  @ApiOperation({ summary: 'Cobertura de una finca por instrumento' })
  getFarmCoverage(@Param('farmId', new ParseUUIDPipe()) farmId: string) {
    return this.service.getFarmCoverage(farmId);
  }
}
