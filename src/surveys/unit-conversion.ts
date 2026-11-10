/**
 * Spec 93 — conversión de área a hectáreas para `farm.area`.
 *
 * Los talleres capturan el área con una unidad (ha, m², km², o las regionales
 * fanegada, cuadra y plaza — spec 97). Una unidad que no se reconoce da
 * `hectares = null` y la señal `unitUnknown`, para no guardar un valor con la
 * escala equivocada.
 */

export interface AreaConversion {
  hectares: number | null;
  /** La unidad no era hectáreas y el valor se convirtió. */
  converted: boolean;
  /** La unidad no se reconoce: no se guarda el área. */
  unitUnknown: boolean;
}

/**
 * Spec 97 (D-H4-10) — fanegada, cuadra y plaza = 6.400 m² (0,64 ha), el valor
 * de uso común en Colombia. Varía por región: si el equipo de campo confirma
 * otro, solo cambia esta constante.
 */
const REGIONAL_AREA_HECTARES = 0.64;

const HECTARES_PER_UNIT: Record<string, number> = {
  ha: 1,
  hectarea: 1,
  hectareas: 1,
  m2: 1 / 10_000,
  mt2: 1 / 10_000,
  'metro cuadrado': 1 / 10_000,
  'metros cuadrados': 1 / 10_000,
  km2: 100,
  'kilometro cuadrado': 100,
  'kilometros cuadrados': 100,
  fanegada: REGIONAL_AREA_HECTARES,
  fanegadas: REGIONAL_AREA_HECTARES,
  cuadra: REGIONAL_AREA_HECTARES,
  cuadras: REGIONAL_AREA_HECTARES,
  plaza: REGIONAL_AREA_HECTARES,
  plazas: REGIONAL_AREA_HECTARES,
};

function normalizeUnit(unit: string): string {
  return (
    unit
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/²/g, '2')
      .replace(/\./g, '')
      // Las opciones de producción llevan la abreviatura entre paréntesis
      // («hectárea (ha)», «metro cuadrado (m²)»): se descarta.
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Sin unidad (respuesta numérica simple) el valor se toma como hectáreas. */
export function convertAreaToHectares(
  value: number,
  unit: string | null | undefined,
): AreaConversion {
  if (!Number.isFinite(value)) {
    return { hectares: null, converted: false, unitUnknown: false };
  }
  const key = unit ? normalizeUnit(unit) : '';
  if (key === '') {
    return { hectares: value, converted: false, unitUnknown: false };
  }
  const factor = HECTARES_PER_UNIT[key];
  if (factor === undefined) {
    return { hectares: null, converted: false, unitUnknown: true };
  }
  return {
    hectares: value * factor,
    converted: factor !== 1,
    unitUnknown: false,
  };
}
