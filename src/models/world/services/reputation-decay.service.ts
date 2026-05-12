import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";

export interface ReputationDecayResult {
  campaignsAffected: number;
  npcsDecayed: number;
}

/**
 * Spec 027 (M3/AC3.2) — ReputationDecayService.
 *
 * Reputação decai 1 step toward 0 por NPC a cada long rest do PC. Trigger
 * canônico D&D 5e RAW: long rest = "passou tempo, comunidade esfria". Em
 * vez de cron daily (que nunca dispara durante sessão de horas in-game),
 * usa o long rest como evento discreto natural — alinhado ao gameplay loop
 * do BG3 (rest entre dungeons cura body + reputação).
 *
 * Decay step:
 *  - tier: ±1 toward 0 (-3..3 → -2..2 → ... → 0).
 *  - score: ±10 toward 0 com clamp a 0 (impede atravessar zero).
 *
 * NÃO toca tags (são marcadores históricos, persistentes — "witnessed-murder"
 * não esquece com rest). Decay afeta só pontuação numérica.
 *
 * Idempotência fraca: long rest spam (rest 5x seguidas) decai 5x — feature,
 * não bug. Long rest é trigger raro no fluxo real (1-2 por sessão); spam
 * só ocorre em harness/teste e desejado pra validar decay rápido.
 */
@Injectable()
export class ReputationDecayService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(ReputationDecayService.name);
  }

  /**
   * Aplica 1 step de decay em todos os NPCs dos campaigns onde o character
   * está em sessão ativa/pausada. Best-effort — falhas logam warn e
   * retornam zeros.
   */
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
