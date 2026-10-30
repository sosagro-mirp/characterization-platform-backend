import * as ExcelJS from 'exceljs';
import { extendAutoFilters } from './production-units-export.service';

// Bug — el autofiltro se fijaba al crear la hoja, cuando todavía no tenía
// filas: Excel mostraba las flechas con los desplegables vacíos.

interface FilterRange {
  from: { row: number; column: number };
  to: { row: number; column: number };
}

const sheetWithHeader = (
  wb: ExcelJS.Workbook,
  name: string,
  header: string[],
) => {
  const ws = wb.addWorksheet(name);
  ws.addRow(header);
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: header.length },
  };
  return ws;
};

const filterOf = (ws: ExcelJS.Worksheet) => ws.autoFilter as FilterRange;

describe('Spec 98 — extendAutoFilters', () => {
  it('estira el rango hasta la última fila de datos', () => {
    const wb = new ExcelJS.Workbook();
    const ws = sheetWithHeader(wb, 'Unidades', ['Finca', 'Municipio']);
    ws.addRow(['La Esperanza', 'Rionegro']);
    ws.addRow(['El Porvenir', 'Marinilla']);

    extendAutoFilters(wb);

    expect(filterOf(ws)).toEqual({
      from: { row: 1, column: 1 },
      to: { row: 3, column: 2 },
    });
  });

  it('estira cada hoja por separado, con su propio número de filas', () => {
    const wb = new ExcelJS.Workbook();
    const unidades = sheetWithHeader(wb, 'Unidades', ['Finca']);
    unidades.addRow(['La Esperanza']);
    const cobertura = sheetWithHeader(wb, 'Cobertura', ['Finca', 'S1a', 'S5']);
    cobertura.addRow(['La Esperanza', 'Aplicado', 'Falta']);
    cobertura.addRow(['El Porvenir', 'Falta', 'Falta']);
    cobertura.addRow(['Villa Luz', 'Parcial', 'Aplicado']);

    extendAutoFilters(wb);

    expect(filterOf(unidades).to).toEqual({ row: 2, column: 1 });
    expect(filterOf(cobertura).to).toEqual({ row: 4, column: 3 });
  });

  it('una hoja sin filas de datos conserva el rango del encabezado', () => {
    const wb = new ExcelJS.Workbook();
    const ws = sheetWithHeader(wb, 'Sin ubicar', ['Encuesta', 'Motivo']);

    extendAutoFilters(wb);

    expect(filterOf(ws).to).toEqual({ row: 1, column: 2 });
  });

  it('no toca las hojas sin autofiltro', () => {
    const wb = new ExcelJS.Workbook();
    const meta = wb.addWorksheet('Metadatos');
    meta.addRow(['Generado', new Date()]);
    meta.addRow(['Usuario', 'admin@sosagro.co']);

    extendAutoFilters(wb);

    // ExcelJS devuelve `null`, no `undefined`, cuando la hoja no tiene filtro.
    expect(meta.autoFilter).toBeNull();
  });
});
