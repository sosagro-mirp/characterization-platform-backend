import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardDepartmentCountDto } from './dto/dashboard-department-count.dto';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';
import { DashboardCategoryDto } from './dto/dashboard-category.dto';

@ApiTags('Dashboard')
@Public()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('analytics')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Datos agregados y anonimizados del dashboard público',
    description:
      'Devuelve agregados por pregunta (nunca respuestas individuales). Requiere instrumentId o categoryId (mutuamente excluyentes, spec 43) para poblar questions[]; sin ninguno retorna solo metadata. Con categoryId, agrega las preguntas de todos los instrumentos activos de la categoría.',
  })
  @ApiResponse({ status: 200, type: DashboardResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Se enviaron instrumentId y categoryId al mismo tiempo.',
  })
  @ApiResponse({
    status: 404,
    description: 'Alguno de los filtros UUID no existe, o categoryId no es una categoría válida.',
  })
  getAnalytics(
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getAnalytics(filters);
  }

  @Get('summary')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Tamaño de la muestra para los filtros dados',
    description:
      'Útil para el frontend antes de renderizar gráficos (indicador de tamaño de muestra en el panel de filtros). Acepta instrumentId o categoryId (spec 43).',
  })
  @ApiResponse({
    status: 200,
    schema: { example: { count: 42, suppressed: false } },
  })
  getSummary(
    @Query() filters: DashboardFiltersDto,
  ): Promise<{ count: number; suppressed: boolean }> {
    return this.dashboardService.getSummary(filters);
  }

  @Get('department-counts')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Distribución de encuestas por departamento (mapa coroplético)',
    description:
      'Ignora departmentId/townId si se envían. Acepta instrumentId o categoryId (spec 43) para acotar la muestra. Aplica el umbral de privacidad por departamento (buckets con < 5 encuestas se omiten).',
  })
  @ApiResponse({ status: 200, type: [DashboardDepartmentCountDto] })
  getDepartmentCounts(
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardDepartmentCountDto[]> {
    return this.dashboardService.getDepartmentCounts(filters);
  }

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=3600')
  @ApiOperation({
    summary: 'Catálogo de categorías temáticas del dashboard (C1–C15)',
    description:
      'Categorías estáticas (spec 43, dashboard.md §2) con sus instrumentos activos y el conteo de preguntas visualizables. Catálogo estático, cache de una hora.',
  })
  @ApiResponse({ status: 200, type: [DashboardCategoryDto] })
  getCategories(): Promise<DashboardCategoryDto[]> {
    return this.dashboardService.getCategories();
  }

  @Get('overview')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Perfil demográfico de la muestra (independiente del instrumento)',
    description:
      'Ignora instrumentId/categoryId/departmentId/townId. Distribución por tipo de actor, cultivo y departamento, más estadísticas de farmer.age y farmer.experienceYears (respetando el umbral de privacidad).',
  })
  @ApiResponse({ status: 200, type: DashboardOverviewDto })
  getOverview(
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardOverviewDto> {
    return this.dashboardService.getOverview(filters);
  }
}
