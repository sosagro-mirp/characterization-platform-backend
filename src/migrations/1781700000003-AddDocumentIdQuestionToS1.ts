import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentIdQuestionToS1_1781700000003
  implements MigrationInterface
{
  name = 'AddDocumentIdQuestionToS1_1781700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_section_id UUID;
        v_farmer_name_order INT;
        v_type_id UUID;
      BEGIN
        -- Idempotency: skip if farmer.documentId already exists
        IF EXISTS (
          SELECT 1 FROM questions WHERE system_field = 'farmer.documentId'
        ) THEN
          RETURN;
        END IF;

        -- Resolve the section and order of farmer.name
        SELECT q.section_id, q."order"
        INTO v_section_id, v_farmer_name_order
        FROM questions q
        JOIN sections s ON q.section_id = s.section_id
        JOIN instruments i ON s.instrument_id = i.instrument_id
        WHERE i.code = 'S1'
          AND q.text ILIKE '%nombre completo del encuestado%'
        LIMIT 1;

        IF v_section_id IS NULL THEN
          RAISE EXCEPTION 'farmer.name question not found in S1 — cannot insert documentId question';
        END IF;

        -- Resolve open_text type
        SELECT type_id INTO v_type_id
        FROM types_of_questions
        WHERE name = 'open_text'
        LIMIT 1;

        -- Shift questions after farmer.name to make room at farmer_name_order + 1
        UPDATE questions
        SET "order" = "order" + 1
        WHERE section_id = v_section_id
          AND "order" > v_farmer_name_order;

        -- Insert farmer.documentId at farmer_name_order + 1
        INSERT INTO questions (
          question_id, text, is_required,
          condition_question_id, condition_value,
          system_field, "order", section_id, type_id,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          'Número de cédula / documento de identidad',
          true,
          NULL,
          NULL,
          'farmer.documentId',
          v_farmer_name_order + 1,
          v_section_id,
          v_type_id,
          NOW(),
          NOW()
        );
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        v_section_id UUID;
        v_doc_order INT;
      BEGIN
        SELECT section_id, "order"
        INTO v_section_id, v_doc_order
        FROM questions
        WHERE system_field = 'farmer.documentId'
        LIMIT 1;

        IF v_doc_order IS NOT NULL THEN
          DELETE FROM questions WHERE system_field = 'farmer.documentId';

          UPDATE questions
          SET "order" = "order" - 1
          WHERE section_id = v_section_id
            AND "order" > v_doc_order;
        END IF;
      END $$;
    `);
  }
}
