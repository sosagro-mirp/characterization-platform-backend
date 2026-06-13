import { MigrationInterface, QueryRunner } from 'typeorm';

export class SetBaseSystemFields1781700000002 implements MigrationInterface {
  name = 'SetBaseSystemFields1781700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // farmer.name
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.name'
      WHERE text ILIKE '%nombre completo del encuestado%'
        AND system_field IS NULL
    `);

    // farmer.phone
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.phone'
      WHERE text ILIKE '%celular del encuestado%'
        AND system_field IS NULL
    `);

    // farmer.email — the unconditioned "correo" in S1 (no condition_question_id)
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.email'
      WHERE question_id = (
        SELECT q.question_id
        FROM questions q
        JOIN sections s ON q.section_id = s.section_id
        JOIN instruments i ON s.instrument_id = i.instrument_id
        WHERE i.code = 'S1'
          AND q.text ILIKE '%correo%'
          AND q.condition_question_id IS NULL
          AND q.system_field IS NULL
        LIMIT 1
      )
    `);

    // farm.name
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farm.name'
      WHERE text ILIKE '%nombre de la finca%'
        AND system_field IS NULL
    `);

    // farm.vereda
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farm.vereda'
      WHERE text ILIKE '%vereda%' AND text ILIKE '%sector%'
        AND system_field IS NULL
    `);

    // farm.altitude
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farm.altitude'
      WHERE text ILIKE '%altitud%'
        AND system_field IS NULL
    `);

    // farm.latitude
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farm.latitude'
      WHERE text ILIKE '%latitud%'
        AND system_field IS NULL
    `);

    // farm.longitude
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farm.longitude'
      WHERE text ILIKE '%longitud%'
        AND system_field IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE questions SET system_field = NULL
      WHERE system_field IN (
        'farmer.name',
        'farmer.phone',
        'farmer.email',
        'farm.name',
        'farm.vereda',
        'farm.altitude',
        'farm.latitude',
        'farm.longitude'
      )
    `);
  }
}
