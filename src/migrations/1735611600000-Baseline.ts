import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1735611600000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Baseline migration: schema already exists and is managed by synchronize: true
    // This migration marks the point from which subsequent migrations will be version-controlled
  }

  public down(_queryRunner: QueryRunner): Promise<void> {
    // Rollback not supported for baseline
    return Promise.reject(new Error('Cannot rollback baseline migration'));
  }
}
