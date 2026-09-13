import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { Section } from 'src/sections/entities/section.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';
import { Response } from 'src/responses/entities/response.entity';
import { StepCondition } from 'src/campaigns/entities/step-condition.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { SearchQuestionsDto } from './dto/search-questions.dto';
import { Question } from './entities/question.entity';

export interface CopyQuestionResult {
  // El entity `Question` no expone `conditionQuestionId`/`conditionValue` como
  // campos planos (solo la relación `conditionQuestion`); la copia siempre
  // los deja explícitamente en null, así que se agregan aquí para que la
  // respuesta sea inequívoca sin depender de qué relaciones se hayan cargado.
  question: Omit<Question, 'conditionValue'> & {
    conditionQuestionId: string | null;
    conditionValue: string | null;
  };
  droppedCondition: boolean;
}

export interface SearchQuestionsItem {
  questionId: string;
  text: string;
  systemField: string | null;
  archivedAt: Date | null;
  type: string;
  sectionId: string;
  sectionName: string;
  instrumentId: string;
  instrumentName: string;
  instrumentCode: string | null;
  /** Respuestas que ya tiene la pregunta — decide archivar vs. borrar. */
  responseCount: number;
}

export interface SearchQuestionsResult {
  items: SearchQuestionsItem[];
  total: number;
}

/**
 * Normaliza una expresión SQL a minúsculas y sin tildes para comparar
 * enunciados. `unaccent` es una extensión y no está instalada en la base, así
 * que se traducen a mano las vocales acentuadas y la ñ del español.
 */
const NORMALIZE = (expr: string): string =>
  `translate(lower(${expr}), 'áéíóúüñ', 'aeiouun')`;

const TYPES_WITHOUT_OPTIONS = ['open_text', 'numeric', 'yes_no', 'compliance'];

const LIKERT_DEFAULT_OPTIONS = [
  { text: 'Totalmente de acuerdo', value: 5 },
  { text: 'De acuerdo', value: 4 },
  { text: 'Ni de acuerdo ni en desacuerdo', value: 3 },
  { text: 'En desacuerdo', value: 2 },
  { text: 'Totalmente en desacuerdo', value: 1 },
];

const COMPLIANCE_DEFAULT_OPTIONS: { text: string; value?: number }[] = [
  { text: 'Cumple', value: 2 },
  { text: 'Cumple parcialmente', value: 1 },
  { text: 'No cumple', value: 0 },
  { text: 'No aplica' },
  { text: 'No evidenciado' },
];

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
    @InjectRepository(Section)
    private readonly sectionsRepository: Repository<Section>,
    @InjectRepository(TypeOfQuestion)
    private readonly typesOfQuestionsRepository: Repository<TypeOfQuestion>,
    @InjectRepository(OptionQuestion)
    private readonly optionsRepository: Repository<OptionQuestion>,
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
    @InjectRepository(StepCondition)
    private readonly stepConditionsRepository: Repository<StepCondition>,
  ) {}

  private async seedLikertOptions(question: Question): Promise<void> {
    const options = this.optionsRepository.create(
      LIKERT_DEFAULT_OPTIONS.map((opt) => ({ ...opt, question })),
    );
    await this.optionsRepository.save(options);
  }

  private async seedComplianceOptions(question: Question): Promise<void> {
    const options = this.optionsRepository.create(
      COMPLIANCE_DEFAULT_OPTIONS.map((opt) => ({ ...opt, question })),
    );
    await this.optionsRepository.save(options);
  }

  /**
   * Spec 84, Fase 9 — busca preguntas por texto entre instrumentos, para
   * detectar redundancias durante la depuración. Solo lectura.
   *
   * La comparación ignora mayúsculas y tildes (`unaccent` no está instalado en
   * la base, así que se normaliza con `translate` sobre las vocales acentuadas
   * y la ñ, que es lo que aparece en los enunciados en español).
   *
   * Devuelve cada coincidencia con su sección e instrumento y el número de
   * respuestas que ya tiene, porque de eso depende la decisión de la
   * depuración: una pregunta con respuestas se archiva, una sin respuestas se
   * puede borrar.
   */
  async searchByText(dto: SearchQuestionsDto): Promise<SearchQuestionsResult> {
    const query = this.questionsRepository
      .createQueryBuilder('question')
      .innerJoin('question.section', 'section')
      .innerJoin('section.instrument', 'instrument')
      .innerJoin('question.type', 'type')
      .leftJoin(Response, 'response', 'response.question = question.questionId')
      .select([
        'question.questionId AS "questionId"',
        'question.text AS "text"',
        'question.systemField AS "systemField"',
        'question.archivedAt AS "archivedAt"',
        'type.name AS "type"',
        'section.sectionId AS "sectionId"',
        'section.name AS "sectionName"',
        'instrument.instrumentId AS "instrumentId"',
        'instrument.name AS "instrumentName"',
        'instrument.code AS "instrumentCode"',
      ])
      .addSelect('COUNT(response.responseId)', 'responseCount')
      .where(`${NORMALIZE('question.text')} LIKE ${NORMALIZE(':needle')}`, {
        needle: `%${dto.q}%`,
      })
      .groupBy('question.questionId')
      .addGroupBy('question.text')
      .addGroupBy('question.systemField')
      .addGroupBy('question.archivedAt')
      .addGroupBy('type.name')
      .addGroupBy('section.sectionId')
      .addGroupBy('section.name')
      .addGroupBy('instrument.instrumentId')
      .addGroupBy('instrument.name')
      .addGroupBy('instrument.code')
      .orderBy('instrument.name', 'ASC')
      .addOrderBy('section.order', 'ASC')
      .addOrderBy('question.order', 'ASC');

    if (!dto.includeArchived) {
      query.andWhere('question.archivedAt IS NULL');
    }
    if (dto.instrumentIds?.length) {
      query.andWhere('instrument.instrumentId IN (:...instrumentIds)', {
        instrumentIds: dto.instrumentIds,
      });
    }

    const rows = await query.getRawMany<
      Omit<SearchQuestionsItem, 'responseCount'> & { responseCount: string }
    >();

    const items = rows.map((row) => ({
      ...row,
      responseCount: Number(row.responseCount),
    }));
    return { items, total: items.length };
  }

  /** Spec 84 — cuántas respuestas ya existen para esta pregunta. */
  private async countResponses(questionId: string): Promise<number> {
    return this.responsesRepository.count({
      where: { question: { questionId } },
    });
  }

  /**
   * Spec 84 — preguntas visibles (no archivadas) que dependen de esta por su
   * condición de visibilidad, o pasos de campaña cuya condición depende de
   * ella. Archivar o borrar una pregunta con dependientes activos la
   * dejaría sin fundamento sin avisar a nadie.
   */
  private async findActiveDependents(
    questionId: string,
  ): Promise<{ dependentQuestions: string[]; stepConditions: number }> {
    const dependentQuestions = await this.questionsRepository.find({
      where: {
        conditionQuestion: { questionId },
        archivedAt: IsNull(),
      },
    });
    const stepConditions = await this.stepConditionsRepository.count({
      where: { conditionQuestion: { questionId } },
    });
    return {
      dependentQuestions: dependentQuestions.map((q) => q.questionId),
      stepConditions,
    };
  }

  async create(
    sectionId: string,
    createQuestionDto: CreateQuestionDto,
  ): Promise<Question> {
    const { typeId, conditionQuestionId, ...questionData } = createQuestionDto;

    const section = await this.sectionsRepository.findOne({
      where: { sectionId },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const type = await this.typesOfQuestionsRepository.findOne({
      where: { typeId },
    });

    if (!type) {
      throw new NotFoundException('Type of question not found');
    }

    let conditionQuestion: Question | undefined;

    if (conditionQuestionId) {
      const found = await this.questionsRepository.findOne({
        where: { questionId: conditionQuestionId },
      });

      if (!found) {
        throw new NotFoundException('Condition question not found');
      }

      conditionQuestion = found;
    }

    const question = this.questionsRepository.create({
      ...questionData,
      isSelectionCriteria: questionData.isSelectionCriteria ?? false,
      isKeyQuestion: questionData.isKeyQuestion ?? false,
      section,
      type,
      conditionQuestion,
    });

    const saved = await this.questionsRepository.save(question);

    if (type.name === 'likert') {
      await this.seedLikertOptions(saved);
    }

    if (type.name === 'compliance') {
      await this.seedComplianceOptions(saved);
    }

    return (await this.questionsRepository.findOne({
      where: { questionId: saved.questionId },
      relations: ['type', 'options'],
    })) as Question;
  }

  async findOne(questionId: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId },
      relations: ['type', 'options'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    return question;
  }

  async update(
    sectionId: string,
    questionId: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
      relations: ['type', 'options', 'conditionQuestion', 'section'],
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const { typeId, conditionQuestionId, order, targetSectionId, ...rest } =
      updateQuestionDto;

    // Spec 84 — al mover una pregunta a otra sección hay que recompactar el
    // orden de la sección de origen, igual que hace `remove`. Si no, queda un
    // hueco ([1,2,4]) y la siguiente pregunta que entre ahí recibe
    // `count + 1` = 4, colisionando con la que ya tiene ese orden: no hay
    // índice único que lo impida (verificado en la Fase 0).
    let movedFrom: { sectionId: string; order: number } | null = null;

    if (typeId !== undefined && typeId !== question.type?.typeId) {
      // Spec 84 — "editar en sitio + archivar": una pregunta con respuestas
      // no puede cambiar de tipo (una respuesta de selección y una de sí/no
      // guardan cosas distintas). Se crea una pregunta nueva y se archiva la
      // vieja.
      const responseCount = await this.countResponses(questionId);
      if (responseCount > 0) {
        throw new ConflictException({
          message:
            'No se puede cambiar el tipo de una pregunta con respuestas. ' +
            'Cree una pregunta nueva con el tipo correcto y archive esta.',
          questionId,
          responseCount,
        });
      }

      const newType = await this.typesOfQuestionsRepository.findOne({
        where: { typeId },
      });
      if (!newType) {
        throw new NotFoundException('Type of question not found');
      }

      if (
        TYPES_WITHOUT_OPTIONS.includes(newType.name) &&
        question.options?.length > 0
      ) {
        await this.optionsRepository.delete({ question: { questionId } });
        question.options = [];
      }

      question.type = newType;
    }

    // Spec 84 — mover la pregunta a otra sección, siempre dentro del mismo
    // instrumento (una condición o un mapeo de sistema pensado para un
    // instrumento no tiene sentido reubicado en otro).
    if (
      targetSectionId !== undefined &&
      targetSectionId !== question.section.sectionId
    ) {
      const targetSection = await this.sectionsRepository.findOne({
        where: { sectionId: targetSectionId },
        relations: ['instrument'],
      });
      const currentSection = await this.sectionsRepository.findOne({
        where: { sectionId },
        relations: ['instrument'],
      });
      if (!targetSection) {
        throw new NotFoundException('Target section not found');
      }
      if (
        !currentSection ||
        targetSection.instrument.instrumentId !==
          currentSection.instrument.instrumentId
      ) {
        throw new ConflictException(
          'La sección destino debe pertenecer al mismo instrumento',
        );
      }
      const siblingCount = await this.questionsRepository.count({
        where: { section: { sectionId: targetSectionId } },
      });
      movedFrom = { sectionId, order: question.order };
      question.section = targetSection;
      question.order = siblingCount + 1;
    }

    if (conditionQuestionId !== undefined) {
      if (conditionQuestionId === null) {
        question.conditionQuestion = undefined;
        question.conditionValue = undefined;
      } else {
        const conditionQ = await this.questionsRepository.findOne({
          where: { questionId: conditionQuestionId },
        });
        if (!conditionQ) {
          throw new NotFoundException('Condition question not found');
        }
        question.conditionQuestion = conditionQ;
      }
    }

    if (
      order !== undefined &&
      order !== question.order &&
      targetSectionId === undefined
    ) {
      const sibling = await this.questionsRepository.findOne({
        where: { section: { sectionId }, order },
      });
      if (sibling) {
        sibling.order = question.order;
        await this.questionsRepository.save(sibling);
      }
      question.order = order;
    }

    Object.assign(question, rest);
    const saved = await this.questionsRepository.save(question);

    if (movedFrom) {
      await this.compactOrder(movedFrom.sectionId);
    }

    if (
      typeId !== undefined &&
      question.type?.name === 'likert' &&
      (question.options?.length ?? 0) === 0
    ) {
      await this.seedLikertOptions(saved);
    }

    if (
      typeId !== undefined &&
      question.type?.name === 'compliance' &&
      (question.options?.length ?? 0) === 0
    ) {
      await this.seedComplianceOptions(saved);
    }

    return (await this.questionsRepository.findOne({
      where: { questionId: saved.questionId },
      relations: ['type', 'options'],
    })) as Question;
  }

  async remove(sectionId: string, questionId: string): Promise<void> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    // Spec 84 — "editar en sitio + archivar": nunca se borra una pregunta
    // con respuestas. Se archiva en su lugar.
    const responseCount = await this.countResponses(questionId);
    if (responseCount > 0) {
      throw new ConflictException({
        message:
          'Esta pregunta tiene respuestas y no se puede borrar. Archívela en su lugar.',
        questionId,
        responseCount,
      });
    }

    const { dependentQuestions, stepConditions } =
      await this.findActiveDependents(questionId);
    if (dependentQuestions.length > 0 || stepConditions > 0) {
      throw new ConflictException({
        message:
          'Otras preguntas o pasos de campaña dependen de esta pregunta.',
        questionId,
        dependentQuestions,
        stepConditions,
      });
    }

    await this.questionsRepository.remove(question);
    await this.compactOrder(sectionId);
  }

  /**
   * Renumera las preguntas de una sección a 1..n conservando su orden
   * relativo. Se usa tras borrar una pregunta y tras moverla a otra sección:
   * en ambos casos queda un hueco, y `order` se asigna por conteo.
   */
  private async compactOrder(sectionId: string): Promise<void> {
    const remaining = await this.questionsRepository.find({
      where: { section: { sectionId } },
      order: { order: 'ASC' },
    });

    const renumbered = remaining.filter((q, i) => q.order !== i + 1);
    for (const question of renumbered) {
      question.order = remaining.indexOf(question) + 1;
    }
    if (renumbered.length > 0) {
      await this.questionsRepository.save(renumbered);
    }
  }

  /**
   * Spec 84 — archiva una pregunta en vez de borrarla: deja de mostrarse en
   * el render/formulario público/caché móvil, pero sus respuestas se
   * conservan. Se rechaza si otra pregunta visible o un paso de campaña
   * depende de su condición.
   */
  async archive(sectionId: string, questionId: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
      relations: ['type', 'options'],
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const { dependentQuestions, stepConditions } =
      await this.findActiveDependents(questionId);
    if (dependentQuestions.length > 0 || stepConditions > 0) {
      throw new ConflictException({
        message:
          'Otras preguntas o pasos de campaña dependen de esta pregunta.',
        questionId,
        dependentQuestions,
        stepConditions,
      });
    }

    question.archivedAt = new Date();
    return this.questionsRepository.save(question);
  }

  async unarchive(sectionId: string, questionId: string): Promise<Question> {
    const question = await this.questionsRepository.findOne({
      where: { questionId, section: { sectionId } },
      relations: ['type', 'options'],
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    question.archivedAt = null;
    return this.questionsRepository.save(question);
  }

  /**
   * Fase 2 (Spec 77): copia una pregunta —con sus opciones— al final de una
   * sección destino, esté o no en el mismo instrumento que la de origen.
   *
   * La condición de visibilidad (`conditionQuestionId`) SIEMPRE se descarta:
   * la pregunta de la que depende puede no existir en el instrumento destino,
   * y copiarla "a medias" dejaría una condición apuntando a una pregunta
   * ajena. `droppedCondition` en la respuesta le permite a la UI avisarlo.
   */
  async copyToSection(
    targetSectionId: string,
    copyQuestionDto: { sourceQuestionId: string },
  ): Promise<CopyQuestionResult> {
    const targetSection = await this.sectionsRepository.findOne({
      where: { sectionId: targetSectionId },
    });
    if (!targetSection) {
      throw new NotFoundException('Target section not found');
    }

    const source = await this.questionsRepository.findOne({
      where: { questionId: copyQuestionDto.sourceQuestionId },
      relations: ['type', 'options', 'conditionQuestion'],
    });
    if (!source) {
      throw new NotFoundException('Source question not found');
    }

    const droppedCondition = !!source.conditionQuestion;

    const newQuestionId = await this.questionsRepository.manager.transaction(
      async (manager: EntityManager) => {
        const siblingCount = await manager.count(Question, {
          where: { section: { sectionId: targetSectionId } },
        });

        const questionCopy = manager.create(Question, {
          section: targetSection,
          text: source.text,
          type: source.type,
          isRequired: source.isRequired,
          isSelectionCriteria: source.isSelectionCriteria,
          isKeyQuestion: source.isKeyQuestion,
          order: siblingCount + 1,
          systemField: source.systemField ?? undefined,
        });
        const savedQuestion = await manager.save(Question, questionCopy);

        for (const option of source.options ?? []) {
          const optionCopy = manager.create(OptionQuestion, {
            question: savedQuestion,
            text: option.text,
            value: option.value ?? undefined,
            isOther: option.isOther,
            metadataId: option.metadataId ?? null,
          });
          await manager.save(OptionQuestion, optionCopy);
        }

        return savedQuestion.questionId;
      },
    );

    const savedQuestion = (await this.questionsRepository.findOne({
      where: { questionId: newQuestionId },
      relations: ['type', 'options'],
    })) as Question;

    const question: CopyQuestionResult['question'] = {
      ...savedQuestion,
      conditionQuestionId: null,
      conditionValue: null,
    };

    return { question, droppedCondition };
  }
}
