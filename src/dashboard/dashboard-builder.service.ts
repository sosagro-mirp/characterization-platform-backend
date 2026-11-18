import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Question } from 'src/questions/entities/question.entity';
import { DashboardCategory } from './entities/dashboard-category.entity';
import { DashboardChart } from './entities/dashboard-chart.entity';
import { DashboardChartSource } from './entities/dashboard-chart-source.entity';
import {
  DashboardChartEvent,
  DashboardChartEventType,
} from './entities/dashboard-chart-event.entity';
import {
  ChartConfig,
  DashboardChartsService,
  PreviewResult,
  SeriesConfig,
} from './dashboard-charts.service';
import { DashboardService } from './dashboard.service';
import {
  getAllowedCharts,
  getMatrix,
  isSelectableQuestionType,
  validateChartKind,
} from './dashboard-chart-compat';
import {
  ENTITY_METRICS,
  ENTITY_METRIC_FILTERS,
} from './dashboard-entity-metrics.config';
import {
  ChartSeriesDto,
  CreateCategoryDto,
  CreateChartDto,
  UpdateCategoryDto,
  UpdateChartDto,
} from './dto/builder/builder.dto';

const OVERVIEW_CODE = 'OVERVIEW';

@Injectable()
export class DashboardBuilderService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(DashboardCategory)
    private readonly categoryRepo: Repository<DashboardCategory>,
    @InjectRepository(DashboardChart)
    private readonly chartRepo: Repository<DashboardChart>,
    @InjectRepository(DashboardChartSource)
    private readonly sourceRepo: Repository<DashboardChartSource>,
    @InjectRepository(DashboardChartEvent)
    private readonly eventRepo: Repository<DashboardChartEvent>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    private readonly charts: DashboardChartsService,
    private readonly dashboard: DashboardService,
  ) {}

  // ───────────────────────────── categorías ─────────────────────────────

  listCategories(): Promise<DashboardCategory[]> {
    return this.categoryRepo.find({ order: { position: 'ASC', code: 'ASC' } });
  }

  async createCategory(
    dto: CreateCategoryDto,
    userId: string,
  ): Promise<DashboardCategory> {
    if (await this.categoryRepo.findOne({ where: { code: dto.code } })) {
      throw new BadRequestException(`Ya existe la categoría «${dto.code}».`);
    }
    const max = await this.categoryRepo
      .createQueryBuilder('c')
      .select('COALESCE(MAX(c.position), 0)', 'max')
      .getRawOne<{ max: string }>();
    return this.categoryRepo.save(
      this.categoryRepo.create({
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        position: Number(max?.max ?? 0) + 1,
        isActive: true,
        isReserved: false,
        createdBy: userId,
        updatedBy: userId,
      }),
    );
  }

  private async getCategory(id: string): Promise<DashboardCategory> {
    const category = await this.categoryRepo.findOne({
      where: { categoryId: id },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada.');
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    userId: string,
  ): Promise<DashboardCategory> {
    const category = await this.getCategory(id);
    if (category.isReserved) {
      if (dto.code !== undefined && dto.code !== category.code) {
        throw new BadRequestException(
          'La categoría reservada no cambia de código.',
        );
      }
      if (dto.name !== undefined && dto.name !== category.name) {
        throw new BadRequestException('La categoría reservada no se renombra.');
      }
      if (dto.isActive === false) {
        throw new BadRequestException(
          'La categoría reservada no se desactiva.',
        );
      }
    }
    if (dto.code !== undefined && dto.code !== category.code) {
      if (await this.categoryRepo.findOne({ where: { code: dto.code } })) {
        throw new BadRequestException(`Ya existe la categoría «${dto.code}».`);
      }
      category.code = dto.code;
    }
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    category.updatedBy = userId;
    return this.categoryRepo.save(category);
  }

  async reorderCategories(
    categoryIds: string[],
    userId: string,
  ): Promise<DashboardCategory[]> {
    await this.ds.transaction(async (m) => {
      for (const [index, id] of categoryIds.entries()) {
        await m.update(
          DashboardCategory,
          { categoryId: id },
          { position: index, updatedBy: userId },
        );
      }
    });
    return this.listCategories();
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.getCategory(id);
    if (category.isReserved || category.code === OVERVIEW_CODE) {
      throw new BadRequestException('La categoría reservada no se borra.');
    }
    const count = await this.chartRepo.count({ where: { categoryId: id } });
    if (count > 0) {
      throw new ConflictException(
        'La categoría tiene gráficos: se desactiva, no se borra.',
      );
    }
    await this.categoryRepo.delete({ categoryId: id });
  }

  // ───────────────────────────── gráficos ─────────────────────────────

  private async sourcesOf(
    chartId: string,
    manager?: EntityManager,
  ): Promise<DashboardChartSource[]> {
    const repo = manager
      ? manager.getRepository(DashboardChartSource)
      : this.sourceRepo;
    return repo.find({
      where: { chartId },
      order: { seriesPosition: 'ASC', sourceId: 'ASC' },
    });
  }

  private toConfig(
    chart: DashboardChart,
    sources: DashboardChartSource[],
  ): ChartConfig {
    const bySeries = new Map<string, SeriesConfig>();
    for (const s of sources) {
      const entry = bySeries.get(s.seriesKey) ?? {
        seriesKey: s.seriesKey,
        label: s.seriesLabel,
        questionIds: [],
      };
      entry.questionIds.push(s.questionId);
      bySeries.set(s.seriesKey, entry);
    }
    return {
      sourceKind: chart.sourceKind,
      chartKind: chart.chartKind,
      combineMode: chart.combineMode,
      settings: chart.settings ?? {},
      metricKey: chart.entityMetricKey,
      series: [...bySeries.values()],
    };
  }

  private async toBody(
    chart: DashboardChart,
    sources?: DashboardChartSource[],
  ) {
    const rows = sources ?? (await this.sourcesOf(chart.chartId));
    const config = this.toConfig(chart, rows);
    const health = await this.charts.healthOf(config, chart.questionType);
    const series = config.series.map((s) => ({
      seriesKey: s.seriesKey,
      label: s.label,
      sources: rows
        .filter((r) => r.seriesKey === s.seriesKey)
        .map((r) => ({
          questionId: r.questionId,
          instrumentCodeSnapshot: r.instrumentCodeSnapshot,
          questionTextSnapshot: r.questionTextSnapshot,
        })),
    }));
    return {
      chartId: chart.chartId,
      categoryId: chart.categoryId,
      title: chart.title,
      subtitle: chart.subtitle,
      sourceKind: chart.sourceKind,
      metricKey: chart.entityMetricKey,
      questionType: chart.questionType,
      chartKind: chart.chartKind,
      combineMode: chart.combineMode,
      audience: chart.audience,
      status: chart.status,
      layout: chart.layout,
      position: chart.position,
      settings: chart.settings,
      archivedAt: chart.archivedAt,
      health,
      createdBy: chart.createdBy,
      updatedBy: chart.updatedBy,
      publishedBy: chart.publishedBy,
      publishedAt: chart.publishedAt,
      createdAt: chart.createdAt,
      updatedAt: chart.updatedAt,
      series,
    };
  }

  private async getChartEntity(
    id: string,
    manager?: EntityManager,
  ): Promise<DashboardChart> {
    const repo = manager
      ? manager.getRepository(DashboardChart)
      : this.chartRepo;
    const chart = await repo.findOne({ where: { chartId: id } });
    if (!chart) throw new NotFoundException('Gráfico no encontrado.');
    return chart;
  }

  async getChart(id: string) {
    return this.toBody(await this.getChartEntity(id));
  }

  async listCharts(query: {
    categoryId?: string;
    archived?: string;
    status?: string;
    audience?: string;
  }) {
    const qb = this.chartRepo.createQueryBuilder('c');
    if (query.categoryId) {
      qb.andWhere('c.category_id = :cid', { cid: query.categoryId });
    }
    qb.andWhere(
      query.archived === 'true'
        ? 'c.archived_at IS NOT NULL'
        : 'c.archived_at IS NULL',
    );
    if (query.status === 'draft' || query.status === 'published') {
      qb.andWhere('c.status = :status', { status: query.status });
    }
    if (query.audience === 'public' || query.audience === 'private') {
      qb.andWhere('c.audience = :audience', { audience: query.audience });
    }
    const rows = await qb.orderBy('c.position', 'ASC').getMany();
    return Promise.all(rows.map((c) => this.toBody(c)));
  }

  private normalizeSeries(
    series: ChartSeriesDto[] | undefined,
  ): SeriesConfig[] {
    return (series ?? []).map((s, i) => ({
      seriesKey: s.seriesKey ?? `s${i + 1}`,
      label: s.label,
      questionIds: s.questionIds,
    }));
  }

  private configFromDto(dto: CreateChartDto): ChartConfig {
    return {
      sourceKind: dto.sourceKind,
      chartKind: dto.chartKind,
      combineMode: dto.combineMode ?? 'merge',
      settings: dto.settings ?? {},
      metricKey: dto.metricKey ?? null,
      series: this.normalizeSeries(dto.series),
    };
  }

  private async assertCategory(id: string): Promise<void> {
    await this.getCategory(id);
  }

  private async event(
    manager: EntityManager,
    chartId: string,
    eventType: DashboardChartEventType,
    userId: string,
    summary: Record<string, unknown> = {},
  ): Promise<void> {
    await manager.getRepository(DashboardChartEvent).save({
      chartId,
      eventType,
      userId,
      summary,
    });
  }

  /** Reemplaza las fuentes del gráfico con huella de instrumento y texto. */
  private async writeSources(
    manager: EntityManager,
    chartId: string,
    config: ChartConfig,
  ): Promise<void> {
    await manager.delete(DashboardChartSource, { chartId });
    const questions = await this.charts.loadQuestions(
      config.series.flatMap((s) => s.questionIds),
    );
    for (const [seriesPosition, s] of config.series.entries()) {
      for (const [i, questionId] of s.questionIds.entries()) {
        const q = questions.get(questionId)!;
        await manager.insert(DashboardChartSource, {
          chartId,
          questionId,
          seriesKey: s.seriesKey,
          seriesLabel: s.label,
          seriesPosition,
          isRepresentative: i === 0,
          instrumentCodeSnapshot: q.section?.instrument?.code ?? null,
          questionTextSnapshot: q.text,
        });
      }
    }
  }

  private async nextPosition(
    manager: EntityManager,
    categoryId: string,
  ): Promise<number> {
    const row = await manager
      .getRepository(DashboardChart)
      .createQueryBuilder('c')
      .select('COALESCE(MAX(c.position), -1)', 'max')
      .where('c.category_id = :categoryId', { categoryId })
      .getRawOne<{ max: string }>();
    return Number(row?.max ?? -1) + 1;
  }

  async createChart(dto: CreateChartDto, userId: string) {
    await this.assertCategory(dto.categoryId);
    const config = this.configFromDto(dto);
    const questionType = await this.charts.validate(config);

    const id = await this.ds.transaction(async (m) => {
      const chart = await m.save(
        m.create(DashboardChart, {
          categoryId: dto.categoryId,
          title: dto.title,
          subtitle: dto.subtitle ?? null,
          sourceKind: config.sourceKind,
          questionType,
          chartKind: config.chartKind,
          combineMode: config.combineMode,
          settings: config.settings,
          entityMetricKey: config.metricKey,
          audience: dto.audience,
          status: 'draft',
          layout: dto.layout ?? 'normal',
          position: await this.nextPosition(m, dto.categoryId),
          createdBy: userId,
          updatedBy: userId,
        }),
      );
      await this.writeSources(m, chart.chartId, config);
      await this.event(m, chart.chartId, 'created', userId, {
        title: chart.title,
        chartKind: chart.chartKind,
      });
      return chart.chartId;
    });
    return this.getChart(id);
  }

  async updateChart(id: string, dto: UpdateChartDto, userId: string) {
    const chart = await this.getChartEntity(id);
    const current = this.toConfig(chart, await this.sourcesOf(id));
    const config: ChartConfig = {
      sourceKind: chart.sourceKind,
      chartKind: dto.chartKind ?? current.chartKind,
      combineMode: dto.combineMode ?? current.combineMode,
      settings: dto.settings ?? current.settings,
      metricKey: dto.metricKey ?? current.metricKey,
      series: dto.series ? this.normalizeSeries(dto.series) : current.series,
    };
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const questionType = await this.charts.validate(config);

    await this.ds.transaction(async (m) => {
      const changed = Object.keys(dto);
      Object.assign(chart, {
        categoryId: dto.categoryId ?? chart.categoryId,
        title: dto.title ?? chart.title,
        subtitle: dto.subtitle ?? chart.subtitle,
        questionType,
        chartKind: config.chartKind,
        combineMode: config.combineMode,
        settings: config.settings,
        entityMetricKey: config.metricKey,
        audience: dto.audience ?? chart.audience,
        layout: dto.layout ?? chart.layout,
        updatedBy: userId,
      });
      await m.save(chart);
      if (dto.series) await this.writeSources(m, id, config);
      await this.event(m, id, 'updated', userId, { fields: changed });
    });
    return this.getChart(id);
  }

  async duplicateChart(id: string, userId: string) {
    const chart = await this.getChartEntity(id);
    const config = this.toConfig(chart, await this.sourcesOf(id));
    const newId = await this.ds.transaction(async (m) => {
      const copy = await m.save(
        m.create(DashboardChart, {
          categoryId: chart.categoryId,
          title: `${chart.title} (copia)`.slice(0, 255),
          subtitle: chart.subtitle,
          sourceKind: chart.sourceKind,
          questionType: chart.questionType,
          chartKind: chart.chartKind,
          combineMode: chart.combineMode,
          settings: chart.settings,
          entityMetricKey: chart.entityMetricKey,
          audience: chart.audience,
          status: 'draft',
          layout: chart.layout,
          position: await this.nextPosition(m, chart.categoryId),
          createdBy: userId,
          updatedBy: userId,
        }),
      );
      await this.writeSources(m, copy.chartId, config);
      await this.event(m, copy.chartId, 'created', userId, {
        duplicatedFrom: id,
      });
      return copy.chartId;
    });
    return this.getChart(newId);
  }

  async reorderCharts(categoryId: string, chartIds: string[], userId: string) {
    await this.assertCategory(categoryId);
    await this.ds.transaction(async (m) => {
      for (const [index, chartId] of chartIds.entries()) {
        await m.update(
          DashboardChart,
          { chartId, categoryId },
          { position: index, updatedBy: userId },
        );
      }
    });
    return this.listCharts({ categoryId });
  }

  async publish(id: string, userId: string) {
    const chart = await this.getChartEntity(id);
    // Revalida privacidad y compatibilidad contra el estado actual.
    const config = this.toConfig(chart, await this.sourcesOf(id));
    await this.charts.validate(config);
    await this.ds.transaction(async (m) => {
      chart.status = 'published';
      chart.publishedBy = userId;
      chart.publishedAt = new Date();
      chart.updatedBy = userId;
      await m.save(chart);
      await this.event(m, id, 'published', userId);
    });
    return this.getChart(id);
  }

  async unpublish(id: string, userId: string) {
    return this.simpleAction(id, userId, 'unpublished', (c) => {
      c.status = 'draft';
    });
  }

  async archive(id: string, userId: string) {
    return this.simpleAction(id, userId, 'archived', (c) => {
      c.archivedAt = new Date();
    });
  }

  async restore(id: string, userId: string) {
    return this.simpleAction(id, userId, 'restored', (c) => {
      c.archivedAt = null;
    });
  }

  private async simpleAction(
    id: string,
    userId: string,
    type: DashboardChartEventType,
    apply: (chart: DashboardChart) => void,
  ) {
    const chart = await this.getChartEntity(id);
    await this.ds.transaction(async (m) => {
      apply(chart);
      chart.updatedBy = userId;
      await m.save(chart);
      await this.event(m, id, type, userId);
    });
    return this.getChart(id);
  }

  async events(id: string) {
    await this.getChartEntity(id);
    return this.eventRepo.find({
      where: { chartId: id },
      order: { createdAt: 'ASC' },
    });
  }

  // ───────────────────────────── vista previa ─────────────────────────────

  async previewSaved(
    id: string,
    audience: string | undefined,
    query: Record<string, string | undefined>,
  ): Promise<PreviewResult> {
    this.assertAudience(audience);
    const chart = await this.getChartEntity(id);
    const config = this.toConfig(chart, await this.sourcesOf(id));
    return this.charts.preview(config, chart.questionType, query);
  }

  async previewDraft(dto: CreateChartDto): Promise<PreviewResult> {
    this.assertAudience(dto.audience);
    const config = this.configFromDto(dto);
    const questionType = await this.charts.validate(config);
    return this.charts.preview(config, questionType);
  }

  private assertAudience(audience: string | undefined): void {
    if (
      audience !== undefined &&
      audience !== 'public' &&
      audience !== 'private'
    ) {
      throw new BadRequestException('audience debe ser public o private.');
    }
  }

  // ───────────────────────────── catálogos ─────────────────────────────

  compatMatrix() {
    return getMatrix();
  }

  entityMetrics(entity?: string) {
    return ENTITY_METRICS.filter((m) => !entity || m.entity === entity).map(
      (m) => ({
        metricKey: m.metricKey,
        label: m.label,
        entity: m.entity,
        charts: m.charts,
        filters: ENTITY_METRIC_FILTERS,
      }),
    );
  }

  async questionCatalog(query: {
    instrumentId?: string;
    search?: string;
    questionTypeId?: string;
    limit?: string;
  }) {
    const qb = this.questionRepo
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.section', 'section')
      .leftJoinAndSelect('section.instrument', 'instrument')
      .leftJoinAndSelect('question.type', 'type')
      .leftJoinAndSelect('question.options', 'options');
    if (query.instrumentId) {
      qb.andWhere('instrument.instrumentId = :iid', {
        iid: query.instrumentId,
      });
    }
    if (query.questionTypeId) {
      qb.andWhere('type.typeId = :tid', { tid: query.questionTypeId });
    }
    if (query.search) {
      qb.andWhere('question.text ILIKE :s', { s: `%${query.search}%` });
    }
    const limit = Math.min(Number(query.limit) || 500, 1000);
    const rows = await qb
      .orderBy('instrument.name', 'ASC')
      .addOrderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .take(limit)
      .getMany();

    return rows.map((q) => {
      const typeName = q.type?.name;
      let blockedReason = this.dashboard.blockedReasonFor(q);
      if (!blockedReason && !isSelectableQuestionType(typeName)) {
        blockedReason = `El tipo «${typeName}» no tiene gráfico compatible.`;
      }
      const optionTexts = (q.options ?? []).map((o) => o.text);
      const compatibleCharts = blockedReason
        ? []
        : getAllowedCharts(typeName).filter(
            (chartKind) =>
              validateChartKind({
                questionType: typeName,
                chartKind,
                combineMode: 'merge',
                optionTexts,
              }).ok,
          );
      return {
        questionId: q.questionId,
        text: q.text,
        questionType: typeName,
        sectionName: q.section?.name ?? null,
        instrumentId: q.section?.instrument?.instrumentId ?? null,
        instrumentCode: q.section?.instrument?.code ?? null,
        instrumentName: q.section?.instrument?.name ?? null,
        archivedAt: q.archivedAt ?? null,
        selectable: blockedReason === null,
        blockedReason,
        compatibleCharts,
      };
    });
  }
}
