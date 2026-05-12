import { MigrationInterface, QueryRunner } from "typeorm";

export class AddClockStatusAndEvents1789900000000
  implements MigrationInterface
{
  name = "AddClockStatusAndEvents1789900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE clocks
      ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`
      UPDATE clocks
         SET status = CASE
           WHEN filled >= segments THEN 'filled'
           ELSE 'active'
         END
       WHERE status IS NULL OR status = 'active'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'clocks_status_check'
        ) THEN
          ALTER TABLE clocks
          ADD CONSTRAINT clocks_status_check
          CHECK (status IN ('active','filled','resolved','expired'));
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO audience_routing (
        event_category,
        event_type,
        default_audiences,
        overrideable,
        sub_channel,
        rationale
      )
      VALUES
        (
          'NarrativeEvent',
          'clock_progressed',
          ARRAY['Narrator','Director','HUD'],
          TRUE,
          'ambiance-pill',
          'Clock progress changes visible world pressure; HUD and narrator need the same turn context.'
        ),
        (
          'NarrativeEvent',
          'clock_filled',
          ARRAY['Narrator','Director','HUD'],
          FALSE,
          'ambiance-pill',
          'Filled clocks are rupture points and must reach HUD/Director immediately.'
        ),
        (
          'NarrativeEvent',
          'clock_resolved',
          ARRAY['Narrator','Director','HUD'],
          TRUE,
          'ambiance-pill',
          'Resolved tensions update the current atmosphere and sidebar state.'
        )
      ON CONFLICT (event_category, event_type)
      DO UPDATE SET
        default_audiences = EXCLUDED.default_audiences,
        overrideable = EXCLUDED.overrideable,
        sub_channel = EXCLUDED.sub_channel,
        rationale = EXCLUDED.rationale
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM audience_routing
      WHERE event_category = 'NarrativeEvent'
        AND event_type IN ('clock_progressed','clock_filled','clock_resolved')
    `);
    await queryRunner.query(`
      ALTER TABLE clocks
      DROP CONSTRAINT IF EXISTS clocks_status_check
    `);
    await queryRunner.query(`
      ALTER TABLE clocks
      DROP COLUMN IF EXISTS status
    `);
  }
}
