import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ROLES } from '../../auth/constants';
import {
  isSelectable,
  SYSTEM_FIELDS,
  SystemFieldDef,
} from './system-field-registry';

@ApiTags('System fields')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('system-fields')
export class SystemFieldsController {
  @Get()
  @ApiOperation({
    summary: 'Catálogo de destinos de datos (Spec 97)',
    description:
      'Lista los destinos `entidad.campo` que puede tener una pregunta. Por ' +
      'defecto solo los seleccionables (`active` y `noSource`); con ' +
      '`all=true` incluye también los `legacy`. Los alias aparecen en la ' +
      '`aliases` de su clave canónica, no como entradas propias.',
  })
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Catálogo de destinos.' })
  findAll(@Query('all') all?: string): SystemFieldDef[] {
    const includeLegacy = all === 'true';
    return SYSTEM_FIELDS.filter((def) => includeLegacy || isSelectable(def));
  }
}
