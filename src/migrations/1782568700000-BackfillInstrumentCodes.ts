import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 43 (Fase 1): backfilla `instruments.code` para los instrumentos ya
 * sembrados. Antes de esta migración solo 3 instrumentos tenían `code`
 * (S1a→'S1', S1b→'S2', S_DCU) y esos dos primeros colisionaban con la
 * nomenclatura de dashboard.md (donde 'S2' es el instrumento "Cultivos —
 * Identificación de Cadenas"). Los códigos aquí siguen la nomenclatura de
 * `docs/reports/dashboard.md §2/§4`. Los 4 instrumentos "S11" se distinguen
 * con sufijo porque `code` es único.
 */
const CODE_BY_NAME: Array<[string, string]> = [
  ['S1a: Identificación del encuestado/propietario/productor', 'S1a'],
  ['S1b: Identificación de la unidad productiva', 'S1b'],
  ['S2: Cultivos — Identificación de Cadenas', 'S2'],
  ['S2.4: Bloque Cacao', 'S2.4'],
  ['S2.5: Bloque Café', 'S2.5'],
  ['S2.6: Bloque Cannabis', 'S2.6'],
  ['S2.7: Bloque Cáñamo', 'S2.7'],
  ['S3: Manejo del Cultivo, Suelo y Condiciones Ambientales', 'S3'],
  ['S3.4.1: Susceptibilidad a Enfermedades', 'S3.4.1'],
  ['S3B: Caracterización Morfológica Cacao (Técnicos)', 'S3B'],
  ['S4.1: Poscosecha Cacao', 'S4.1'],
  ['S4.2: Poscosecha Café', 'S4.2'],
  ['S4.3: Poscosecha Cannabis', 'S4.3'],
  ['S4.4: Poscosecha Cáñamo', 'S4.4'],
  ['S4.5: Energía y Equipos', 'S4.5'],
  ['S5: Dificultades para Cumplir Estándares de Calidad', 'S5'],
  ['S6A: Generación y Manejo de Residuos — Cacao', 'S6A'],
  ['S6B: Generación y Manejo de Residuos — Café', 'S6B'],
  ['S6C: Generación y Manejo de Residuos — Cannabis', 'S6C'],
  ['S6D: Generación y Manejo de Residuos — Cáñamo', 'S6D'],
  ['S7A: Agua en el Cultivo de Cacao', 'S7A'],
  ['S7B: Agua en el Cultivo de Café', 'S7B'],
  ['S7C: Agua en Cannabis y Cáñamo', 'S7C'],
  ['S8A: Infraestructura de Poscosecha Cacao', 'S8A'],
  ['S8B: Infraestructura de Poscosecha Café', 'S8B'],
  ['S8C: Infraestructura de Producción Cannabis', 'S8C'],
  ['S8D: Infraestructura de Producción Cáñamo', 'S8D'],
  ['S8E: Servicios e Infraestructura General', 'S8E'],
  ['S9: Asociatividad y Canales de Comercialización', 'S9'],
  ['S10: Interés en Participar en el Proyecto', 'S10'],
  ['S11: Adopción Tecnológica — Diagnóstico de Barreras', 'S11-DB'],
  ['S11: Adopción Tecnológica — Diagnóstico Extensionistas', 'S11-EXT'],
  [
    'S11: Adopción Tecnológica — Perfil de Inversión del Propietario',
    'S11-INV',
  ],
  [
    'S11: Adopción Tecnológica — Productores y Propietarios Residentes',
    'S11-RES',
  ],
  ['S12: Aspectos fitosanitarios/Diagnóstico', 'S12'],
  ['S13: Validaciones técnico', 'S13'],
  ['S_DCU: Diagnóstico de Barreras de Adopción Digital — DCU', 'S_DCU'],
];

export class BackfillInstrumentCodes1782568700000 implements MigrationInterface {
  name = 'BackfillInstrumentCodes1782568700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, code] of CODE_BY_NAME) {
      await queryRunner.query(
        `UPDATE "instruments" SET "code" = $1 WHERE "name" = $2`,
        [code, name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const names = CODE_BY_NAME.map(([name]) => name);
    await queryRunner.query(
      `UPDATE "instruments" SET "code" = NULL WHERE "name" = ANY($1)`,
      [names],
    );
    // Restaura el estado previo de S1a/S1b (los únicos que ya tenían code).
    await queryRunner.query(
      `UPDATE "instruments" SET "code" = 'S1' WHERE "name" = 'S1a: Identificación del encuestado/propietario/productor'`,
    );
    await queryRunner.query(
      `UPDATE "instruments" SET "code" = 'S2' WHERE "name" = 'S1b: Identificación de la unidad productiva'`,
    );
  }
}
