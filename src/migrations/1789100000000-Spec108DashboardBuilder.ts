import { MigrationInterface, QueryRunner } from 'typeorm';

// Spec 108 — constructor de dashboard: modelo de datos.
// Cuatro tablas nuevas y la siembra de C1–C14 + OVERVIEW. Solo esquema nuevo:
// no toca datos existentes y es reversible.
const CATEGORIES: Array<[string, string]> = [
  ['C1', 'Perfil del productor y la finca'],
  ['C2', 'Ubicación y acceso'],
  ['C3', 'Cultivos y variedades'],
  ['C4', 'Suelo, clima y fertilización'],
  ['C5', 'Sanidad vegetal'],
  ['C6', 'Poscosecha y calidad'],
  ['C7', 'Energía y equipos'],
  ['C8', 'Residuos y valorización'],
  ['C9', 'Agua'],
  ['C10', 'Infraestructura productiva'],
  ['C11', 'Servicios y conectividad'],
  ['C12', 'Comercialización y asociatividad'],
  ['C13', 'Participación en el proyecto'],
  ['C14', 'Adopción tecnológica e interés digital'],
];

export class Spec108DashboardBuilder1789100000000 implements MigrationInterface {
  name = 'Spec108DashboardBuilder1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "dashboard_categories" (
        "category_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" varchar(50) NOT NULL,
        "name" varchar(255) NOT NULL,
        "description" text,
        "position" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_reserved" boolean NOT NULL DEFAULT false,
        "created_by" uuid,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_categories" PRIMARY KEY ("category_id"),
        CONSTRAINT "UQ_dashboard_categories_code" UNIQUE ("code")
      )`);
    await queryRunner.query(`
      CREATE TABLE "dashboard_charts" (
        "chart_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "subtitle" varchar(500),
        "source_kind" varchar(20) NOT NULL,
        "question_type" varchar(50),
        "chart_kind" varchar(50) NOT NULL,
        "combine_mode" varchar(10) NOT NULL DEFAULT 'merge',
        "settings" jsonb NOT NULL DEFAULT '{}',
        "entity_metric_key" varchar(100),
        "audience" varchar(10) NOT NULL DEFAULT 'public',
        "status" varchar(10) NOT NULL DEFAULT 'draft',
        "layout" varchar(10) NOT NULL DEFAULT 'normal',
        "position" integer NOT NULL DEFAULT 0,
        "archived_at" timestamptz,
        "created_by" uuid,
        "updated_by" uuid,
        "published_by" uuid,
        "published_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_dashboard_charts" PRIMARY KEY ("chart_id"),
        CONSTRAINT "FK_dashboard_charts_category" FOREIGN KEY ("category_id")
          REFERENCES "dashboard_categories"("category_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_dashboard_charts_source_kind" CHECK ("source_kind" IN ('questions','entity_metric')),
        CONSTRAINT "CHK_dashboard_charts_combine_mode" CHECK ("combine_mode" IN ('merge','compare')),
        CONSTRAINT "CHK_dashboard_charts_audience" CHECK ("audience" IN ('public','private')),
        CONSTRAINT "CHK_dashboard_charts_status" CHECK ("status" IN ('draft','published')),
        CONSTRAINT "CHK_dashboard_charts_layout" CHECK ("layout" IN ('normal','wide'))
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dashboard_charts_listing" ON "dashboard_charts" ("category_id","status","audience","position")`,
    );
    await queryRunner.query(`
      CREATE TABLE "dashboard_chart_sources" (
        "source_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chart_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "series_key" varchar(100) NOT NULL,
        "series_label" varchar(255) NOT NULL,
        "series_position" integer NOT NULL DEFAULT 0,
        "is_representative" boolean NOT NULL DEFAULT false,
        "instrument_code_snapshot" varchar(100),
        "question_text_snapshot" text NOT NULL,
        CONSTRAINT "PK_dashboard_chart_sources" PRIMARY KEY ("source_id"),
        CONSTRAINT "UQ_dashboard_chart_sources_chart_question" UNIQUE ("chart_id","question_id"),
        CONSTRAINT "FK_dashboard_chart_sources_chart" FOREIGN KEY ("chart_id")
          REFERENCES "dashboard_charts"("chart_id") ON DELETE CASCADE,
        CONSTRAINT "FK_dashboard_chart_sources_question" FOREIGN KEY ("question_id")
          REFERENCES "questions"("question_id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dashboard_chart_sources_question" ON "dashboard_chart_sources" ("question_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "dashboard_chart_events" (
        "event_id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "chart_id" uuid NOT NULL,
        "event_type" varchar(20) NOT NULL,
        "user_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "summary" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_dashboard_chart_events" PRIMARY KEY ("event_id"),
        CONSTRAINT "FK_dashboard_chart_events_chart" FOREIGN KEY ("chart_id")
          REFERENCES "dashboard_charts"("chart_id") ON DELETE CASCADE
      )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_dashboard_chart_events_chart" ON "dashboard_chart_events" ("chart_id","created_at")`,
    );

    for (const [i, [code, name]] of CATEGORIES.entries()) {
      await queryRunner.query(
        `INSERT INTO "dashboard_categories" ("code","name","position","is_reserved") VALUES ($1,$2,$3,false)`,
        [code, name, i + 1],
      );
    }
    await queryRunner.query(
      `INSERT INTO "dashboard_categories" ("code","name","position","is_reserved")
       VALUES ('OVERVIEW','Resumen general',0,true)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dashboard_chart_events"`);
    await queryRunner.query(`DROP TABLE "dashboard_chart_sources"`);
    await queryRunner.query(`DROP TABLE "dashboard_charts"`);
    await queryRunner.query(`DROP TABLE "dashboard_categories"`);
  }
}
