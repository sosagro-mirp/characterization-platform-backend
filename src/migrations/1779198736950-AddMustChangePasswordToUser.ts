import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMustChangePasswordToUser1779198736950 implements MigrationInterface {
    name = 'AddMustChangePasswordToUser1779198736950'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "must_change_password" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "must_change_password"`);
    }

}
