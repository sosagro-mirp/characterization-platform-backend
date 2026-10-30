import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtOnly } from '../auth/decorators/jwt-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { ExportSelectionDto } from './dto/export-selection.dto';
import { SetSelectionDto } from './dto/set-selection.dto';
import { UnitSelectionsExportService } from './unit-selections-export.service';
import { UnitSelectionsService } from './unit-selections.service';

@ApiTags('Unit selections')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('unit-selections')
export class UnitSelectionsController {
  constructor(
    private readonly service: UnitSelectionsService,
    private readonly exporter: UnitSelectionsExportService,
  ) {}

  // `summary` y `export` van antes de `:farmId` para que no los capture.
  @Get('summary')
  @ApiOperation({
    summary:
      'Conteos de la selección por estado, cultivo y departamento (spec 99)',
  })
  summary() {
    return this.service.summary();
  }

  @Post('export')
  @JwtOnly()
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOperation({
    summary: 'Excel del resultado de la selección; registra la exportación',
  })
  async export(
    @Body() dto: ExportSelectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { buffer } = await this.exporter.export(dto.filters ?? {}, {
      userId: user.userId,
      email: user.email,
    });
    return new StreamableFile(buffer);
  }

  @Put(':farmId')
  @JwtOnly()
  @ApiOperation({
    summary: 'Registra la decisión sobre una finca (409 si cambió la versión)',
  })
  set(
    @Param('farmId', new ParseUUIDPipe()) farmId: string,
    @Body() dto: SetSelectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.set(farmId, dto, { userId: user.userId });
  }

  @Get(':farmId/history')
  @ApiOperation({
    summary: 'Historial de decisiones, del más reciente al más antiguo',
  })
  history(@Param('farmId', new ParseUUIDPipe()) farmId: string) {
    return this.service.history(farmId);
  }
}
