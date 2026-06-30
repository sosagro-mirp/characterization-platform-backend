import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMetadataIdToOptionsQuestion1782568579223 implements MigrationInterface {
    name = 'AddMetadataIdToOptionsQuestion1782568579223'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "options_question" ADD "metadata_id" character varying(36)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "options_question" DROP COLUMN "metadata_id"`);
    }

}
