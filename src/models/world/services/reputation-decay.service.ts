import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export interface ReputationDecayResult {
  campaignsAffected: number;
  npcsDecayed: number;
}


@Injectable()
export class ReputationDecayService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(ReputationDecayService.name);
  }


  async applyOnLongRest(characterId: string): Promise<ReputationDecayResult> {
    try {
      const result = await this.dataSource.query(
        `
        WITH active_campaigns AS (
          SELECT DISTINCT s.campaign_id
          FROM "game_sessions" s
          WHERE s.campaign_id IS NOT NULL
            AND s.status IN ('active','paused')
            AND s.character_ids @> jsonb_build_array($1::text)
        ),
        decayed AS (
          UPDATE "npc_reputation" r
          SET
            "tier" = CASE
              WHEN r."tier" > 0 THEN r."tier" - 1
              WHEN r."tier" < 0 THEN r."tier" + 1
              ELSE r."tier"
            END,
            "score" = CASE
              WHEN r."score" >= 10 THEN r."score" - 10
              WHEN r."score" <= -10 THEN r."score" + 10
              ELSE 0
            END,
            "updated_at" = now()
          WHERE r."campaign_id" IN (SELECT campaign_id FROM active_campaigns)
            AND (r."score" <> 0 OR r."tier" <> 0)
          RETURNING r."campaign_id"
        )
        SELECT
          (SELECT COUNT(*) FROM active_campaigns)::int AS "campaignsAffected",
          (SELECT COUNT(*) FROM decayed)::int AS "npcsDecayed"
        `,
        [characterId],
      );

      const row = Array.isArray(result) && result.length > 0 ? result[0] : null;
      const out: ReputationDecayResult = {
        campaignsAffected: Number(row?.campaignsAffected ?? 0),
        npcsDecayed: Number(row?.npcsDecayed ?? 0),
      };

      if (out.npcsDecayed > 0) {
        this.logger.info("reputation.decay_applied_long_rest", {
          "character.id": characterId,
          "campaigns.affected": out.campaignsAffected,
          "npcs.decayed": out.npcsDecayed,
        });
      }

      return out;
    } catch (err) {
      this.logger.warn("reputation.decay_failed", {
        "character.id": characterId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
      return { campaignsAffected: 0, npcsDecayed: 0 };
    }
  }
}
