import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../auth/constants';
import { FarmersService } from './farmers.service';
import { CreateFarmerDto } from './dto/create-farmer.dto';
import { UpdateFarmerDto } from './dto/update-farmer.dto';

@ApiTags('Farmers')
@ApiBearerAuth()
@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmersService: FarmersService) {}

  @Post()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Create a farmer' })
  @ApiResponse({ status: 201, description: 'Farmer created.' })
  @ApiResponse({ status: 400, description: 'Invalid input.' })
  create(@Body() createFarmerDto: CreateFarmerDto) {
    return this.farmersService.create(createFarmerDto);
  }

  @Get('search')
  @Public()
  @ApiOperation({ summary: 'Search farmers by name or document ID' })
  @ApiQuery({ name: 'q', description: 'Search term', required: true })
  @ApiResponse({
    status: 200,
    description: 'List of matching farmers (max 10).',
  })
  search(@Query('q') q: string) {
    return this.farmersService.search(q ?? '');
  }

  @Get()
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER, ROLES.POLLSTER)
  @ApiOperation({ summary: 'List all farmers' })
  @ApiResponse({ status: 200, description: 'List of farmers.' })
  findAll() {
    return this.farmersService.findAll();
  }

  // Declarado antes de `@Get(':id')` — igual que `search` — para que
  // `ParseUUIDPipe` no intente parsear "document-collisions" como un uuid.
  @Get('document-collisions')
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Listar colisiones de documentId detectadas (spec 68)',
    description:
      'Colisiones de documentId entre agricultores distintos detectadas por ' +
      'POST /api/surveys/:id/extract-farmer, resueltas o pendientes, para revisión administrativa.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Array de { collisionId, documentId, submittedName, existingFarmer: { farmerId, name }, ' +
      'surveyId, resolution, createdAt, resolvedAt }. `surveyId` es la encuesta (S1a) que ' +
      'disparó la detección; puede ser null solo si esa encuesta ya no existe.',
  })
  listDocumentCollisions() {
    return this.farmersService.listDocumentCollisions();
  }

  @Get(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Get farmer by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Farmer found.' })
  @ApiResponse({ status: 404, description: 'Farmer not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmersService.findOne(id);
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({ summary: 'Update farmer' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Farmer updated.' })
  @ApiResponse({ status: 404, description: 'Farmer not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFarmerDto: UpdateFarmerDto,
  ) {
    return this.farmersService.update(id, updateFarmerDto);
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN)
  @ApiOperation({ summary: 'Delete farmer' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Farmer deleted.' })
  @ApiResponse({ status: 404, description: 'Farmer not found.' })
  @ApiResponse({
    status: 409,
    description:
      'Farmer has related records (campaign sessions and/or surveys) and cannot be deleted.',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmersService.remove(id);
  }

  // Spec 73 — borrado en cascada. Restringido a ADMIN, igual que `remove()`.
  @Get(':id/deletion-preview')
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary: 'Previsualizar el borrado en cascada de un agricultor (spec 73)',
    description:
      'Inventario de solo lectura de lo que se borraría con DELETE /:id/cascade: ' +
      'fincas, sesiones de campaña, encuestas, respuestas, colisiones de documentId ' +
      'y relaciones M:M. No modifica nada.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Inventario de borrado.' })
  @ApiResponse({ status: 404, description: 'Farmer not found.' })
  getDeletionPreview(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmersService.getDeletionPreview(id);
  }

  @Delete(':id/cascade')
  @Roles(ROLES.ADMIN)
  @ApiOperation({
    summary:
      'Borrar un agricultor en cascada, con sus datos derivados (spec 73)',
    description:
      'Borra en una transacción al agricultor, sus encuestas y respuestas, sus ' +
      'sesiones de campaña, colisiones de documentId y relaciones M:M. Borra ' +
      'también su finca, salvo que otro agricultor la comparta. Irreversible.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Agricultor y sus datos derivados eliminados.',
  })
  @ApiResponse({ status: 404, description: 'Farmer not found.' })
  removeCascade(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.farmersService.removeCascade(id, actor.email);
  }
}
