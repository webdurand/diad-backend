import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoutineSlotsToNpcs1809000000000
  implements MigrationInterface
{
  name = "AddRoutineSlotsToNpcs1809000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE npcs
      ADD COLUMN IF NOT EXISTS routine_slots JSONB NULL
    `);

    await queryRunner.query(`
      INSERT INTO audience_routing (event_category, event_type, default_audiences, overrideable, sub_channel, rationale)
      VALUES
        ('EncounterEvent','random_encounter_started',ARRAY['CombatAgent','Narrator','Director','HUD'],FALSE,'transition','Spec 042/047 — encontro aleatório vira combate observável por HUD, Director e narrador.'),
        ('WorldEvent','poi_moved',ARRAY['Narrator','Director','HUD'],TRUE,'stage-pois','Spec 047 — PC mudou de POI; HUD reidrata hub e Director reavalia contexto local.'),
        ('WorldEvent','world_pulse_random_encounter_triggered',ARRAY['Director','Narrator','HUD'],TRUE,'stage-pois','Spec 047 — Director determinístico disparou encontro por pull ativo em wild.')
      ON CONFLICT (event_category, event_type) DO UPDATE SET
        default_audiences = EXCLUDED.default_audiences,
        overrideable = EXCLUDED.overrideable,
        sub_channel = EXCLUDED.sub_channel,
        rationale = EXCLUDED.rationale
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM audience_routing
      WHERE (event_category, event_type) IN (
        ('EncounterEvent','random_encounter_started'),
        ('WorldEvent','poi_moved'),
        ('WorldEvent','world_pulse_random_encounter_triggered')
      )
    `);
    await queryRunner.query(`
      ALTER TABLE npcs
      DROP COLUMN IF EXISTS routine_slots
    `);
  }
}
