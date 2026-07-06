import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFarmCharacterizationFields1782483648934 implements MigrationInterface {
    name = 'AddFarmCharacterizationFields1782483648934'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "farms" ADD "main_access_type" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "farms" ADD "electricity_source_type" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "farms" ADD "water_source_type" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "farms" ADD "plot_count" integer`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "farms" DROP COLUMN "plot_count"`);
        await queryRunner.query(`ALTER TABLE "farms" DROP COLUMN "water_source_type"`);
        await queryRunner.query(`ALTER TABLE "farms" DROP COLUMN "electricity_source_type"`);
        await queryRunner.query(`ALTER TABLE "farms" DROP COLUMN "main_access_type"`);
    }

}
