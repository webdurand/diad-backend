import { MigrationInterface, QueryRunner } from "typeorm";


export class CreateNarrativeDecision1778040000000 implements MigrationInterface {
  name = "CreateNarrativeDecision1778040000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS narrative_decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        session_id UUID NULL REFERENCES game_sessions(id) ON DELETE SET NULL,
        scene_id UUID NULL REFERENCES scenes(id) ON DELETE SET NULL,
        actor_participant_id UUID NULL,
        decision_text TEXT NOT NULL,
        affected_entity_type VARCHAR NULL,
        affected_entity_id UUID NULL,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        impact_weight SMALLINT NOT NULL DEFAULT 5,
        payoff_window VARCHAR NOT NULL DEFAULT 'act',
        payoff_scene_target INT NULL,
        payoff_realized_at_scene INT NULL,
        provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT narrative_decisions_impact_weight_range
          CHECK (impact_weight BETWEEN 1 AND 10),
        CONSTRAINT narrative_decisions_payoff_window_check
          CHECK (payoff_window IN ('immediate','act','campaign')),
        CONSTRAINT narrative_decisions_affected_entity_type_check
          CHECK (affected_entity_type IS NULL OR affected_entity_type IN
            ('npc','location','quest','faction','party','item'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_narrative_decisions_campaign_id
         ON narrative_decisions(campaign_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_narrative_decisions_campaign_created
         ON narrative_decisions(campaign_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_narrative_decisions_campaign_impact
         ON narrative_decisions(campaign_id, impact_weight DESC)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_narrative_decisions_campaign_impact`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_narrative_decisions_campaign_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_narrative_decisions_campaign_id`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS narrative_decisions`);
  }
}
