import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Survey } from 'src/surveys/entities/survey.entity';
import { Response } from 'src/responses/entities/response.entity';
import { Question } from 'src/questions/entities/question.entity';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Department } from 'src/departments/entities/department.entity';
import { Town } from 'src/towns/entities/town.entity';
import { TypeOfCrop } from 'src/types-of-crops/entities/type-of-crop.entity';
import { ActorType } from 'src/actor-types/entities/actor-type.entity';
import { DashboardFiltersDto } from './dto/dashboard-filters.dto';
import { DashboardDepartmentCountDto } from './dto/dashboard-department-count.dto';
import {
  DashboardOverviewBucketDto,
  DashboardOverviewDto,
} from './dto/dashboard-overview.dto';
import {
  AggregationChoicesDto,
  AggregationLikertDto,
  AggregationNumericDto,
  AggregationOptionDto,
  AggregationYesNoDto,
  DashboardAggregation,
  DashboardQuestionDto,
  DashboardResponseDto,
} from './dto/dashboard-response.dto';
import { DashboardCategoryDto } from './dto/dashboard-category.dto';
import {
  DASHBOARD_CATEGORIES,
  DashboardCategoryConfig,
} from './dashboard-categories.config';
import {
  AGE_RANGE_BOUNDS,
  AGE_RANGE_BUCKETS,
  AgeRangeBucket,
  QuestionLocator,
  RESPONSE_FILTER_SOURCES,
  ResponseFilterSource,
} from './dashboard-response-filters.config';
import {
  C15_KPIS,
  DIGITAL_DEMAND_SOURCES,
  KpiDefinition,
  OVERVIEW_KPIS,
} from './dashboard-kpis.config';
import { DashboardKpiDto } from './dto/dashboard-kpis.dto';
import {
  BarriersRadarDto,
  DashboardDigitalDemandDto,
  IndexByCutBucketDto,
  InstitutionTrustItemDto,
  LikertRankingItemDto,
} from './dto/dashboard-digital-demand.dto';

const MIN_SAMPLE_THRESHOLD = 5;

/**
 * Spec 43 (Fase 3): filtros globales derivados de respuestas, ya resueltos a
 * un `questionId` concreto. `'impossible'` señala que al menos un filtro
 * solicitado no tiene pregunta fuente en esta base (instrumento no
 * sembrado) — en ese caso ninguna encuesta puede satisfacerlo, así que
 * `applySurveyFilters` fuerza cero resultados en vez de ignorar el filtro
 * (mismo criterio que `categoryInstrumentIds` vacío).
 */
type ResolvedResponseFilter = {
  key: string;
  questionId: string;
  matchType: ResponseFilterSource['matchType'];
  range?: { min?: number; max?: number };
  optionTexts?: string[];
};
type ResolvedResponseFilters = ResolvedResponseFilter[] | 'impossible';

const EXCLUDED_QUESTION_TYPES = [
  'open_text',
  'image',
  'voice_recording',
  'document',
  'video',
];

const DENIED_SYSTEM_FIELDS = [
  'farm.latitude',
  'farm.longitude',
  'farm.name',
  'farm.vereda',
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round2(parsed) : null;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepo: Repository<Survey>,
    @InjectRepository(Response)
    private readonly responseRepo: Repository<Response>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Town)
    private readonly townRepo: Repository<Town>,
    @InjectRepository(TypeOfCrop)
    private readonly cropRepo: Repository<TypeOfCrop>,
    @InjectRepository(ActorType)
    private readonly actorTypeRepo: Repository<ActorType>,
  ) {}

  async getSummary(
    filters: DashboardFiltersDto,
  ): Promise<{ count: number; suppressed: boolean }> {
    const { categoryInstruments } = await this.validateFilters(filters);
    const categoryInstrumentIds = this.resolveCategoryInstrumentIds(
      filters,
      categoryInstruments,
    );
    const responseFilters = await this.resolveResponseFilters(filters);
    const count = await this.buildFilteredSurveyQuery(
      filters,
      categoryInstrumentIds,
      responseFilters,
    ).getCount();
    return { count, suppressed: count < MIN_SAMPLE_THRESHOLD };
  }

  /**
   * Fase 9 (Spec 30): distribución de encuestas por departamento para el
   * mapa coroplético. Ignora departmentId/townId de los filtros (agrupar por
   * departamento mientras se filtra por uno específico no tiene sentido; el
   * mapa solo se muestra en el frontend cuando no hay departamento activo).
   * Aplica el mismo umbral de privacidad por bucket que el resto del dashboard.
   *
   * `responseFilters` es opcional para permitir que `getOverview` reutilice
   * su propia resolución (evita resolver los mismos filtros dos veces por
   * request); cuando se llama directamente (ruta pública), se resuelve aquí.
   */
  async getDepartmentCounts(
    filters: DashboardFiltersDto,
    responseFilters?: ResolvedResponseFilters,
  ): Promise<DashboardDepartmentCountDto[]> {
    const { departmentId: _departmentId, townId: _townId, ...rest } = filters;
    const { categoryInstruments } = await this.validateFilters(rest);
    const categoryInstrumentIds = this.resolveCategoryInstrumentIds(
      rest,
      categoryInstruments,
    );
    const resolvedResponseFilters =
      responseFilters ?? (await this.resolveResponseFilters(rest));

    const rows = await this.buildFilteredSurveyQuery(
      rest,
      categoryInstrumentIds,
      resolvedResponseFilters,
    )
      .innerJoin('survey.department', 'department')
      .select('department.departmentId', 'departmentId')
      .addSelect('department.name', 'departmentName')
      .addSelect('COUNT(*)', 'count')
      .groupBy('department.departmentId')
      .addGroupBy('department.name')
      .getRawMany<{
        departmentId: string;
        departmentName: string;
        count: string;
      }>();

    return rows
      .map((row) => ({
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        count: Number(row.count),
      }))
      .filter((row) => row.count >= MIN_SAMPLE_THRESHOLD);
  }

  /**
   * Fase 12 (Spec 30, opcional): perfil demográfico del respondente,
   * independiente del instrumento actualmente filtrado — `farmer.age` y
   * `farmer.experienceYears` solo existen como preguntas en S1a, pero el
   * perfil debe reflejar la muestra completa (filtrada por cultivo/tipo de
   * actor), no solo cuando S1a está seleccionado. Por eso ignora
   * instrumentId/categoryId/departmentId/townId (mismo criterio que
   * `getDepartmentCounts` para department; instrumentId/categoryId se ignoran
   * porque agrupar "por instrumento o categoría" no aplica a un perfil
   * poblacional — spec 43, D2).
   */
  async getOverview(
    filters: DashboardFiltersDto,
  ): Promise<DashboardOverviewDto> {
    const {
      instrumentId: _instrumentId,
      categoryId: _categoryId,
      departmentId: _departmentId,
      townId: _townId,
      ...rest
    } = filters;
    await this.validateFilters(rest);
    const responseFilters = await this.resolveResponseFilters(rest);

    const totalCount = await this.buildFilteredSurveyQuery(
      rest,
      undefined,
      responseFilters,
    ).getCount();
    const suppressed = totalCount < MIN_SAMPLE_THRESHOLD;

    if (suppressed) {
      return {
        totalCount,
        suppressed: true,
        byActorType: [],
        byCrop: [],
        byDepartment: [],
        age: null,
        experienceYears: null,
      };
    }

    const [byActorType, byCrop, byDepartment, age, experienceYears] =
      await Promise.all([
        this.groupSurveysByRelation(
          rest,
          'actorType',
          'actorTypeId',
          responseFilters,
        ),
        this.groupSurveysByRelation(rest, 'crop', 'cropId', responseFilters),
        this.getDepartmentCounts(rest, responseFilters).then((rows) =>
          rows.map((r) => ({
            id: r.departmentId,
            name: r.departmentName,
            count: r.count,
          })),
        ),
        this.getSystemFieldNumericStats(rest, 'farmer.age', responseFilters),
        this.getSystemFieldNumericStats(
          rest,
          'farmer.experienceYears',
          responseFilters,
        ),
      ]);

    return {
      totalCount,
      suppressed: false,
      byActorType,
      byCrop,
      byDepartment,
      age,
      experienceYears,
    };
  }

  private async groupSurveysByRelation(
    filters: DashboardFiltersDto,
    relation: 'actorType' | 'crop',
    idField: string,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<DashboardOverviewBucketDto[]> {
    const rows = await this.buildFilteredSurveyQuery(
      filters,
      undefined,
      responseFilters,
    )
      .innerJoin(`survey.${relation}`, relation)
      .select(`${relation}.${idField}`, 'id')
      .addSelect(`${relation}.name`, 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy(`${relation}.${idField}`)
      .addGroupBy(`${relation}.name`)
      .getRawMany<{ id: string; name: string; count: string }>();

    return rows
      .map((row) => ({ id: row.id, name: row.name, count: Number(row.count) }))
      .filter((row) => row.count >= MIN_SAMPLE_THRESHOLD);
  }

  private async getSystemFieldNumericStats(
    filters: DashboardFiltersDto,
    systemField: string,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<AggregationNumericDto | null> {
    const question = await this.questionRepo.findOne({
      where: { systemField },
    });
    if (!question) return null;

    const answeredCount = await this.countAnswered(
      question,
      'numeric',
      filters,
      responseFilters,
    );
    if (answeredCount < MIN_SAMPLE_THRESHOLD) return null;

    return this.aggregateNumeric(
      question,
      filters,
      answeredCount,
      responseFilters,
    );
  }

  async getAnalytics(
    filters: DashboardFiltersDto,
  ): Promise<DashboardResponseDto> {
    const {
      instrument,
      category,
      categoryInstruments,
      departmentName,
      townName,
      cropName,
      actorTypeName,
    } = await this.validateFilters(filters);
    const categoryInstrumentIds = this.resolveCategoryInstrumentIds(
      filters,
      categoryInstruments,
    );
    const responseFilters = await this.resolveResponseFilters(filters);

    const totalCount = await this.buildFilteredSurveyQuery(
      filters,
      categoryInstrumentIds,
      responseFilters,
    ).getCount();
    const dateRange =
      totalCount > 0
        ? await this.getDateRange(
            filters,
            categoryInstrumentIds,
            responseFilters,
          )
        : null;

    const metadata = {
      totalCount,
      instrumentName: instrument?.name,
      categoryName: category?.name,
      departmentName,
      townName,
      cropName,
      actorTypeName,
      dateRange,
      filters,
    };

    if (totalCount < MIN_SAMPLE_THRESHOLD) {
      return {
        metadata,
        suppressed: true,
        reason: `La muestra de encuestas con estos filtros es insuficiente para mostrar datos (${totalCount} encuestas, se requieren al menos ${MIN_SAMPLE_THRESHOLD}).`,
        questions: [],
      };
    }

    if (!instrument && !category) {
      return { metadata, suppressed: false, questions: [] };
    }

    // D2 (spec 43): instrumentId y categoryId son mutuamente excluyentes
    // (validado en validateFilters), así que a lo sumo uno de los dos ramales
    // siguientes se ejecuta.
    let questions: Question[];
    let instrumentByQuestionId: Map<string, Instrument>;
    if (instrument) {
      questions = await this.getEligibleQuestions(instrument.instrumentId);
      instrumentByQuestionId = new Map(
        questions.map((q) => [q.questionId, instrument]),
      );
    } else {
      ({ questions, instrumentByQuestionId } =
        await this.getEligibleQuestionsForCategory(
          category!,
          categoryInstruments,
        ));
    }

    const dashboardQuestions: DashboardQuestionDto[] = [];
    for (const question of questions) {
      dashboardQuestions.push(
        await this.aggregateQuestion(
          question,
          filters,
          responseFilters,
          instrumentByQuestionId.get(question.questionId),
        ),
      );
    }

    return { metadata, suppressed: false, questions: dashboardQuestions };
  }

  /**
   * D2 (spec 43): agrega las preguntas elegibles de todos los instrumentos
   * activos de la categoría, respetando el filtro por sección (D1) por
   * instrumento, y deduplicando por questionId (defensivo — no debería haber
   * solapamiento si las secciones por categoría son disjuntas).
   */
  private async getEligibleQuestionsForCategory(
    category: DashboardCategoryConfig,
    activeInstruments: Instrument[],
  ): Promise<{
    questions: Question[];
    instrumentByQuestionId: Map<string, Instrument>;
  }> {
    const mappingByCode = new Map(
      category.instruments.map((mapping) => [mapping.instrumentCode, mapping]),
    );

    const seen = new Set<string>();
    const questions: Question[] = [];
    const instrumentByQuestionId = new Map<string, Instrument>();

    for (const instrument of activeInstruments) {
      const mapping = instrument.code
        ? mappingByCode.get(instrument.code)
        : undefined;
      const instrumentQuestions = await this.getEligibleQuestions(
        instrument.instrumentId,
        mapping?.sectionNames,
      );
      for (const question of instrumentQuestions) {
        if (seen.has(question.questionId)) continue;
        seen.add(question.questionId);
        questions.push(question);
        instrumentByQuestionId.set(question.questionId, instrument);
      }
    }

    return { questions, instrumentByQuestionId };
  }

  private async validateFilters(filters: DashboardFiltersDto): Promise<{
    instrument: Instrument | null;
    category: DashboardCategoryConfig | null;
    categoryInstruments: Instrument[];
    departmentName?: string;
    townName?: string;
    cropName?: string;
    actorTypeName?: string;
  }> {
    if (filters.instrumentId && filters.categoryId) {
      throw new BadRequestException(
        'No se puede filtrar por instrumentId y categoryId al mismo tiempo.',
      );
    }

    let instrument: Instrument | null = null;

    if (filters.instrumentId) {
      instrument = await this.instrumentRepo.findOne({
        where: { instrumentId: filters.instrumentId },
      });
      if (!instrument) {
        throw new NotFoundException('Instrumento no encontrado.');
      }
    }

    let category: DashboardCategoryConfig | null = null;
    let categoryInstruments: Instrument[] = [];

    if (filters.categoryId) {
      category =
        DASHBOARD_CATEGORIES.find((c) => c.id === filters.categoryId) ?? null;
      if (!category) {
        throw new NotFoundException('Categoría no encontrada.');
      }
      const instrumentCodes = category.instruments.map(
        (mapping) => mapping.instrumentCode,
      );
      categoryInstruments = await this.instrumentRepo.find({
        where: { code: In(instrumentCodes), isActive: true },
      });
    }

    let departmentName: string | undefined;
    if (filters.departmentId) {
      const department = await this.departmentRepo.findOne({
        where: { departmentId: filters.departmentId },
      });
      if (!department)
        throw new NotFoundException('Departamento no encontrado.');
      departmentName = department.name;
    }

    let townName: string | undefined;
    if (filters.townId) {
      const town = await this.townRepo.findOne({
        where: { townId: filters.townId },
      });
      if (!town) throw new NotFoundException('Municipio no encontrado.');
      townName = town.name;
    }

    let cropName: string | undefined;
    if (filters.cropId) {
      const crop = await this.cropRepo.findOne({
        where: { cropId: filters.cropId },
      });
      if (!crop) throw new NotFoundException('Cultivo no encontrado.');
      cropName = crop.name;
    }

    let actorTypeName: string | undefined;
    if (filters.actorTypeId) {
      const actorType = await this.actorTypeRepo.findOne({
        where: { actorTypeId: filters.actorTypeId },
      });
      if (!actorType)
        throw new NotFoundException('Tipo de actor no encontrado.');
      actorTypeName = actorType.name;
    }

    return {
      instrument,
      category,
      categoryInstruments,
      departmentName,
      townName,
      cropName,
      actorTypeName,
    };
  }

  /**
   * Spec 43 (Fase 3, D3): resuelve, una sola vez por request, la pregunta
   * fuente de cada filtro global derivado de respuestas presente en
   * `filters`. Se resuelve por separado de `applySurveyFilters` (que se
   * llama muchas veces por request, una por pregunta agregada) para no
   * repetir estas consultas de catálogo en cada llamada.
   */
  private async resolveResponseFilters(
    filters: DashboardFiltersDto,
  ): Promise<ResolvedResponseFilters> {
    const present = RESPONSE_FILTER_SOURCES.filter(
      (source) => filters[source.key] !== undefined,
    );
    if (present.length === 0) return [];

    const resolved: ResolvedResponseFilter[] = [];

    for (const source of present) {
      const question = await this.resolveQuestionByLocator(source);

      if (!question) return 'impossible';

      if (source.matchType === 'range') {
        const bucket = filters[source.key] as AgeRangeBucket;
        resolved.push({
          key: source.key,
          questionId: question.questionId,
          matchType: 'range',
          range: AGE_RANGE_BOUNDS[bucket],
        });
      } else if (source.matchType === 'multiOption') {
        const optionTexts = (filters[source.key] as string)
          .split(',')
          .map((text) => text.trim())
          .filter(Boolean);
        resolved.push({
          key: source.key,
          questionId: question.questionId,
          matchType: 'multiOption',
          optionTexts,
        });
      } else {
        resolved.push({
          key: source.key,
          questionId: question.questionId,
          matchType: 'option',
          optionTexts: [(filters[source.key] as string).trim()],
        });
      }
    }

    return resolved;
  }

  /** Localiza una pregunta sin `systemField` dedicado por instrumento + texto exacto (D3). */
  private async findQuestionByInstrumentAndText(
    instrumentCode: string,
    text: string,
    opts: { withOptions?: boolean; withType?: boolean } = {},
  ): Promise<Question | null> {
    const qb = this.questionRepo
      .createQueryBuilder('question')
      .innerJoin('question.section', 'section')
      .innerJoin(
        'section.instrument',
        'instrument',
        'instrument.code = :instrumentCode',
        { instrumentCode },
      )
      .where('question.text = :text', { text });
    if (opts.withOptions) qb.leftJoinAndSelect('question.options', 'options');
    if (opts.withType) qb.leftJoinAndSelect('question.type', 'type');
    return qb.getOne();
  }

  /**
   * Spec 43 (Fase 4): resuelve un `QuestionLocator` (mismo tipo que usa
   * Fase 3 para los filtros) a su `Question`. `withOptions` precarga
   * `question.options` — necesaria para enumerar los cortes de
   * `getDigitalDemand` (educación/conectividad). `withType` precarga
   * `question.type` — necesaria cuando el KPI opera sobre single_choice o
   * multiple_choice indistintamente (`choiceAcceptedPercentage`,
   * `topChoiceOption`). Ninguna de las dos hace falta para las agregaciones
   * en sí (que resuelven opciones vía `response.option`, no vía esta relación).
   */
  private async resolveQuestionByLocator(
    locator: QuestionLocator,
    opts: { withOptions?: boolean; withType?: boolean } = {},
  ): Promise<Question | null> {
    if (locator.locate === 'systemField') {
      const relations: string[] = [];
      if (opts.withOptions) relations.push('options');
      if (opts.withType) relations.push('type');
      return this.questionRepo.findOne({
        where: { systemField: locator.systemField },
        relations: relations.length ? relations : undefined,
      });
    }
    return this.findQuestionByInstrumentAndText(
      locator.instrumentCode,
      locator.questionText,
      opts,
    );
  }

  /**
   * `undefined` cuando `filters.categoryId` no se pidió (sin filtro de
   * instrumento); un array — posiblemente vacío — cuando sí se pidió, para
   * que `applySurveyFilters` distinga "sin categoría" de "categoría sin
   * instrumentos activos hoy" (ver nota en `applySurveyFilters`).
   */
  private resolveCategoryInstrumentIds(
    filters: DashboardFiltersDto,
    categoryInstruments: Instrument[],
  ): string[] | undefined {
    if (!filters.categoryId) return undefined;
    return categoryInstruments.map((i) => i.instrumentId);
  }

  /**
   * D10: instrumentId se resuelve vía INNER JOIN a surveys_instruments
   * (relación ManyToMany). `categoryInstrumentIds` (spec 43, D2) aplica el
   * mismo JOIN pero con IN (...) — el conjunto de instrumentos activos de la
   * categoría — y solo cuando no hay instrumentId (mutuamente excluyentes,
   * validado en `validateFilters`).
   *
   * `categoryInstrumentIds` es `undefined` cuando no se pidió `categoryId`
   * (no se aplica ningún filtro de instrumento) y es un array (posiblemente
   * vacío) cuando sí se pidió: si la categoría no tiene instrumentos activos
   * hoy, el array vacío fuerza cero resultados (`1 = 0`) — de lo contrario la
   * consulta caería de nuevo a "todas las encuestas", que es incorrecto para
   * una categoría sin datos, no equivalente a "sin filtro".
   */
  private applySurveyFilters<T extends object>(
    qb: SelectQueryBuilder<T>,
    filters: DashboardFiltersDto,
    categoryInstrumentIds?: string[],
    responseFilters: ResolvedResponseFilters = [],
  ): void {
    if (filters.instrumentId) {
      qb.innerJoin(
        'survey.instruments',
        'instrument',
        'instrument.instrumentId = :instrumentId',
        { instrumentId: filters.instrumentId },
      );
    } else if (categoryInstrumentIds !== undefined) {
      if (categoryInstrumentIds.length) {
        qb.innerJoin(
          'survey.instruments',
          'instrument',
          'instrument.instrumentId IN (:...categoryInstrumentIds)',
          { categoryInstrumentIds },
        );
      } else {
        qb.andWhere('1 = 0');
      }
    }
    if (filters.departmentId) {
      qb.andWhere('survey.department = :departmentId', {
        departmentId: filters.departmentId,
      });
    }
    if (filters.townId) {
      qb.andWhere('survey.town = :townId', { townId: filters.townId });
    }
    if (filters.cropId) {
      qb.andWhere('survey.crop = :cropId', { cropId: filters.cropId });
    }
    if (filters.actorTypeId) {
      qb.andWhere('survey.actorType = :actorTypeId', {
        actorTypeId: filters.actorTypeId,
      });
    }
    if (filters.campaignId) {
      qb.innerJoin(
        'survey.campaignSession',
        'campaignSession',
        'campaignSession.campaign = :campaignId',
        { campaignId: filters.campaignId },
      );
    }
    if (filters.dateFrom) {
      qb.andWhere('survey.createdAt >= :dateFrom', {
        dateFrom: new Date(filters.dateFrom),
      });
    }
    if (filters.dateTo) {
      // Límite superior exclusivo del día siguiente: dateTo es inclusivo del
      // día calendario completo, no solo de su medianoche.
      const dateToExclusive = new Date(filters.dateTo);
      dateToExclusive.setDate(dateToExclusive.getDate() + 1);
      qb.andWhere('survey.createdAt < :dateToExclusive', { dateToExclusive });
    }

    this.applyResponseFilters(qb, responseFilters);
  }

  /**
   * Spec 43 (Fase 3, D3): aplica los filtros globales ya resueltos por
   * `resolveResponseFilters` como subconsultas independientes sobre
   * `responses` — una por filtro presente, unidas por AND entre filtros
   * distintos y por OR entre los valores de un mismo filtro múltiple
   * (`multiOption`). `'impossible'` fuerza cero resultados: al menos un
   * filtro solicitado no tiene pregunta fuente en esta base.
   */
  private applyResponseFilters<T extends object>(
    qb: SelectQueryBuilder<T>,
    responseFilters: ResolvedResponseFilters,
  ): void {
    if (responseFilters === 'impossible') {
      qb.andWhere('1 = 0');
      return;
    }

    responseFilters.forEach((filter, index) => {
      const questionParam = `respFilter${index}QuestionId`;

      if (filter.matchType === 'range') {
        const { min, max } = filter.range ?? {};
        const conditions = ['r.question_id = :' + questionParam];
        const params: Record<string, unknown> = {
          [questionParam]: filter.questionId,
        };
        if (min !== undefined) {
          const minParam = `respFilter${index}Min`;
          conditions.push(`r.numeric_value >= :${minParam}`);
          params[minParam] = min;
        }
        if (max !== undefined) {
          const maxParam = `respFilter${index}Max`;
          conditions.push(`r.numeric_value < :${maxParam}`);
          params[maxParam] = max;
        }
        qb.andWhere(
          `survey.surveyId IN (SELECT r.survey_id FROM responses r WHERE ${conditions.join(' AND ')})`,
          params,
        );
      } else {
        const optionsParam = `respFilter${index}Options`;
        qb.andWhere(
          `survey.surveyId IN (SELECT r.survey_id FROM responses r INNER JOIN options_question o ON o.option_id = r.option_id WHERE r.question_id = :${questionParam} AND o.text IN (:...${optionsParam}))`,
          {
            [questionParam]: filter.questionId,
            [optionsParam]: filter.optionTexts ?? [],
          },
        );
      }
    });
  }

  private buildFilteredSurveyQuery(
    filters: DashboardFiltersDto,
    categoryInstrumentIds?: string[],
    responseFilters: ResolvedResponseFilters = [],
  ): SelectQueryBuilder<Survey> {
    const qb = this.surveyRepo
      .createQueryBuilder('survey')
      .where('survey.sincronized = true');
    this.applySurveyFilters(
      qb,
      filters,
      categoryInstrumentIds,
      responseFilters,
    );
    return qb;
  }

  private async getDateRange(
    filters: DashboardFiltersDto,
    categoryInstrumentIds?: string[],
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<{ from: string; to: string } | null> {
    const raw = await this.buildFilteredSurveyQuery(
      filters,
      categoryInstrumentIds,
      responseFilters,
    )
      .select('MIN(survey.createdAt)', 'from')
      .addSelect('MAX(survey.createdAt)', 'to')
      .getRawOne<{ from: string | null; to: string | null }>();

    if (!raw?.from || !raw?.to) return null;

    return {
      from: new Date(raw.from).toISOString(),
      to: new Date(raw.to).toISOString(),
    };
  }

  private buildResponseBaseQuery(
    questionId: string,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters = [],
  ): SelectQueryBuilder<Response> {
    const qb = this.responseRepo
      .createQueryBuilder('response')
      .innerJoin('response.survey', 'survey')
      .where('response.question = :questionId', { questionId })
      .andWhere('survey.sincronized = true');
    this.applySurveyFilters(qb, filters, undefined, responseFilters);
    return qb;
  }

  /**
   * D6: exclusión por tipo no visualizable + denylist explícita de
   * systemField (no un blanket "farm.*"). `sectionNames` (spec 43, D1)
   * restringe la agregación a ciertas secciones del instrumento — necesario
   * para instrumentos que aportan a más de una categoría (ver S1a → C1/C2 en
   * `dashboard-categories.config.ts`).
   */
  private async getEligibleQuestions(
    instrumentId: string,
    sectionNames?: string[],
  ): Promise<Question[]> {
    const qb = this.questionRepo
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.section', 'section')
      .innerJoin(
        'section.instrument',
        'instrument',
        'instrument.instrumentId = :instrumentId',
        { instrumentId },
      )
      .leftJoinAndSelect('question.type', 'type')
      .leftJoinAndSelect('question.options', 'options')
      .where('type.name NOT IN (:...excludedTypes)', {
        excludedTypes: EXCLUDED_QUESTION_TYPES,
      })
      .andWhere(
        '(question.systemField IS NULL OR question.systemField NOT IN (:...deniedFields))',
        { deniedFields: DENIED_SYSTEM_FIELDS },
      );

    if (sectionNames?.length) {
      qb.andWhere('section.name IN (:...sectionNames)', { sectionNames });
    }

    return qb
      .orderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .getMany();
  }

  /**
   * Fase 1 (Spec 43): catálogo de categorías con instrumentos activos y
   * conteo de preguntas visualizables. D1: catálogo estático → instrumentos
   * activos → secciones → preguntas, reutilizando `getEligibleQuestions`.
   */
  async getCategories(): Promise<DashboardCategoryDto[]> {
    const results: DashboardCategoryDto[] = [];

    for (const category of DASHBOARD_CATEGORIES) {
      const instrumentCodes = category.instruments.map(
        (mapping) => mapping.instrumentCode,
      );
      const mappingByCode = new Map(
        category.instruments.map((mapping) => [
          mapping.instrumentCode,
          mapping,
        ]),
      );

      const activeInstruments = await this.instrumentRepo.find({
        where: { code: In(instrumentCodes), isActive: true },
      });

      let questionCount = 0;
      for (const instrument of activeInstruments) {
        const mapping = instrument.code
          ? mappingByCode.get(instrument.code)
          : undefined;
        const questions = await this.getEligibleQuestions(
          instrument.instrumentId,
          mapping?.sectionNames,
        );
        questionCount += questions.length;
      }

      results.push({
        id: category.id,
        code: category.code,
        name: category.name,
        instrumentCount: activeInstruments.length,
        questionCount,
      });
    }

    return results;
  }

  private async aggregateQuestion(
    question: Question,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters = [],
    instrument?: Instrument,
  ): Promise<DashboardQuestionDto> {
    const typeName = question.type.name;
    const isInverted = (question.systemField ?? '').startsWith('inverted:');

    const answeredCount = await this.countAnswered(
      question,
      typeName,
      filters,
      responseFilters,
    );

    const base = {
      questionId: question.questionId,
      questionText: question.text,
      questionType: typeName,
      sectionName: question.section.name,
      systemField: question.systemField ?? null,
      isInverted,
      answeredCount,
      // D9 (spec 43, Fase 7): procedencia por pregunta — necesaria para que
      // una vista de categoría (que agrega varios instrumentos) pueda
      // etiquetar de dónde viene cada tarjeta.
      instrumentId: instrument?.instrumentId,
      instrumentName: instrument?.name,
    };

    if (answeredCount < MIN_SAMPLE_THRESHOLD) {
      return { ...base, suppressed: true, aggregation: null };
    }

    const aggregation = await this.buildAggregation(
      question,
      typeName,
      filters,
      isInverted,
      answeredCount,
      responseFilters,
    );

    return { ...base, suppressed: false, aggregation };
  }

  private async countAnswered(
    question: Question,
    typeName: string,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<number> {
    const qb = this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    );

    if (typeName === 'numeric') {
      qb.andWhere('response.numericValue IS NOT NULL');
    } else if (typeName === 'yes_no') {
      qb.andWhere('response.booleanValue IS NOT NULL');
    } else {
      qb.andWhere('response.option IS NOT NULL');
    }

    // D9: para multiple_choice el denominador es el número de respondentes (encuestas),
    // no el número de filas de respuesta (una por opción marcada).
    if (typeName === 'multiple_choice') {
      const raw = await qb
        .select('COUNT(DISTINCT response.survey)', 'count')
        .getRawOne<{ count: string }>();
      return Number(raw?.count ?? 0);
    }

    return qb.getCount();
  }

  private async buildAggregation(
    question: Question,
    typeName: string,
    filters: DashboardFiltersDto,
    isInverted: boolean,
    answeredCount: number,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<DashboardAggregation> {
    switch (typeName) {
      case 'yes_no':
        return this.aggregateYesNo(
          question,
          filters,
          answeredCount,
          responseFilters,
        );
      case 'numeric':
        return this.aggregateNumeric(
          question,
          filters,
          answeredCount,
          responseFilters,
        );
      case 'likert':
        return this.aggregateLikert(
          question,
          filters,
          isInverted,
          answeredCount,
          responseFilters,
        );
      case 'single_choice':
      case 'multiple_choice':
      case 'compliance':
        return this.aggregateChoices(
          question,
          filters,
          typeName,
          answeredCount,
          responseFilters,
        );
      default:
        throw new Error(`Tipo de pregunta no soportado: ${typeName}`);
    }
  }

  private async aggregateYesNo(
    question: Question,
    filters: DashboardFiltersDto,
    answeredCount: number,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<AggregationYesNoDto> {
    const raw = await this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    )
      .andWhere('response.booleanValue = true')
      .getCount();

    const yesCount = raw;
    const noCount = answeredCount - yesCount;

    return {
      type: 'yes_no',
      yesCount,
      noCount,
      yesPercentage: round2((yesCount / answeredCount) * 100),
      noPercentage: round2((noCount / answeredCount) * 100),
    };
  }

  private async aggregateChoices(
    question: Question,
    filters: DashboardFiltersDto,
    typeName: string,
    answeredCount: number,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<AggregationChoicesDto> {
    const countExpression =
      typeName === 'multiple_choice'
        ? 'COUNT(DISTINCT response.survey)'
        : 'COUNT(response.responseId)';

    const rows = await this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    )
      .innerJoin('response.option', 'option')
      .select('option.optionId', 'optionId')
      .addSelect('option.text', 'text')
      .addSelect('option.value', 'value')
      .addSelect(countExpression, 'count')
      .groupBy('option.optionId')
      .addGroupBy('option.text')
      .addGroupBy('option.value')
      .getRawMany<{
        optionId: string;
        text: string;
        value: string | null;
        count: string;
      }>();

    const options = rows
      .map((row) => ({
        optionId: row.optionId,
        text: row.text,
        value: row.value !== null ? Number(row.value) : null,
        count: Number(row.count),
        percentage: round2((Number(row.count) / answeredCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      type: typeName as 'single_choice' | 'multiple_choice' | 'compliance',
      options,
    };
  }

  /** D8: media de acuerdo (1-5) usando OptionQuestion.value; castea text si no hay value;
   * invierte (6 - value) si el ítem tiene systemField "inverted:...". */
  private async aggregateLikert(
    question: Question,
    filters: DashboardFiltersDto,
    isInverted: boolean,
    answeredCount: number,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<AggregationLikertDto> {
    const rows = await this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    )
      .innerJoin('response.option', 'option')
      .select('option.optionId', 'optionId')
      .addSelect('option.text', 'text')
      .addSelect('option.value', 'value')
      .addSelect('COUNT(response.responseId)', 'count')
      .groupBy('option.optionId')
      .addGroupBy('option.text')
      .addGroupBy('option.value')
      .getRawMany<{
        optionId: string;
        text: string;
        value: string | null;
        count: string;
      }>();

    let weightedSum = 0;
    let scoredCount = 0;

    const options = rows.map((row) => {
      const rawValue =
        row.value !== null ? Number(row.value) : parseFloat(row.text);
      const count = Number(row.count);
      const hasScore = Number.isFinite(rawValue);

      if (hasScore) {
        const score = isInverted ? 6 - rawValue : rawValue;
        weightedSum += score * count;
        scoredCount += count;
      }

      return {
        optionId: row.optionId,
        text: row.text,
        value: hasScore ? rawValue : null,
        count,
        percentage: round2((count / answeredCount) * 100),
      };
    });

    options.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

    return {
      type: 'likert',
      options,
      meanScore: scoredCount > 0 ? round2(weightedSum / scoredCount) : null,
      isInverted,
    };
  }

  private async aggregateNumeric(
    question: Question,
    filters: DashboardFiltersDto,
    answeredCount: number,
    responseFilters: ResolvedResponseFilters = [],
  ): Promise<AggregationNumericDto> {
    const stats = await this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    )
      .andWhere('response.numericValue IS NOT NULL')
      .select('AVG(response.numericValue)', 'average')
      .addSelect(
        'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response.numericValue)',
        'median',
      )
      .addSelect(
        'PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY response.numericValue)',
        'q1',
      )
      .addSelect(
        'PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY response.numericValue)',
        'q3',
      )
      .addSelect('MIN(response.numericValue)', 'min')
      .addSelect('MAX(response.numericValue)', 'max')
      .addSelect('STDDEV(response.numericValue)', 'stdDev')
      .getRawOne<Record<string, string | null>>();

    let distribution: number[] | undefined;

    // D7: el array de valores crudos solo se expone si la muestra supera el umbral de privacidad.
    if (answeredCount >= MIN_SAMPLE_THRESHOLD) {
      const valueRows = await this.buildResponseBaseQuery(
        question.questionId,
        filters,
        responseFilters,
      )
        .andWhere('response.numericValue IS NOT NULL')
        .select('response.numericValue', 'value')
        .getRawMany<{ value: string }>();
      distribution = valueRows.map((row) => Number(row.value));
    }

    return {
      type: 'numeric',
      count: answeredCount,
      average: toNumberOrNull(stats?.average),
      median: toNumberOrNull(stats?.median),
      q1: toNumberOrNull(stats?.q1),
      q3: toNumberOrNull(stats?.q3),
      min: toNumberOrNull(stats?.min),
      max: toNumberOrNull(stats?.max),
      stdDev: toNumberOrNull(stats?.stdDev),
      distribution,
    };
  }

  // ─────────────────────────── Fase 4 (spec 43) ───────────────────────────

  /**
   * D5: tira de KPIs curados. Solo existen dos vistas curadas en el diseño
   * (`categoryId=C15` → `C15_KPIS`; cualquier otro caso, incluida la vista
   * de resumen general, → `OVERVIEW_KPIS`). `instrumentId`/`categoryId` se
   * descartan de los filtros reales de cada KPI (cada uno ya declara su
   * propia pregunta fuente — igual que `getOverview`, D2) y solo se usa
   * `categoryId` para elegir qué catálogo de KPIs devolver.
   */
  async getKpis(filters: DashboardFiltersDto): Promise<DashboardKpiDto[]> {
    const { categoryId, instrumentId: _instrumentId, ...rest } = filters;
    await this.validateFilters(rest);
    const responseFilters = await this.resolveResponseFilters(rest);
    const definitions = categoryId === 'C15' ? C15_KPIS : OVERVIEW_KPIS;

    const kpis: DashboardKpiDto[] = [];
    for (const definition of definitions) {
      kpis.push(await this.computeKpi(definition, rest, responseFilters));
    }
    return kpis;
  }

  private async computeKpi(
    definition: KpiDefinition,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<DashboardKpiDto> {
    const base = {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
    };
    const operation = definition.operation;

    switch (operation.type) {
      case 'acceptanceIndex': {
        const { acceptanceIndex } = await this.computeAcceptanceConsolidation(
          filters,
          responseFilters,
        );
        return {
          ...base,
          value: acceptanceIndex,
          suppressed: acceptanceIndex === null,
        };
      }

      case 'distinctFarmerCount': {
        const value = await this.countDistinctFarmers(filters, responseFilters);
        return { ...base, value, suppressed: value < MIN_SAMPLE_THRESHOLD };
      }

      case 'distinctFarmCount': {
        const value = await this.countDistinctFarms(filters, responseFilters);
        return { ...base, value, suppressed: value < MIN_SAMPLE_THRESHOLD };
      }

      case 'instrumentCatalog': {
        const value = await this.instrumentRepo.count({
          where: { isActive: true },
        });
        return { ...base, value, suppressed: false };
      }

      case 'yesPercentage': {
        const question = await this.resolveQuestionByLocator(operation.source);
        if (!question) return { ...base, value: null, suppressed: true };
        const answeredCount = await this.countAnswered(
          question,
          'yes_no',
          filters,
          responseFilters,
        );
        if (answeredCount < MIN_SAMPLE_THRESHOLD) {
          return { ...base, value: null, suppressed: true };
        }
        const aggregation = await this.aggregateYesNo(
          question,
          filters,
          answeredCount,
          responseFilters,
        );
        return { ...base, value: aggregation.yesPercentage, suppressed: false };
      }

      case 'likertAgreePercentage': {
        const question = await this.resolveQuestionByLocator(operation.source);
        if (!question) return { ...base, value: null, suppressed: true };
        const answeredCount = await this.countAnswered(
          question,
          'likert',
          filters,
          responseFilters,
        );
        if (answeredCount < MIN_SAMPLE_THRESHOLD) {
          return { ...base, value: null, suppressed: true };
        }
        const isInverted = (question.systemField ?? '').startsWith('inverted:');
        const agreeCount = await this.countLikertAtOrAbove(
          question,
          filters,
          responseFilters,
          operation.minScore,
          isInverted,
        );
        return {
          ...base,
          value: round2((agreeCount / answeredCount) * 100),
          suppressed: false,
        };
      }

      case 'choiceAcceptedPercentage': {
        const question = await this.resolveQuestionByLocator(operation.source, {
          withType: true,
        });
        if (!question) return { ...base, value: null, suppressed: true };
        const typeName = question.type.name;
        const answeredCount = await this.countAnswered(
          question,
          typeName,
          filters,
          responseFilters,
        );
        if (answeredCount < MIN_SAMPLE_THRESHOLD) {
          return { ...base, value: null, suppressed: true };
        }
        const acceptedCount = await this.buildResponseBaseQuery(
          question.questionId,
          filters,
          responseFilters,
        )
          .innerJoin('response.option', 'option')
          .andWhere('option.text IN (:...acceptedOptionTexts)', {
            acceptedOptionTexts: operation.acceptedOptionTexts,
          })
          .getCount();
        return {
          ...base,
          value: round2((acceptedCount / answeredCount) * 100),
          suppressed: false,
        };
      }

      case 'topChoiceOption': {
        const question = await this.resolveQuestionByLocator(operation.source, {
          withType: true,
        });
        if (!question) return { ...base, value: null, suppressed: true };
        const typeName = question.type.name;
        const answeredCount = await this.countAnswered(
          question,
          typeName,
          filters,
          responseFilters,
        );
        if (answeredCount < MIN_SAMPLE_THRESHOLD) {
          return { ...base, value: null, suppressed: true };
        }
        const aggregation = await this.aggregateChoices(
          question,
          filters,
          typeName,
          answeredCount,
          responseFilters,
        );
        const top = aggregation.options[0] as
          | { text: string; percentage: number }
          | undefined;
        return {
          ...base,
          value: top?.percentage ?? null,
          optionText: top?.text ?? null,
          suppressed: !top,
        };
      }

      default:
        throw new Error(
          `Operación de KPI no soportada: ${(operation as { type: string }).type}`,
        );
    }
  }

  /** % de respuestas likert con puntaje (ya invertido si aplica) >= minScore. */
  private async countLikertAtOrAbove(
    question: Question,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
    minScore: number,
    isInverted: boolean,
  ): Promise<number> {
    return this.buildResponseBaseQuery(
      question.questionId,
      filters,
      responseFilters,
    )
      .innerJoin('response.option', 'option')
      .andWhere(
        isInverted
          ? '(6 - option.value) >= :minScore'
          : 'option.value >= :minScore',
        { minScore },
      )
      .getCount();
  }

  private async countDistinctFarmers(
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<number> {
    const raw = await this.buildFilteredSurveyQuery(
      filters,
      undefined,
      responseFilters,
    )
      .andWhere('survey.farmer IS NOT NULL')
      .select('COUNT(DISTINCT survey.farmer)', 'count')
      .getRawOne<{ count: string }>();
    return Number(raw?.count ?? 0);
  }

  private async countDistinctFarms(
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<number> {
    const raw = await this.buildFilteredSurveyQuery(
      filters,
      undefined,
      responseFilters,
    )
      .innerJoin('survey.farmer', 'farmerForFarmCount')
      .andWhere('farmerForFarmCount.farm IS NOT NULL')
      .select('COUNT(DISTINCT farmerForFarmCount.farm)', 'count')
      .getRawOne<{ count: string }>();
    return Number(raw?.count ?? 0);
  }

  /** Preguntas Likert ★ (D4): todo instrumento, `systemField` = tag estratégico. */
  private async getStrategicLikertQuestions(): Promise<Question[]> {
    return this.questionRepo
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.section', 'section')
      .innerJoin('question.type', 'type')
      .where('type.name = :typeName', { typeName: 'likert' })
      .andWhere('question.systemField = :systemField', {
        systemField: DIGITAL_DEMAND_SOURCES.strategicSystemField,
      })
      .orderBy('question.order', 'ASC')
      .getMany();
  }

  /**
   * D4: consolida todos los ítems Likert ★ de la muestra filtrada — media
   * de acuerdo por ítem (reutilizando `aggregateLikert`, con inversión si
   * aplica) y el índice global (promedio de esas medias). Los ítems sin
   * muestra suficiente se excluyen del ranking, no se muestran con media
   * null (no se puede ordenar por null). Reutilizado por el KPI "Índice de
   * aceptación" y por `getDigitalDemand` (ranking + cortes).
   */
  private async computeAcceptanceConsolidation(
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<{
    acceptanceIndex: number | null;
    items: LikertRankingItemDto[];
  }> {
    const questions = await this.getStrategicLikertQuestions();
    const meansByQuestion = await this.batchAggregateLikertMeans(
      questions,
      filters,
      responseFilters,
    );

    const items: LikertRankingItemDto[] = [];
    for (const question of questions) {
      const result = meansByQuestion.get(question.questionId);
      if (!result) continue;
      items.push({
        questionId: question.questionId,
        questionText: question.text,
        sectionName: question.section.name,
        meanScore: result.meanScore,
        bands: result.bands,
        answeredCount: result.answeredCount,
      });
    }

    items.sort((a, b) => b.meanScore - a.meanScore);

    const acceptanceIndex = items.length
      ? round2(
          items.reduce((sum, item) => sum + item.meanScore, 0) / items.length,
        )
      : null;

    return { acceptanceIndex, items };
  }

  /**
   * Performance (hallazgo de verificación, spec 43 Fase 4): `computeIndexByCut`
   * llama a esta consolidación una vez **por valor de corte** (hasta 16 en total
   * entre edad/educación/conectividad). Resolverla pregunta por pregunta —como
   * hacía la primera versión, reutilizando `countAnswered`+`aggregateLikert`—
   * multiplicaba ~130 preguntas ★ × 16 cortes en consultas secuenciales
   * (~4.000) y tardó más de 120 s contra la base de desarrollo (túnel SSH a
   * `mirp-lab`). Esta versión resuelve **todas** las preguntas ★ en una sola
   * consulta agrupada por `(question_id, option_id)` — 2 consultas totales por
   * corte en vez de ~260 — reimplementando el cálculo de `aggregateLikert`
   * (media ponderada + inversión) sobre el resultado agrupado; si esa fórmula
   * cambia, actualizar también aquí.
   */
  private async batchAggregateLikertMeans(
    questions: Question[],
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<
    Map<
      string,
      {
        meanScore: number;
        bands: AggregationOptionDto[];
        answeredCount: number;
      }
    >
  > {
    const result = new Map<
      string,
      {
        meanScore: number;
        bands: AggregationOptionDto[];
        answeredCount: number;
      }
    >();
    if (questions.length === 0) return result;

    const questionIds = questions.map((question) => question.questionId);
    const qb = this.responseRepo
      .createQueryBuilder('response')
      .innerJoin('response.survey', 'survey')
      .innerJoin('response.option', 'option')
      .where('response.question IN (:...questionIds)', { questionIds })
      .andWhere('survey.sincronized = true');
    this.applySurveyFilters(qb, filters, undefined, responseFilters);

    const rows = await qb
      .select('response.question', 'questionId')
      .addSelect('option.optionId', 'optionId')
      .addSelect('option.text', 'text')
      .addSelect('option.value', 'value')
      .addSelect('COUNT(response.responseId)', 'count')
      .groupBy('response.question')
      .addGroupBy('option.optionId')
      .addGroupBy('option.text')
      .addGroupBy('option.value')
      .getRawMany<{
        questionId: string;
        optionId: string;
        text: string;
        value: string | null;
        count: string;
      }>();

    const rowsByQuestion = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = rowsByQuestion.get(row.questionId) ?? [];
      list.push(row);
      rowsByQuestion.set(row.questionId, list);
    }

    for (const question of questions) {
      const questionRows = rowsByQuestion.get(question.questionId) ?? [];
      const answeredCount = questionRows.reduce(
        (sum, row) => sum + Number(row.count),
        0,
      );
      if (answeredCount < MIN_SAMPLE_THRESHOLD) continue;

      const isInverted = (question.systemField ?? '').startsWith('inverted:');
      let weightedSum = 0;
      let scoredCount = 0;

      const bands = questionRows
        .map((row) => {
          const rawValue =
            row.value !== null ? Number(row.value) : parseFloat(row.text);
          const count = Number(row.count);
          const hasScore = Number.isFinite(rawValue);
          if (hasScore) {
            const score = isInverted ? 6 - rawValue : rawValue;
            weightedSum += score * count;
            scoredCount += count;
          }
          return {
            optionId: row.optionId,
            text: row.text,
            value: hasScore ? rawValue : null,
            count,
            percentage: round2((count / answeredCount) * 100),
          };
        })
        .sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

      const meanScore =
        scoredCount > 0 ? round2(weightedSum / scoredCount) : null;
      if (meanScore === null) continue;

      result.set(question.questionId, { meanScore, bands, answeredCount });
    }

    return result;
  }

  /**
   * Cortes del índice de aceptación (D4): recalcula `computeAcceptanceConsolidation`
   * fijando el filtro global correspondiente a cada valor del corte, reaplicando el
   * resto de filtros ya activos (spec 43, D3/D4). `'impossible'` en la resolución de
   * un corte puntual (no debería ocurrir si el corte usa una fuente ya validada,
   * pero se maneja igual que en cualquier otro filtro) se traduce en "sin datos".
   */
  private async computeIndexByCut(
    baseFilters: DashboardFiltersDto,
    filterKey: 'ageRange' | 'educationLevel' | 'connectivity',
    buckets: string[],
  ): Promise<IndexByCutBucketDto[]> {
    const results: IndexByCutBucketDto[] = [];

    for (const bucket of buckets) {
      const cutFilters: DashboardFiltersDto = {
        ...baseFilters,
        [filterKey]: bucket,
      };
      const cutResponseFilters = await this.resolveResponseFilters(cutFilters);
      const acceptanceIndex =
        cutResponseFilters === 'impossible'
          ? null
          : (
              await this.computeAcceptanceConsolidation(
                cutFilters,
                cutResponseFilters,
              )
            ).acceptanceIndex;

      results.push({
        label: bucket,
        meanScore: acceptanceIndex,
        suppressed: acceptanceIndex === null,
      });
    }

    return results;
  }

  private async computeIndexByEducationCut(
    baseFilters: DashboardFiltersDto,
  ): Promise<IndexByCutBucketDto[]> {
    const question = await this.resolveQuestionByLocator(
      DIGITAL_DEMAND_SOURCES.cutSources.education,
      { withOptions: true },
    );
    if (!question) return [];
    const buckets = [...new Set(question.options.map((option) => option.text))];
    return this.computeIndexByCut(baseFilters, 'educationLevel', buckets);
  }

  private async computeIndexByConnectivityCut(
    baseFilters: DashboardFiltersDto,
  ): Promise<IndexByCutBucketDto[]> {
    const question = await this.resolveQuestionByLocator(
      DIGITAL_DEMAND_SOURCES.cutSources.connectivity,
      { withOptions: true },
    );
    if (!question) return [];
    const buckets = [...new Set(question.options.map((option) => option.text))];
    return this.computeIndexByCut(baseFilters, 'connectivity', buckets);
  }

  /** Radar de barreras S_DCU (B1/B2/B3): media de las medias Likert de cada sección. */
  private async computeBarriersRadar(
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<BarriersRadarDto> {
    const [b1, b2, b3] = await Promise.all([
      this.computeBarrierSectionMean(
        DIGITAL_DEMAND_SOURCES.barrierSections.b1,
        filters,
        responseFilters,
      ),
      this.computeBarrierSectionMean(
        DIGITAL_DEMAND_SOURCES.barrierSections.b2,
        filters,
        responseFilters,
      ),
      this.computeBarrierSectionMean(
        DIGITAL_DEMAND_SOURCES.barrierSections.b3,
        filters,
        responseFilters,
      ),
    ]);
    return { b1, b2, b3 };
  }

  private async computeBarrierSectionMean(
    sectionName: string,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<number | null> {
    const questions = await this.questionRepo
      .createQueryBuilder('question')
      .innerJoin('question.section', 'section')
      .innerJoin(
        'section.instrument',
        'instrument',
        'instrument.code = :instrumentCode',
        { instrumentCode: DIGITAL_DEMAND_SOURCES.sDcuInstrumentCode },
      )
      .innerJoin('question.type', 'type')
      .where('type.name = :typeName', { typeName: 'likert' })
      .andWhere('section.name = :sectionName', { sectionName })
      .getMany();

    const means: number[] = [];
    for (const question of questions) {
      const answeredCount = await this.countAnswered(
        question,
        'likert',
        filters,
        responseFilters,
      );
      if (answeredCount < MIN_SAMPLE_THRESHOLD) continue;

      const isInverted = (question.systemField ?? '').startsWith('inverted:');
      const aggregation = await this.aggregateLikert(
        question,
        filters,
        isInverted,
        answeredCount,
        responseFilters,
      );
      if (aggregation.meanScore !== null) means.push(aggregation.meanScore);
    }

    return means.length
      ? round2(means.reduce((sum, mean) => sum + mean, 0) / means.length)
      : null;
  }

  private async computeInstitutionTrust(
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<InstitutionTrustItemDto[]> {
    const questions = await this.questionRepo
      .createQueryBuilder('question')
      .innerJoin('question.section', 'section')
      .innerJoin(
        'section.instrument',
        'instrument',
        'instrument.code = :instrumentCode',
        { instrumentCode: DIGITAL_DEMAND_SOURCES.sDcuInstrumentCode },
      )
      .where('section.name = :sectionName', {
        sectionName: DIGITAL_DEMAND_SOURCES.institutionTrustSection,
      })
      .orderBy('question.order', 'ASC')
      .getMany();

    const items: InstitutionTrustItemDto[] = [];
    for (const question of questions) {
      const answeredCount = await this.countAnswered(
        question,
        'likert',
        filters,
        responseFilters,
      );
      if (answeredCount < MIN_SAMPLE_THRESHOLD) {
        items.push({
          questionId: question.questionId,
          label: question.text,
          meanScore: null,
          bands: [],
          suppressed: true,
        });
        continue;
      }

      const isInverted = (question.systemField ?? '').startsWith('inverted:');
      const aggregation = await this.aggregateLikert(
        question,
        filters,
        isInverted,
        answeredCount,
        responseFilters,
      );
      items.push({
        questionId: question.questionId,
        label: question.text,
        meanScore: aggregation.meanScore,
        bands: aggregation.options,
        suppressed: false,
      });
    }

    return items;
  }

  /** Agregación de una pregunta de selección (única o múltiple) localizada por `QuestionLocator`. */
  private async aggregateChoicesByLocator(
    locator: QuestionLocator,
    filters: DashboardFiltersDto,
    responseFilters: ResolvedResponseFilters,
  ): Promise<AggregationOptionDto[]> {
    const question = await this.resolveQuestionByLocator(locator, {
      withType: true,
    });
    if (!question) return [];

    const typeName = question.type.name;
    const answeredCount = await this.countAnswered(
      question,
      typeName,
      filters,
      responseFilters,
    );
    if (answeredCount < MIN_SAMPLE_THRESHOLD) return [];

    const aggregation = await this.aggregateChoices(
      question,
      filters,
      typeName,
      answeredCount,
      responseFilters,
    );
    return aggregation.options;
  }

  /**
   * D4: vista consolidada "Demanda digital" (C15). `instrumentId`/`categoryId`
   * se descartan de los filtros reales (esta consolidación siempre cruza los
   * mismos instrumentos — S_DCU, S11 y las baterías ★ transversales — nunca
   * "otro" instrumento; mismo criterio D2 que `getOverview`/`getKpis`).
   */
  async getDigitalDemand(
    filters: DashboardFiltersDto,
  ): Promise<DashboardDigitalDemandDto> {
    const {
      categoryId: _categoryId,
      instrumentId: _instrumentId,
      ...rest
    } = filters;
    await this.validateFilters(rest);
    const responseFilters = await this.resolveResponseFilters(rest);

    const totalCount = await this.buildFilteredSurveyQuery(
      rest,
      undefined,
      responseFilters,
    ).getCount();

    if (totalCount < MIN_SAMPLE_THRESHOLD) {
      return {
        suppressed: true,
        reason: `La muestra de encuestas con estos filtros es insuficiente para mostrar datos (${totalCount} encuestas, se requieren al menos ${MIN_SAMPLE_THRESHOLD}).`,
        acceptanceIndex: null,
        likertRanking: [],
        indexByCut: { age: [], education: [], connectivity: [] },
        barriersRadar: { b1: null, b2: null, b3: null },
        adoptionBarriers: [],
        institutionTrust: [],
        digitalSkills: [],
        platforms: [],
        preferredChannel: [],
      };
    }

    const [
      { acceptanceIndex, items: likertRanking },
      indexByAge,
      indexByEducation,
      indexByConnectivity,
      barriersRadar,
      adoptionBarriers,
      institutionTrust,
      digitalSkills,
      platforms,
      preferredChannel,
    ] = await Promise.all([
      this.computeAcceptanceConsolidation(rest, responseFilters),
      this.computeIndexByCut(rest, 'ageRange', [...AGE_RANGE_BUCKETS]),
      this.computeIndexByEducationCut(rest),
      this.computeIndexByConnectivityCut(rest),
      this.computeBarriersRadar(rest, responseFilters),
      this.aggregateChoicesByLocator(
        DIGITAL_DEMAND_SOURCES.adoptionBarriers,
        rest,
        responseFilters,
      ),
      this.computeInstitutionTrust(rest, responseFilters),
      this.aggregateChoicesByLocator(
        DIGITAL_DEMAND_SOURCES.digitalSkills,
        rest,
        responseFilters,
      ),
      this.aggregateChoicesByLocator(
        DIGITAL_DEMAND_SOURCES.platforms,
        rest,
        responseFilters,
      ),
      this.aggregateChoicesByLocator(
        DIGITAL_DEMAND_SOURCES.preferredChannel,
        rest,
        responseFilters,
      ),
    ]);

    return {
      suppressed: false,
      acceptanceIndex,
      likertRanking,
      indexByCut: {
        age: indexByAge,
        education: indexByEducation,
        connectivity: indexByConnectivity,
      },
      barriersRadar,
      adoptionBarriers,
      institutionTrust,
      digitalSkills,
      platforms,
      preferredChannel,
    };
  }
}
