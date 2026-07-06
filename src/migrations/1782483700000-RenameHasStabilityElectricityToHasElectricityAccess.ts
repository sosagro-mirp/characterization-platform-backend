import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameHasStabilityElectricityToHasElectricityAccess1782483700000
  implements MigrationInterface
{
  name = 'RenameHasStabilityElectricityToHasElectricityAccess1782483700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farms" RENAME COLUMN "has_stability_electricity" TO "has_electricity_access"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "farms" RENAME COLUMN "has_electricity_access" TO "has_stability_electricity"`,
    );
  }
}
