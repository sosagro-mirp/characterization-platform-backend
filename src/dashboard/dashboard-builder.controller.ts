import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ROLES } from '../auth/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtOnly } from '../auth/decorators/jwt-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardBuilderService } from './dashboard-builder.service';
import {
  CreateCategoryDto,
  CreateChartDto,
  PreviewChartDto,
  ReorderCategoriesDto,
  ReorderChartsDto,
  UpdateCategoryDto,
  UpdateChartDto,
} from './dto/builder/builder.dto';

/**
 * Spec 108 — API de administración del constructor de dashboard. Solo ADMIN.
 * Publicar, despublicar, archivar, restaurar y escribir categorías son
 * `@JwtOnly()`: una API key nunca las ejecuta (requisito del spec 110).
 */
@ApiTags('Dashboard builder')
@ApiBearerAuth()
@Roles(ROLES.ADMIN)
@Controller('dashboard/builder')
export class DashboardBuilderController {
  constructor(private readonly builder: DashboardBuilderService) {}

  // ── categorías ──

  @Get('categories')
  @ApiOperation({ summary: 'Categorías del constructor (incluye OVERVIEW)' })
  listCategories() {
    return this.builder.listCategories();
  }

  @Post('categories')
  @JwtOnly()
  @ApiOperation({ summary: 'Crear una categoría' })
  createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.createCategory(dto, user.userId);
  }

  @Patch('categories/reorder')
  @JwtOnly()
  @ApiOperation({ summary: 'Reordenar categorías' })
  reorderCategories(
    @Body() dto: ReorderCategoriesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.reorderCategories(dto.categoryIds, user.userId);
  }

  @Patch('categories/:id')
  @JwtOnly()
  @ApiOperation({ summary: 'Editar o desactivar una categoría' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.updateCategory(id, dto, user.userId);
  }

  @Delete('categories/:id')
  @JwtOnly()
  @ApiOperation({
    summary: 'Borrar una categoría sin gráficos (OVERVIEW nunca)',
  })
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.builder.deleteCategory(id);
  }

  // ── gráficos ──

  @Get('charts')
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'archived', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'published'] })
  @ApiQuery({ name: 'audience', required: false, enum: ['public', 'private'] })
  @ApiOperation({ summary: 'Listar gráficos (activos por defecto)' })
  listCharts(
    @Query()
    query: {
      categoryId?: string;
      archived?: string;
      status?: string;
      audience?: string;
    },
  ) {
    return this.builder.listCharts(query);
  }

  @Post('charts')
  @ApiOperation({ summary: 'Crear un gráfico en borrador' })
  createChart(
    @Body() dto: CreateChartDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.createChart(dto, user.userId);
  }

  @Patch('charts/reorder')
  @ApiOperation({ summary: 'Reordenar los gráficos de una categoría' })
  reorderCharts(
    @Body() dto: ReorderChartsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { apiKey?: unknown },
  ) {
    return this.builder.reorderCharts(
      dto.categoryId,
      dto.chartIds,
      user.userId,
      !!req.apiKey,
    );
  }

  @Get('charts/:id')
  @ApiOperation({ summary: 'Detalle de un gráfico con su salud' })
  getChart(@Param('id', ParseUUIDPipe) id: string) {
    return this.builder.getChart(id);
  }

  @Patch('charts/:id')
  @ApiOperation({ summary: 'Editar un gráfico (también publicado)' })
  updateChart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChartDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { apiKey?: unknown },
  ) {
    return this.builder.updateChart(id, dto, user.userId, !!req.apiKey);
  }

  @Post('charts/:id/duplicate')
  @ApiOperation({ summary: 'Duplicar como borrador' })
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.duplicateChart(id, user.userId);
  }

  @Post('charts/:id/publish')
  @JwtOnly()
  @ApiOperation({ summary: 'Publicar (revalida privacidad y compatibilidad)' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.publish(id, user.userId);
  }

  @Post('charts/:id/unpublish')
  @JwtOnly()
  @ApiOperation({ summary: 'Despublicar' })
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.unpublish(id, user.userId);
  }

  @Post('charts/:id/archive')
  @JwtOnly()
  @ApiOperation({ summary: 'Archivar (borrar = archivar)' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.archive(id, user.userId);
  }

  @Post('charts/:id/restore')
  @JwtOnly()
  @ApiOperation({ summary: 'Restaurar un gráfico archivado' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.builder.restore(id, user.userId);
  }

  @Get('charts/:id/events')
  @ApiOperation({ summary: 'Eventos de auditoría del gráfico' })
  events(@Param('id', ParseUUIDPipe) id: string) {
    return this.builder.events(id);
  }

  @Get('charts/:id/preview')
  @ApiOperation({
    summary:
      'Vista previa con datos reales de un gráfico guardado (audience=public|private; las métricas aceptan filtros globales)',
  })
  previewSaved(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.builder.previewSaved(id, query.audience, query);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Vista previa de una configuración sin guardar' })
  previewDraft(@Body() dto: PreviewChartDto) {
    return this.builder.previewDraft(dto);
  }

  // ── catálogos ──

  @Get('questions')
  @ApiOperation({
    summary:
      'Catálogo de preguntas con motivo de bloqueo y gráficos compatibles',
  })
  questions(
    @Query()
    query: {
      instrumentId?: string;
      search?: string;
      questionTypeId?: string;
      limit?: string;
    },
  ) {
    return this.builder.questionCatalog(query);
  }

  @Get('compat-matrix')
  @ApiOperation({ summary: 'Matriz de compatibilidad tipo → gráfico (P10)' })
  compatMatrix() {
    return this.builder.compatMatrix();
  }

  @Get('entity-metrics')
  @ApiQuery({ name: 'entity', required: false })
  @ApiOperation({ summary: 'Catálogo de métricas de entidad (P13)' })
  entityMetrics(@Query('entity') entity?: string) {
    return this.builder.entityMetrics(entity);
  }
}
