import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 027 (M2, AC2.2) — disposition + consent dual-axis state pro NPC.
 *
 * Hoje `npcs.disposition` é uma string global ("neutral"/"hostile"/"friendly")
 * e não cobre nem (a) consent state ortogonal — Padre Anselmo é friendly mas
 * pode estar refusing pra Charm Person — nem (b) escopo per-campaign quando o
 * NPC tem dispositions diferentes em campanhas distintas.
 *
 * Esta migration adiciona uma tabela relacional `npc_disposition` (npc × campaign)
 * + tabela filha `npc_consented_actions` com TTL. Foundry VTT 4-valor enum
 * pra disposition + PoE2-style consent enum + tags categóricas.
 *
 * `npcs.disposition` permanece (compat com código legacy) mas vira default
 * fallback — services novos consultam `npc_disposition` primeiro.
 *
 * Down() simétrico (cascade child antes do parent).
 */
export class CreateNpcDispositionConsent1785010000000
  implements MigrationInterface
{
  name = "CreateNpcDispositionConsent1785010000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────── npc_disposition ───────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "npc_disposition" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "npc_id" uuid NOT NULL,
        "campaign_id" uuid NOT NULL,
        "disposition" varchar(16) NOT NULL DEFAULT 'neutral',
        "disposition_score" integer NOT NULL DEFAULT 0,
        "consent_state" varchar(16) NOT NULL DEFAULT 'unaware',
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "is_aware_of_pc" boolean NOT NULL DEFAULT true,
        "perception_passive" smallint NOT NULL DEFAULT 10,
        "last_disposition_change" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_npc_disposition" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_npc_disposition" UNIQUE ("npc_id", "campaign_id"),
        CONSTRAINT "FK_npc_disp_npc" FOREIGN KEY ("npc_id")
          REFERENCES "npcs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_npc_disp_campaign" FOREIGN KEY ("campaign_id")
          REFERENCES "campaigns"("id") ON DELETE CASCADE,
        CONSTRAINT "npc_disposition_enum_check"
          CHECK ("disposition" IN ('friendly', 'neutral', 'hostile', 'secret')),
        CONSTRAINT "npc_consent_enum_check"
          CHECK ("consent_state" IN ('consenting', 'tolerating', 'unaware', 'refusing')),
        CONSTRAINT "npc_disp_score_check"
          CHECK ("disposition_score" BETWEEN -100 AND 100),
        CONSTRAINT "npc_disp_perception_check"
          CHECK ("perception_passive" BETWEEN 0 AND 30)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_npc_disp_campaign" ON "npc_disposition" ("campaign_id")`,
    );

    // ─────────── npc_consented_actions ───────────
    // Linha por ação consentida — TTL via `expires_at` (NULL = permanente).
    // Lookup do Arbiter: WHERE npc_disposition_id = ? AND (expires_at IS NULL OR expires_at > now()).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "npc_consented_actions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "npc_disposition_id" uuid NOT NULL,
        "action_ref" varchar(80) NOT NULL,
        "scope" varchar(24) NOT NULL DEFAULT 'specific_action',
        "expires_at" timestamptz NULL,
        "declared_at" timestamptz NOT NULL DEFAULT now(),
        "context" varchar(200) NULL,
        CONSTRAINT "PK_npc_consented_actions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_npc_consent_disp" FOREIGN KEY ("npc_disposition_id")
          REFERENCES "npc_disposition"("id") ON DELETE CASCADE,
        CONSTRAINT "npc_consent_scope_check"
          CHECK ("scope" IN ('specific_action', 'category_wildcard', 'all'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_npc_consent_disp" ON "npc_consented_actions" ("npc_disposition_id")`,
    );
    // Index parcial pra hot-path do Arbiter — só rows ativas. Postgres 14+
    // suporta now() em predicate via IMMUTABLE wrapper, mas mais simples manter
    // o filtro de expires_at no SQL do service. Index full cobre lookup por NPC.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_npc_consent_action" ON "npc_consented_actions" ("npc_disposition_id", "action_ref")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_consent_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_consent_disp"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npc_consented_actions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_npc_disp_campaign"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "npc_disposition"`);
  }
}
