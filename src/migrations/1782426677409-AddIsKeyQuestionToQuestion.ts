import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsKeyQuestionToQuestion1782426677409 implements MigrationInterface {
    name = 'AddIsKeyQuestionToQuestion1782426677409'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "questions" ADD "is_key_question" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "questions" DROP COLUMN "is_key_question"`);
    }

}
