import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
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
  AggregationYesNoDto,
  DashboardAggregation,
  DashboardQuestionDto,
  DashboardResponseDto,
} from './dto/dashboard-response.dto';

const MIN_SAMPLE_THRESHOLD = 5;

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
    await this.validateFilters(filters);
    const count = await this.buildFilteredSurveyQuery(filters).getCount();
    return { count, suppressed: count < MIN_SAMPLE_THRESHOLD };
  }

  /**
   * Fase 9 (Spec 30): distribución de encuestas por departamento para el
   * mapa coroplético. Ignora departmentId/townId de los filtros (agrupar por
   * departamento mientras se filtra por uno específico no tiene sentido; el
   * mapa solo se muestra en el frontend cuando no hay departamento activo).
   * Aplica el mismo umbral de privacidad por bucket que el resto del dashboard.
   */
  async getDepartmentCounts(
    filters: DashboardFiltersDto,
  ): Promise<DashboardDepartmentCountDto[]> {
    const { departmentId: _departmentId, townId: _townId, ...rest } = filters;
    await this.validateFilters(rest);

    const rows = await this.buildFilteredSurveyQuery(rest)
      .innerJoin('survey.department', 'department')
      .select('department.departmentId', 'departmentId')
      .addSelect('department.name', 'departmentName')
      .addSelect('COUNT(*)', 'count')
      .groupBy('department.departmentId')
      .addGroupBy('department.name')
      .getRawMany<{ departmentId: string; departmentName: string; count: string }>();

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
   * instrumentId/departmentId/townId (mismo criterio que `getDepartmentCounts`
   * para department; instrumentId se ignora porque agrupar "por instrumento"
   * no aplica a un perfil poblacional).
   */
  async getOverview(filters: DashboardFiltersDto): Promise<DashboardOverviewDto> {
    const {
      instrumentId: _instrumentId,
      departmentId: _departmentId,
      townId: _townId,
      ...rest
    } = filters;
    await this.validateFilters(rest);

    const totalCount = await this.buildFilteredSurveyQuery(rest).getCount();
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
        this.groupSurveysByRelation(rest, 'actorType', 'actorTypeId'),
        this.groupSurveysByRelation(rest, 'crop', 'cropId'),
        this.getDepartmentCounts(rest).then((rows) =>
          rows.map((r) => ({
            id: r.departmentId,
            name: r.departmentName,
            count: r.count,
          })),
        ),
        this.getSystemFieldNumericStats(rest, 'farmer.age'),
        this.getSystemFieldNumericStats(rest, 'farmer.experienceYears'),
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
  ): Promise<DashboardOverviewBucketDto[]> {
    const rows = await this.buildFilteredSurveyQuery(filters)
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
  ): Promise<AggregationNumericDto | null> {
    const question = await this.questionRepo.findOne({ where: { systemField } });
    if (!question) return null;

    const answeredCount = await this.countAnswered(question, 'numeric', filters);
    if (answeredCount < MIN_SAMPLE_THRESHOLD) return null;

    return this.aggregateNumeric(question, filters, answeredCount);
  }

  async getAnalytics(
    filters: DashboardFiltersDto,
  ): Promise<DashboardResponseDto> {
    const { instrument, departmentName, townName, cropName, actorTypeName } =
      await this.validateFilters(filters);

    const totalCount = await this.buildFilteredSurveyQuery(filters).getCount();
    const dateRange = totalCount > 0 ? await this.getDateRange(filters) : null;

    const metadata = {
      totalCount,
      instrumentName: instrument?.name,
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

    if (!instrument) {
      return { metadata, suppressed: false, questions: [] };
    }

    const questions = await this.getEligibleQuestions(instrument.instrumentId);

    const dashboardQuestions: DashboardQuestionDto[] = [];
    for (const question of questions) {
      dashboardQuestions.push(await this.aggregateQuestion(question, filters));
    }

    return { metadata, suppressed: false, questions: dashboardQuestions };
  }

  private async validateFilters(filters: DashboardFiltersDto): Promise<{
    instrument: Instrument | null;
    departmentName?: string;
    townName?: string;
    cropName?: string;
    actorTypeName?: string;
  }> {
    let instrument: Instrument | null = null;

    if (filters.instrumentId) {
      instrument = await this.instrumentRepo.findOne({
        where: { instrumentId: filters.instrumentId },
      });
      if (!instrument) {
        throw new NotFoundException('Instrumento no encontrado.');
      }
    }

    let departmentName: string | undefined;
    if (filters.departmentId) {
      const department = await this.departmentRepo.findOne({
        where: { departmentId: filters.departmentId },
      });
      if (!department) throw new NotFoundException('Departamento no encontrado.');
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
      if (!actorType) throw new NotFoundException('Tipo de actor no encontrado.');
      actorTypeName = actorType.name;
    }

    return { instrument, departmentName, townName, cropName, actorTypeName };
  }

  /** D10: instrumentId se resuelve vía INNER JOIN a surveys_instruments (relación ManyToMany). */
  private applySurveyFilters<T extends object>(
    qb: SelectQueryBuilder<T>,
    filters: DashboardFiltersDto,
  ): void {
    if (filters.instrumentId) {
      qb.innerJoin(
        'survey.instruments',
        'instrument',
        'instrument.instrumentId = :instrumentId',
        { instrumentId: filters.instrumentId },
      );
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
  }

  private buildFilteredSurveyQuery(
    filters: DashboardFiltersDto,
  ): SelectQueryBuilder<Survey> {
    const qb = this.surveyRepo
      .createQueryBuilder('survey')
      .where('survey.sincronized = true');
    this.applySurveyFilters(qb, filters);
    return qb;
  }

  private async getDateRange(
    filters: DashboardFiltersDto,
  ): Promise<{ from: string; to: string } | null> {
    const raw = await this.buildFilteredSurveyQuery(filters)
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
  ): SelectQueryBuilder<Response> {
    const qb = this.responseRepo
      .createQueryBuilder('response')
      .innerJoin('response.survey', 'survey')
      .where('response.question = :questionId', { questionId })
      .andWhere('survey.sincronized = true');
    this.applySurveyFilters(qb, filters);
    return qb;
  }

  /** D6: exclusión por tipo no visualizable + denylist explícita de systemField (no un blanket "farm.*"). */
  private async getEligibleQuestions(
    instrumentId: string,
  ): Promise<Question[]> {
    return this.questionRepo
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
      )
      .orderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC')
      .getMany();
  }

  private async aggregateQuestion(
    question: Question,
    filters: DashboardFiltersDto,
  ): Promise<DashboardQuestionDto> {
    const typeName = question.type.name;
    const isInverted = (question.systemField ?? '').startsWith('inverted:');

    const answeredCount = await this.countAnswered(question, typeName, filters);

    const base = {
      questionId: question.questionId,
      questionText: question.text,
      questionType: typeName,
      sectionName: question.section.name,
      systemField: question.systemField ?? null,
      isInverted,
      answeredCount,
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
    );

    return { ...base, suppressed: false, aggregation };
  }

  private async countAnswered(
    question: Question,
    typeName: string,
    filters: DashboardFiltersDto,
  ): Promise<number> {
    const qb = this.buildResponseBaseQuery(question.questionId, filters);

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
  ): Promise<DashboardAggregation> {
    switch (typeName) {
      case 'yes_no':
        return this.aggregateYesNo(question, filters, answeredCount);
      case 'numeric':
        return this.aggregateNumeric(question, filters, answeredCount);
      case 'likert':
        return this.aggregateLikert(
          question,
          filters,
          isInverted,
          answeredCount,
        );
      case 'single_choice':
      case 'multiple_choice':
      case 'compliance':
        return this.aggregateChoices(
          question,
          filters,
          typeName,
          answeredCount,
        );
      default:
        throw new Error(`Tipo de pregunta no soportado: ${typeName}`);
    }
  }

  private async aggregateYesNo(
    question: Question,
    filters: DashboardFiltersDto,
    answeredCount: number,
  ): Promise<AggregationYesNoDto> {
    const raw = await this.buildResponseBaseQuery(question.questionId, filters)
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
  ): Promise<AggregationChoicesDto> {
    const countExpression =
      typeName === 'multiple_choice'
        ? 'COUNT(DISTINCT response.survey)'
        : 'COUNT(response.responseId)';

    const rows = await this.buildResponseBaseQuery(question.questionId, filters)
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
  ): Promise<AggregationLikertDto> {
    const rows = await this.buildResponseBaseQuery(question.questionId, filters)
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
  ): Promise<AggregationNumericDto> {
    const stats = await this.buildResponseBaseQuery(
      question.questionId,
      filters,
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
}
