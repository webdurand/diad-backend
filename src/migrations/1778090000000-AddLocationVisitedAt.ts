import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 014 M2.A — rastreio de visitação por location.
 *
 * `visited_at` nullable marca a primeira vez que os PCs pisaram no location.
 * NULL = não visitado; timestamp = quando foi marcado (via /locations/:id/visit).
 * Persistência é idempotente (primeiro visit grava; subsequentes no-op).
 */
export class AddLocationVisitedAt1778090000000 implements MigrationInterface {
  name = 'AddLocationVisitedAt1778090000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE locations
       ADD COLUMN IF NOT EXISTS visited_at TIMESTAMPTZ NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE locations DROP COLUMN IF EXISTS visited_at`,
    );
  }
}
