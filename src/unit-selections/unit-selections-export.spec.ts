import * as ExcelJS from 'exceljs';
import { UnitSelectionsExportService } from './unit-selections-export.service';

// Spec 99, C10b — afirma sobre el .xlsx generado, no sobre los helpers.

describe('UnitSelectionsExportService (libro generado)', () => {
  const decisions = [1, 2, 3].map((n) => ({
    farm_id: `f${n}`,
    farm_name: `Finca ${n}`,
    department: 'Huila',
    town: 'Pitalito',
    crops: 'Café',
    farmers: 'Ana',
    status: n === 1 ? 'included' : 'in_review',
    reason: `Motivo ${n}`,
    version: n,
    updated_at: new Date(),
  }));
  const events = decisions.map((d) => ({
    farm_name: d.farm_name,
    created_at: new Date(),
    from_status: null,
    to_status: d.status,
    reason: d.reason,
    user_name: 'Admin',
  }));

  it('autofiltro hasta la última fila y columnas en el orden del encabezado', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce(decisions)
        .mockResolvedValueOnce(events)
        .mockResolvedValueOnce([{ n: 5 }]),
    };
    const logs = { create: jest.fn((x: unknown) => x), save: jest.fn() };
    const service = new UnitSelectionsExportService(
      dataSource as never,
      logs as never,
    );

    const { buffer, rowCount } = await service.export(
      {},
      {
        userId: null,
        email: 'a@b.c',
      },
    );
    expect(rowCount).toBe(3);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.getWorksheet('Decisiones')!;
    // Al releer el libro, ExcelJS devuelve el rango como texto ("A1:I4").
    expect(sheet.autoFilter).toBe(`A1:I${sheet.rowCount}`);
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'Finca',
      'Departamento',
      'Municipio',
      'Cultivos',
      'Productores',
      'Decisión',
      'Motivo',
      'Versión',
      'Actualizada',
    ]);
    expect(sheet.getRow(2).getCell(6).value).toBe('Incluida');
    expect(typeof sheet.getRow(2).getCell(8).value).toBe('number');
    expect(logs.save).toHaveBeenCalled();
  });
});
