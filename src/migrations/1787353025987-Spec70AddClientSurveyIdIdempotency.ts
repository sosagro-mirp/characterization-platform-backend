import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 70 (Fase 9): agrega `client_survey_id` a `surveys` como clave de
 * idempotencia. El cliente móvil ya genera un id local estable por encuesta
 * (`local_survey_<uuid>`) que sobrevive al reintento; reenviarlo en un
 * `POST /api/surveys` que se pierde en tránsito permite al backend devolver
 * la encuesta ya creada en vez de duplicarla.
 *
 * El índice es único **parcial** (`WHERE client_survey_id IS NOT NULL`):
 * todo lo existente y todo lo creado desde la web queda en NULL, y Postgres
 * no aplica unicidad sobre NULL en un índice parcial con ese WHERE — sin el
 * parcial, el índice seguiría siendo válido (NULL nunca colisiona consigo
 * mismo en un UNIQUE normal tampoco), pero indexaría de más y la intención
 * quedaría implícita.
 *
 * Nota: el archivo generado por `pnpm migration:generate` arrastraba dos
 * `ALTER TABLE api_keys DROP/ADD CONSTRAINT` ajenos a este cambio — deuda de
 * nombres de constraint entre una migración anterior escrita a mano
 * (`CreateApiKeys`) y lo que TypeORM esperaría generar. Se removieron de
 * este archivo; no son parte del spec 70.
 */
export class Spec70AddClientSurveyIdIdempotency1787353025987 implements MigrationInterface {
  name = 'Spec70AddClientSurveyIdIdempotency1787353025987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD "client_survey_id" character varying(100)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_surveys_client_survey_id" ON "surveys" ("client_survey_id") WHERE "client_survey_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_surveys_client_survey_id"`);
    await queryRunner.query(
      `ALTER TABLE "surveys" DROP COLUMN "client_survey_id"`,
    );
  }
}
