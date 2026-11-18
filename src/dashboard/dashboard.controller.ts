import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public, PublicUnlessQuery } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../auth/constants';
import { DashboardService } from './dashboard.service';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardDepartmentCountDto } from './dto/dashboard-department-count.dto';
import { DashboardOverviewDto } from './dto/dashboard-overview.dto';
import {
  ServedCategoryDto,
  ServedChartsResponseDto,
} from './dto/dashboard-served-chart.dto';
import {
  DashboardServingService,
  PRIVATE_AUDIENCES,
  PUBLIC_AUDIENCES,
} from './dashboard-serving.service';
import { DashboardKpiDto } from './dto/dashboard-kpis.dto';
import { DashboardDigitalDemandDto } from './dto/dashboard-digital-demand.dto';

@ApiTags('Dashboard')
@Public()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly serving: DashboardServingService,
  ) {}

  @Get('analytics')
  @PublicUnlessQuery('instrumentId')
  @Roles(ROLES.ADMIN, ROLES.RESEARCHER)
  @ApiOperation({
    summary: 'Datos agregados por instrumento (ADMIN/RESEARCHER)',
    description:
      'Spec 109 (P20): la consulta pública por `categoryId` se retiró y responde 410; el dashboard usa `GET /dashboard/charts`. Spec 107: con `instrumentId` exige ADMIN o RESEARCHER (JWT, o API key con scope read) y responde `Cache-Control: private, no-store`. Devuelve agregados por pregunta (nunca respuestas individuales; los numéricos van en intervalos, sin valores crudos ni extremos). Requiere instrumentId o categoryId (mutuamente excluyentes, spec 43) para poblar questions[]; sin ninguno retorna solo metadata. Con categoryId, agrega las preguntas de todos los instrumentos activos de la categoría.',
  })
  @ApiResponse({ status: 200, type: DashboardResponseDto })
  @ApiResponse({
    status: 410,
    description: 'Con categoryId: ruta retirada (spec 109).',
  })
  @ApiResponse({
    status: 401,
    description: 'Con instrumentId, sin token ni API key.',
  })
  @ApiResponse({
    status: 403,
    description: 'Con instrumentId, usuario que no es ADMIN ni RESEARCHER.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Alguno de los filtros UUID no existe, o categoryId no es una categoría válida.',
  })
  getAnalytics(
    @Query() filters: DashboardFiltersDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DashboardResponseDto> {
    res.setHeader(
      'Cache-Control',
      filters.instrumentId ? 'private, no-store' : 'public, max-age=300',
    );
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
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Categorías del dashboard público',
    description:
      'Spec 109 (P2, P20): categorías activas del constructor con al menos un gráfico público publicado, en su orden. Incluye `OVERVIEW` si tiene gráficos; la navegación la omite.',
  })
  @ApiResponse({ status: 200, type: [ServedCategoryDto] })
  getCategories(): Promise<ServedCategoryDto[]> {
    return this.serving.listCategories(PUBLIC_AUDIENCES);
  }

  @Get('charts')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Gráficos públicos publicados de una categoría',
    description:
      'Spec 109 (P20, P22): solo gráficos `published`, no archivados, de audiencia pública, en el orden configurado, con los filtros globales. `categoryId` es el código de la categoría (C1…, OVERVIEW). Las fuentes bloqueadas se excluyen; un gráfico sin fuentes válidas no se sirve. Celdas y gráficos por debajo de los umbrales del 107 se sirven suprimidos.',
  })
  @ApiResponse({ status: 200, type: ServedChartsResponseDto })
  @ApiResponse({
    status: 404,
    description:
      'Código de categoría inexistente o inactivo, o un filtro UUID que no existe.',
  })
  getCharts(
    @Query() filters: DashboardFiltersDto,
  ): Promise<ServedChartsResponseDto> {
    return this.serving.serveCharts(
      filters.categoryId,
      PUBLIC_AUDIENCES,
      filters,
    );
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

  @Get('kpis')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Tira de KPIs curados (spec 43, D5)',
    description:
      'Con categoryId=C15 devuelve la tira de "Demanda digital"; en cualquier otro caso (incluida la vista de resumen general), la tira general. Cada KPI declara su unidad y se marca suppressed cuando su pregunta fuente no alcanza el umbral de privacidad — nunca un número inventado.',
  })
  @ApiResponse({ status: 200, type: [DashboardKpiDto] })
  getKpis(@Query() filters: DashboardFiltersDto): Promise<DashboardKpiDto[]> {
    return this.dashboardService.getKpis(filters);
  }

  @Get('digital-demand')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Vista consolidada "Demanda digital" (C15, spec 43, D4)',
    description:
      'Consolida todos los ítems Likert ★ (interés en app) de la muestra filtrada: ranking con bandas y media, índice global de aceptación, cortes por edad/nivel educativo/conectividad, radar de barreras S_DCU (B1/B2/B3), confianza en instituciones, habilidades digitales, plataformas y canal preferido. Ignora instrumentId/categoryId (consolidación fija, cruza siempre los mismos instrumentos).',
  })
  @ApiResponse({ status: 200, type: DashboardDigitalDemandDto })
  getDigitalDemand(
    @Query() filters: DashboardFiltersDto,
  ): Promise<DashboardDigitalDemandDto> {
    return this.dashboardService.getDigitalDemand(filters);
  }
}

/**
 * Spec 109 (P8, P19, P22) — dashboard privado: gráficos públicos y privados
 * publicados, para ADMIN y RESEARCHER, con las mismas barreras y umbrales que
 * el público y sin caché compartida.
 */
@ApiTags('Dashboard')
@ApiBearerAuth()
@Roles(ROLES.ADMIN, ROLES.RESEARCHER)
@Controller('dashboard/private')
export class DashboardPrivateController {
  constructor(private readonly serving: DashboardServingService) {}

  @Get('categories')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Categorías del dashboard privado',
    description:
      'Categorías activas con al menos un gráfico publicado (público o privado).',
  })
  @ApiResponse({ status: 200, type: [ServedCategoryDto] })
  getCategories(): Promise<ServedCategoryDto[]> {
    return this.serving.listCategories(PRIVATE_AUDIENCES);
  }

  @Get('charts')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Gráficos publicados (públicos y privados) de una categoría',
  })
  @ApiResponse({ status: 200, type: ServedChartsResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Categoría inexistente o inactiva.',
  })
  getCharts(
    @Query() filters: DashboardFiltersDto,
  ): Promise<ServedChartsResponseDto> {
    return this.serving.serveCharts(
      filters.categoryId,
      PRIVATE_AUDIENCES,
      filters,
    );
  }
}
