import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventCategory, EventEnvelope } from "../event-envelope.types";
import { QuestService } from "src/models/world/services/quest.service";
import { slugifyFuzzy } from "../../text/slugify-fuzzy";

/**
 * Avança/falha objetivos `gain_reputation` baseado em `reputation_shift`.
 *
 * Threshold simples (alinhado à intuição do produto):
 *   - `newValue >= completionConditions.amount` → completed
 *   - `newValue < 0` → failed (player rompeu com a facção — tipicamente mata
 *     líder, agride membros, alia-se com inimigo declarado)
 *   - intermediário → não muda nada (player ainda está ganhando reputação)
 *
 * Match por nome via `slugifyFuzzy` (mesma normalização do detector de
 * defeat). Idempotente via `event_listener_processed`.
 */
@Injectable()
export class GainReputationListener implements EventListener {
  readonly name = "GainReputationListener";
  readonly categories: readonly EventCategory[] = ["SocialEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    private readonly questService: QuestService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(GainReputationListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "reputation_shift") return;
    const sessionId = envelope.scope.sessionId;
    if (!sessionId) return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const factionName = envelope.payload?.factionName as string | undefined;
    const newValue = Number(envelope.payload?.newValue);
    if (!factionName || Number.isNaN(newValue)) {
      await this.markProcessed(envelope.eventId);
      return;
    }
    const factionSlug = slugifyFuzzy(factionName);
    if (!factionSlug) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const quests = await this.questRepo.find({
      where: { gameSessionId: sessionId, status: "active" },
      relations: ["objectives"],
    });

    for (const quest of quests) {
      const activeObj = (quest.objectives ?? []).find(
        (o) => o.status === "active",
      );
      if (!activeObj) continue;
      const cond = (activeObj.completionConditions ?? {}) as Record<
        string,
        unknown
      >;
      if (cond.kind !== "gain_reputation") continue;
      const objSlug = slugifyFuzzy(cond.targetName as string | undefined);
      if (!objSlug || objSlug !== factionSlug) continue;

      const required = Math.max(1, Number(cond.amount ?? 1) || 1);

      if (newValue >= required) {
        await this.advance(
          sessionId,
          quest.slug,
          activeObj.sortOrder,
          "completed",
          `Reputação com ${factionName} alcançou ${newValue} (≥ ${required}).`,
        );
      } else if (newValue < 0) {
        await this.advance(
          sessionId,
          quest.slug,
          activeObj.sortOrder,
          "failed",
          `Reputação com ${factionName} caiu pra ${newValue} — facção rompeu com o player.`,
        );
      }
    }

    await this.markProcessed(envelope.eventId);
  }

  private async advance(
    sessionId: string,
    slug: string,
    objectiveIdx: number,
    status: "completed" | "failed",
    evidence: string,
  ): Promise<void> {
    try {
      await this.questService.advanceObjective(
        sessionId,
        slug,
        objectiveIdx,
        status,
        evidence,
      );
    } catch (err) {
      this.logger.warn("gain_reputation.advance_failed", {
        "quest.slug": slug,
        "objective.idx": objectiveIdx,
        "objective.status": status,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
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
      this.logger.warn("gain_reputation.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
