import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionCampaignId1774700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "game_sessions"
      ADD COLUMN "campaign_id" uuid
      REFERENCES "campaigns"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_game_sessions_campaign_id" ON "game_sessions"("campaign_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_game_sessions_campaign_id";`);
    await queryRunner.query(`ALTER TABLE "game_sessions" DROP COLUMN "campaign_id";`);
  }
}
