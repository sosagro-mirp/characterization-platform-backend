import { EntityManager } from 'typeorm';
import { Instrument } from 'src/instruments/entities/instrument.entity';
import { Section } from 'src/sections/entities/section.entity';
import { Question } from 'src/questions/entities/question.entity';
import { OptionQuestion } from 'src/options-question/entities/option-question.entity';
import { TypeOfQuestion } from 'src/types-of-questions/entities/type-of-question.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface QuestionDef {
  text: string;
  type: TypeOfQuestion;
  isRequired: boolean;
  isSelectionCriteria?: boolean;
  order: number;
  section: Section;
}

async function saveQuestion(
  manager: EntityManager,
  def: QuestionDef,
): Promise<Question> {
  const repo = manager.getRepository(Question);
  return repo.save(
    repo.create({
      text: def.text,
      type: def.type,
      isRequired: def.isRequired,
      isSelectionCriteria: def.isSelectionCriteria ?? false,
      order: def.order,
      section: def.section,
    }),
  );
}

async function saveOptions(
  manager: EntityManager,
  question: Question,
  options: string[],
): Promise<void> {
  const repo = manager.getRepository(OptionQuestion);
  for (const text of options) {
    await repo.save(repo.create({ question, text, isOther: false }));
  }
}

// ─── Seed principal ───────────────────────────────────────────────────────────

const NAME = 'S3B: Caracterización Morfológica Cacao (Técnicos)';
const VERSION = 1;

export async function seedInstrumentoCacaoMorfologia(
  manager: EntityManager,
): Promise<void> {
  const instrumentRepo = manager.getRepository(Instrument);
  const sectionRepo = manager.getRepository(Section);
  const typeRepo = manager.getRepository(TypeOfQuestion);

  if (
    await instrumentRepo.findOne({ where: { name: NAME, version: VERSION } })
  ) {
    console.log(
      `[seed] Instrumento "${NAME}" v${VERSION} ya existe. Se omite.`,
    );
    return;
  }

  const typeNames = ['open_text', 'numeric', 'single_choice'];
  const types: Record<string, TypeOfQuestion> = {};
  for (const n of typeNames) {
    const t = await typeRepo.findOne({ where: { name: n } });
    if (!t) throw new Error(`[seed] TypeOfQuestion "${n}" no encontrado.`);
    types[n] = t;
  }

  const instrument = await instrumentRepo.save(
    instrumentRepo.create({
      name: NAME,
      version: VERSION,
      publishDate: '2025-05-13',
      isActive: true,
    }),
  );
  console.log(`[seed] Instrumento "${NAME}" creado.`);

  const [sec1, sec2, sec3, sec4, sec5] = await Promise.all([
    sectionRepo.save(
      sectionRepo.create({ name: '3b.1 Árbol', order: 1, instrument }),
    ),
    sectionRepo.save(
      sectionRepo.create({ name: '3b.2 Hoja', order: 2, instrument }),
    ),
    sectionRepo.save(
      sectionRepo.create({ name: '3b.3 Fruto', order: 3, instrument }),
    ),
    sectionRepo.save(
      sectionRepo.create({ name: '3b.4 Semilla', order: 4, instrument }),
    ),
    sectionRepo.save(
      sectionRepo.create({ name: '3b.5 Flor', order: 5, instrument }),
    ),
  ]);

  // ── 3b.1 Árbol ───────────────────────────────────────────────────────────────
  {
    let o = 1;

    const q = await saveQuestion(manager, {
      text: '3b.1.1 — Variedad (Pedigrí)',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, q, [
      'Trinitario',
      'Híbrido por trinitario',
      'Criollo',
      'Trinitario x Criollo',
    ]);

    await saveQuestion(manager, {
      text: '3b.1.2 — Clon',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '3b.1.3 — Altura del árbol (m)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '3b.1.4 — Diámetro de copa del árbol (m)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '3b.1.5 — Edad del árbol (años)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    await saveQuestion(manager, {
      text: '3b.1.6 — Perímetro del tronco DAP (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec1,
    });

    const qHabito = await saveQuestion(manager, {
      text: '3b.1.7 — Hábito del árbol',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, qHabito, ['Erecto', 'Decumbente']);

    const qVigor = await saveQuestion(manager, {
      text: '3b.1.8 — Vigor del árbol',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, qVigor, ['Vigoroso', 'Intermedio', 'Escaso']);

    const qFollaje = await saveQuestion(manager, {
      text: '3b.1.9 — Follaje sin poda',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec1,
    });
    await saveOptions(manager, qFollaje, ['Abundante', 'Escaso']);

    await saveQuestion(manager, {
      text: '3b.1.10 — Frecuencia de poda',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec1,
    });
  }

  // ── 3b.2 Hoja ────────────────────────────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '3b.2.1 — Color hojas jóvenes (código Pantone o descripción)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: '3b.2.2 — Longitud de la hoja (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: '3b.2.3 — Ancho de la hoja (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    await saveQuestion(manager, {
      text: '3b.2.4 — Longitud de la base al punto más ancho (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec2,
    });

    const qFormaHoja = await saveQuestion(manager, {
      text: '3b.2.5 — Forma de la hoja',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, qFormaHoja, [
      'Ovada',
      'Obovada',
      'Acuñada',
      'Acorazonada',
      'Ovoide',
      'Elíptica',
    ]);

    const qApiceHoja = await saveQuestion(manager, {
      text: '3b.2.6 — Forma del ápice de la hoja',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, qApiceHoja, [
      'Agudo',
      'Acuminado corto',
      'Acuminado largo',
    ]);

    const qBaseHoja = await saveQuestion(manager, {
      text: '3b.2.7 — Forma de la base de la hoja',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, qBaseHoja, ['Obtusa', 'Redondeada', 'Aguda']);

    const qBrote = await saveQuestion(manager, {
      text: '3b.2.8 — Color del brote terminal de la hoja',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec2,
    });
    await saveOptions(manager, qBrote, [
      'Rojo claro',
      'Rojo intermedio',
      'Rojo brillante',
      'Rojo oscuro',
    ]);
  }

  // ── 3b.3 Fruto ───────────────────────────────────────────────────────────────
  {
    let o = 1;

    const qConstriccion = await saveQuestion(manager, {
      text: '3b.3.1 — Constricción basal del fruto',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qConstriccion, [
      'Ausente',
      'Ligera',
      'Intermedia',
      'Pronunciada',
    ]);

    await saveQuestion(manager, {
      text: '3b.3.2 — Grosor del lomo del fruto (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.3 — Profundidad surco primario (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.4 — Profundidad surco secundario (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.5 — Grosor de cáscara (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.6 — Frutos de un árbol por año',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    const qColorInmaduro = await saveQuestion(manager, {
      text: '3b.3.7 — Color fruto inmaduro',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qColorInmaduro, ['Rojo', 'Verde', 'Morado']);

    const qColorMaduro = await saveQuestion(manager, {
      text: '3b.3.8 — Color fruto maduro',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qColorMaduro, ['Rojo', 'Amarillo', 'Naranja']);

    const qFormaFruto = await saveQuestion(manager, {
      text: '3b.3.9 — Forma del fruto',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qFormaFruto, [
      'Angoleta',
      'Cundeamor',
      'Amelonado',
      'Calabacillo',
    ]);

    const qApiceFruto = await saveQuestion(manager, {
      text: '3b.3.10 — Forma del ápice del fruto',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qApiceFruto, [
      'Obtuso',
      'Mamiforme',
      'Agudo',
      'Atenuado',
    ]);

    const qRugosidad = await saveQuestion(manager, {
      text: '3b.3.11 — Rugosidad del fruto',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveOptions(manager, qRugosidad, ['Ligera', 'Intermedia', 'Intensa']);

    await saveQuestion(manager, {
      text: '3b.3.12 — Longitud del fruto (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.13 — Diámetro del fruto (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.14 — Rendimiento (kg/ha/año)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    // Par numérico + clon para 3b.3.15–3b.3.18
    await saveQuestion(manager, {
      text: '3b.3.15a — Clon de referencia para tamaño de mazorca',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveQuestion(manager, {
      text: '3b.3.15b — Tamaño promedio de mazorca por clon (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.16a — Clon de referencia para número de mazorcas sanas',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveQuestion(manager, {
      text: '3b.3.16b — Número de mazorcas sanas promedio por clon',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.17a — Clon de referencia para peso de mazorca',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveQuestion(manager, {
      text: '3b.3.17b — Peso de mazorca promedio por clon (g)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });

    await saveQuestion(manager, {
      text: '3b.3.18a — Clon de referencia para Índice de Mazorca (IM)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec3,
    });
    await saveQuestion(manager, {
      text: '3b.3.18b — Índice de Mazorca (IM) promedio por clon',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec3,
    });
  }

  // ── 3b.4 Semilla ─────────────────────────────────────────────────────────────
  {
    let o = 1;

    const qColorSemilla = await saveQuestion(manager, {
      text: '3b.4.1 — Color de la semilla',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec4,
    });
    await saveOptions(manager, qColorSemilla, ['Violeta', 'Morado', 'Blanco']);

    await saveQuestion(manager, {
      text: '3b.4.2 — Peso húmedo de la semilla (g)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.3 — Longitud de la semilla (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.4 — Diámetro de la semilla (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.5 — Grosor de la semilla (cm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.6 — Porcentaje de cascarilla (%)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.7 — Tamaño del grano (pequeño / mediano / grande)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });

    await saveQuestion(manager, {
      text: '3b.4.8a — Clon de referencia para Índice de Grano (IG)',
      type: types.open_text,
      isRequired: false,
      order: o++,
      section: sec4,
    });
    await saveQuestion(manager, {
      text: '3b.4.8b — Índice de Grano (IG) promedio por clon',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec4,
    });
  }

  // ── 3b.5 Flor ────────────────────────────────────────────────────────────────
  {
    let o = 1;

    await saveQuestion(manager, {
      text: '3b.5.1 — Longitud del estaminodio (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: '3b.5.2 — Longitud del ovario de la flor (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: '3b.5.3 — Longitud del estilo de la flor (mm)',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    await saveQuestion(manager, {
      text: '3b.5.4 — Número de óvulos por ovario',
      type: types.numeric,
      isRequired: false,
      order: o++,
      section: sec5,
    });

    const qColorFlor = await saveQuestion(manager, {
      text: '3b.5.5 — Color de la flor',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, qColorFlor, [
      'Rosado',
      'Verde ligero',
      'Blanco',
      'Rojo',
    ]);

    const qAntoSepalos = await saveQuestion(manager, {
      text: '3b.5.6 — Antocianina en sépalos',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, qAntoSepalos, [
      'Ausente',
      'Ligera',
      'Intermedia',
      'Intensa',
    ]);

    const qPedunculo = await saveQuestion(manager, {
      text: '3b.5.7 — Color del pedúnculo de la flor',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, qPedunculo, ['Rojizo', 'Verde rojizo', 'Verde']);

    const qAntoPetalo = await saveQuestion(manager, {
      text: '3b.5.8 — Antocianina en el limbo del pétalo',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, qAntoPetalo, ['Ausente', 'Presente']);

    const qFloracion = await saveQuestion(manager, {
      text: '3b.5.9 — Tipo de floración',
      type: types.single_choice,
      isRequired: false,
      order: o++,
      section: sec5,
    });
    await saveOptions(manager, qFloracion, ['Discontinua', 'Continua']);
  }
}
