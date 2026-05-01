import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventBusService } from "../event-bus.service";
import { EventEnvelopeFactory } from "../event-envelope.factory";
import {
  EventCategory,
  EventEnvelope,
} from "../event-envelope.types";

/**
 * Spec 027 (M2, AC2.5) — ReputationListener.
 *
 * Reage a `NarrativeEvent.npc_witnessed_event` (vindo do WitnessPropagationListener).
 * Aplica delta no `npc_reputation` da testemunha conforme severity → tag map:
 *  - severity=3 → tag 'witnessed-murder' (tier_delta -3, permanente)
 *  - severity=2 → tag 'assault-witnessed' (tier_delta -2, decay 0.1/in_game_day)
 *  - severity=1 → soft pulse, não persiste tag (apenas log) — evita poluição
 *    com micro-eventos de skirmish.
 *
 * Whitelist de tags lockada em `reputation-tags-catalog.json` — esta listener
 * usa subset hard-coded equivalent (sem fetch JSON em runtime). Tabela
 * `npc_reputation` foi criada na migration `CreateReputationFoundation` (1785000000000).
 *
 * Decay rate é informação semântica (decisão do ReputationDecayService cron
 * — M3, AC3.2). Listener só persiste tier + score + tag; cron processa decay.
 *
 * Idempotente via `event_listener_processed`. Emite `SocialEvent.reputation_tag_added`.
 */
@Injectable()
export class ReputationListener implements EventListener {
  readonly name = "ReputationListener";
  readonly categories: readonly EventCategory[] = ["NarrativeEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(ReputationListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "npc_witnessed_event") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const witnessId = envelope.payload?.witnessId as string | undefined;
    const severity = Number(envelope.payload?.severity ?? 1);
    const campaignId = envelope.scope.campaignId;

    if (!witnessId || !campaignId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const mapped = this.mapSeverity(severity);
    if (!mapped) {
      // Severity 1 — soft pulse não persiste. Log e segue.
      this.logger.debug("event_bus.reputation.soft_pulse_skipped", {
        "event.id": envelope.eventId,
        "witness.id": witnessId,
        severity,
      });
      await this.markProcessed(envelope.eventId);
      return;
    }

    try {
      await this.upsertReputation(
        campaignId,
        witnessId,
        mapped.tag,
        mapped.tierDelta,
        envelope.eventId,
        envelope.timestamp,
      );

      const built = this.envelopeFactory.build({
        eventCategory: "SocialEvent",
        eventType: "reputation_tag_added",
        source: {
          service: "diad-backend",
          module: "ReputationListener",
          traceId: envelope.source.traceId,
        },
        scope: {
          campaignId,
          sessionId: envelope.scope.sessionId,
        },
        aggregateId: witnessId,
        payload: {
          npcId: witnessId,
          tag: mapped.tag,
          tierDelta: mapped.tierDelta,
          sourceEventId: envelope.eventId,
        },
        narrativeDescriptor: `Reputação ${mapped.tag} (Δ${mapped.tierDelta}).`,
      });
      await this.eventBus.publish(built);
    } catch (err) {
      this.logger.warn("event_bus.reputation.upsert_failed", {
        "event.id": envelope.eventId,
        "witness.id": witnessId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }

    await this.markProcessed(envelope.eventId);
  }

  private mapSeverity(
    severity: number,
  ): { tag: string; tierDelta: number } | null {
    if (severity >= 3) return { tag: "witnessed-murder", tierDelta: -3 };
    if (severity === 2) return { tag: "assault-witnessed", tierDelta: -2 };
    return null;
  }

  /**
   * Upsert atômico no `npc_reputation` — append tag se nova, recalcula tier
   * via clamp do delta.
   */
  private async upsertReputation(
    campaignId: string,
    npcId: string,
    tag: string,
    tierDelta: number,
    sourceEventId: string,
    sourceEventAt: string,
  ): Promise<void> {
    // CTE update-or-insert. Postgres ON CONFLICT garante atomicidade na
    // unique constraint (npc_id, campaign_id).
    await this.dataSource.query(
      `
      INSERT INTO "npc_reputation" (
        "npc_id", "campaign_id", "tier", "score", "tags",
        "last_event_id", "last_event_at"
      )
      VALUES (
        $1, $2,
        GREATEST(-3, LEAST(3, $3::int)),
        GREATEST(-100, LEAST(100, ($3::int * 10))),
        jsonb_build_array($4::text),
        $5::uuid, $6::timestamptz
      )
      ON CONFLICT ("npc_id", "campaign_id") DO UPDATE SET
        "tier" = GREATEST(-3, LEAST(3,
          "npc_reputation"."tier" + EXCLUDED."tier"
        )),
        "score" = GREATEST(-100, LEAST(100,
          "npc_reputation"."score" + EXCLUDED."score"
        )),
        "tags" = CASE
          WHEN "npc_reputation"."tags" @> EXCLUDED."tags"
            THEN "npc_reputation"."tags"
          ELSE "npc_reputation"."tags" || EXCLUDED."tags"
        END,
        "last_event_id" = EXCLUDED."last_event_id",
        "last_event_at" = EXCLUDED."last_event_at",
        "updated_at" = now()
      `,
      [npcId, campaignId, tierDelta, tag, sourceEventId, sourceEventAt],
    );
  }

  private async alreadyProcessed(eventId: string): Promise<boolean> {
    const found = await this.processedRepo.findOne({
      where: { listenerName: this.name, eventId },
      select: ["id"],
    });
    return !!found;
  }

  private async markProcessed(eventId: string): Promise<void> {
    try {
      await this.processedRepo.save(
        this.processedRepo.create({ listenerName: this.name, eventId }),
      );
    } catch (err) {
      this.logger.warn("event_bus.reputation.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
