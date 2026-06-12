import { MigrationInterface, QueryRunner } from 'typeorm';

export class Spec02ProducerFields1781700000001 implements MigrationInterface {
  name = 'Spec02ProducerFields1781700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Q9: farmer.isRespondent ──────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.isRespondent'
      WHERE text ILIKE '%productor o encargado%'
        AND system_field IS NULL
    `);

    // ── Q10: farmer.producerName ─────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.producerName'
      WHERE text ILIKE '%nombre completo del productor%'
        AND system_field IS NULL
    `);

    // ── Q11: farmer.producerPhone ────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.producerPhone'
      WHERE text ILIKE '%celular del productor%'
        AND system_field IS NULL
    `);

    // ── Q12: farmer.producerEmail ────────────────────────────────────────────
    // Text differs between dev ("...del productor") and prod ("1.12 — Correo electrónico").
    // Identified portably by: contains 'correo', conditioned on Q9 (farmer.isRespondent), value = 'false'.
    await queryRunner.query(`
      UPDATE questions
      SET system_field = 'farmer.producerEmail'
      WHERE text ILIKE '%correo%'
        AND condition_value = 'false'
        AND system_field IS NULL
        AND condition_question_id = (
          SELECT question_id FROM questions
          WHERE text ILIKE '%productor o encargado%'
          LIMIT 1
        )
    `);

    // ── Q13: farmer.producerDocumentId (new question) ───────────────────────
    // Insert after Q12 in the same section. Shift subsequent questions first.
    await queryRunner.query(`
      DO $$
      DECLARE
        v_q9_id      UUID;
        v_section_id UUID;
        v_q12_order  INT;
        v_type_id    UUID;
      BEGIN
        -- Resolve Q9
        SELECT question_id, section_id
        INTO v_q9_id, v_section_id
        FROM questions
        WHERE text ILIKE '%productor o encargado%'
        LIMIT 1;

        IF v_q9_id IS NULL THEN
          RAISE EXCEPTION 'Q9 not found — cannot insert Q13';
        END IF;

        -- Resolve Q12 order (email conditioned on Q9=false)
        SELECT "order"
        INTO v_q12_order
        FROM questions
        WHERE text ILIKE '%correo%'
          AND condition_value = 'false'
          AND condition_question_id = v_q9_id
        LIMIT 1;

        IF v_q12_order IS NULL THEN
          RAISE EXCEPTION 'Q12 not found — cannot determine insertion order for Q13';
        END IF;

        -- Resolve open_text type
        SELECT type_id INTO v_type_id
        FROM types_of_questions
        WHERE name = 'open_text'
        LIMIT 1;

        -- Skip if Q13 already exists (idempotency)
        IF EXISTS (
          SELECT 1 FROM questions
          WHERE system_field = 'farmer.producerDocumentId'
        ) THEN
          RETURN;
        END IF;

        -- Shift questions after Q12 to make room
        UPDATE questions
        SET "order" = "order" + 1
        WHERE section_id = v_section_id
          AND "order" > v_q12_order;

        -- Insert Q13
        INSERT INTO questions (
          question_id, text, is_required,
          condition_question_id, condition_value,
          system_field, "order", section_id, type_id,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          'Número de documento del productor',
          false,
          v_q9_id,
          'false',
          'farmer.producerDocumentId',
          v_q12_order + 1,
          v_section_id,
          v_type_id,
          NOW(),
          NOW()
        );
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove Q13 and compact orders
    await queryRunner.query(`
      DO $$
      DECLARE
        v_section_id UUID;
        v_q13_order  INT;
      BEGIN
        SELECT section_id, "order"
        INTO v_section_id, v_q13_order
        FROM questions
        WHERE system_field = 'farmer.producerDocumentId'
        LIMIT 1;

        IF v_q13_order IS NOT NULL THEN
          DELETE FROM questions WHERE system_field = 'farmer.producerDocumentId';

          UPDATE questions
          SET "order" = "order" - 1
          WHERE section_id = v_section_id
            AND "order" > v_q13_order;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      UPDATE questions SET system_field = NULL
      WHERE system_field IN (
        'farmer.isRespondent',
        'farmer.producerName',
        'farmer.producerPhone',
        'farmer.producerEmail'
      )
    `);
  }
}
