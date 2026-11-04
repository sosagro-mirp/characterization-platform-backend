import {
  cellValue,
  questionHeaders,
  ResponseRow,
  uniqueHeaders,
  uniqueSheetName,
  unitCellValue,
} from './export-cells';

// Spec 98, C12 — selección múltiple y «Otros» legibles; números y fechas con su tipo.

const row = (over: Partial<ResponseRow> = {}): ResponseRow => ({
  survey_id: 's',
  question_id: 'q',
  text_value: null,
  numeric_value: null,
  boolean_value: null,
  option_text: null,
  is_other: null,
  ...over,
});

describe('Spec 98 — export-cells', () => {
  describe('cellValue', () => {
    it('sin respuesta: celda vacía', () => {
      expect(cellValue({ typeName: 'open_text' }, [], 0)).toBeNull();
    });

    it('número: conserva el tipo numérico', () => {
      expect(
        cellValue({ typeName: 'numeric' }, [row({ numeric_value: 12.5 })], 0),
      ).toBe(12.5);
    });

    it('cero numérico no se pierde', () => {
      expect(
        cellValue({ typeName: 'numeric' }, [row({ numeric_value: 0 })], 0),
      ).toBe(0);
    });

    it('sí/no', () => {
      expect(
        cellValue({ typeName: 'yes_no' }, [row({ boolean_value: true })], 0),
      ).toBe('Sí');
      expect(
        cellValue({ typeName: 'yes_no' }, [row({ boolean_value: false })], 0),
      ).toBe('No');
    });

    it('selección única: el texto de la opción', () => {
      expect(
        cellValue(
          { typeName: 'single_choice' },
          [row({ option_text: 'Café' })],
          0,
        ),
      ).toBe('Café');
    });

    it('selección múltiple: opciones unidas con "; "', () => {
      expect(
        cellValue(
          { typeName: 'multiple_choice' },
          [row({ option_text: 'Café' }), row({ option_text: 'Cacao' })],
          0,
        ),
      ).toBe('Café; Cacao');
    });

    it('«Otros» incluye su texto', () => {
      expect(
        cellValue(
          { typeName: 'multiple_choice' },
          [
            row({ option_text: 'Café' }),
            row({
              option_text: 'Otros',
              is_other: true,
              text_value: 'Plátano',
            }),
          ],
          0,
        ),
      ).toBe('Café; Otros: Plátano');
    });

    it('texto abierto', () => {
      expect(
        cellValue({ typeName: 'open_text' }, [row({ text_value: 'hola' })], 0),
      ).toBe('hola');
    });

    it('fecha: se entrega como Date', () => {
      const value = cellValue(
        { typeName: 'date' },
        [row({ text_value: '2026-10-01' })],
        0,
      );
      expect(value).toBeInstanceOf(Date);
    });

    it('multimedia: solo el conteo de adjuntos, sin URL', () => {
      expect(cellValue({ typeName: 'image' }, [row()], 3)).toBe(3);
    });

    // Bug — la unidad llega como `option_text` en la misma fila que el número,
    // y la rama de opciones devolvía solo la unidad.
    it('número con unidad: la celda conserva el número, no la unidad', () => {
      expect(
        cellValue(
          { typeName: 'numeric_with_unit' },
          [row({ numeric_value: 12.5, option_text: 'ha' })],
          0,
        ),
      ).toBe(12.5);
    });

    it('número con unidad: el cero no se pierde', () => {
      expect(
        cellValue(
          { typeName: 'numeric_with_unit' },
          [row({ numeric_value: 0, option_text: 'm²' })],
          0,
        ),
      ).toBe(0);
    });

    it('número con unidad sin parsear: conserva el texto histórico', () => {
      expect(
        cellValue(
          { typeName: 'numeric_with_unit' },
          [row({ text_value: '0/15' })],
          0,
        ),
      ).toBe('0/15');
    });
  });

  describe('unitCellValue', () => {
    it('devuelve la unidad elegida', () => {
      expect(
        unitCellValue([row({ numeric_value: 12.5, option_text: 'ha' })]),
      ).toBe('ha');
    });

    it('sin respuesta: celda vacía', () => {
      expect(unitCellValue([])).toBeNull();
    });
  });

  describe('questionHeaders', () => {
    it('número con unidad ocupa dos columnas', () => {
      expect(
        questionHeaders([
          { text: 'Área cultivada', typeName: 'numeric_with_unit' },
          { text: 'Variedad', typeName: 'open_text' },
        ]),
      ).toEqual(['Área cultivada', 'Área cultivada (unidad)', 'Variedad']);
    });
  });

  describe('uniqueSheetName', () => {
    it('quita caracteres inválidos y limita la longitud', () => {
      const used = new Set<string>();
      const name = uniqueSheetName('S1: a/b?[x]*' + 'z'.repeat(40), used);
      expect(name).not.toMatch(/[[\]:*?/\\]/);
      expect(name.length).toBeLessThanOrEqual(31);
    });

    it('instrumentos de una misma familia se distinguen por el final', () => {
      const used = new Set<string>();
      const a = uniqueSheetName('Talleres de co-creación — SosAgro 4.C', used);
      const b = uniqueSheetName(
        'Talleres de co-creación — SosAgro 4.C - Tablets',
        used,
      );
      expect(a).not.toBe(b);
      expect(b).not.toMatch(/-\d$/);
      expect(b.length).toBeLessThanOrEqual(31);
    });

    it('nombres repetidos reciben sufijo', () => {
      const used = new Set<string>();
      const a = uniqueSheetName('Talleres de co-creación — SosAgro 4.C', used);
      const b = uniqueSheetName('Talleres de co-creación — SosAgro 4.C', used);
      expect(a).not.toBe(b);
    });
  });

  describe('uniqueHeaders', () => {
    it('numera las preguntas con el mismo texto', () => {
      expect(uniqueHeaders(['A', 'B', 'A'])).toEqual(['A', 'B', 'A (2)']);
    });
  });
});
