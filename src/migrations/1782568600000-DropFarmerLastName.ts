import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropFarmerLastName1782568600000 implements MigrationInterface {
  name = 'DropFarmerLastName1782568600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "farmers" DROP COLUMN "last_name"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farmers" ADD "last_name" varchar(255)`,
    );
  }
}
