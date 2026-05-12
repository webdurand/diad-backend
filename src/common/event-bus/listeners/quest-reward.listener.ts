import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignEntity } from "src/entities/campaign.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { FactionEntity } from "src/entities/faction.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventCategory, EventEnvelope } from "../event-envelope.types";
import { XpAwardService } from "src/models/game-engine/services/xp-award.service";
import { SessionFactionStateService } from "src/models/world/services/session-faction-state.service";
import { slugifyFuzzy } from "../../text/slugify-fuzzy";

interface QuestRewards {
  xp?: number;
  gold?: number;
  items?: string[];
  reputation?: Record<string, number>;
}

/**
 * Aplica rewards declarados em `quest.rewards` quando a quest completa:
 *   - `xp`: distribuído integralmente a cada PC da sessão via XpAwardService
 *     (source `quest_completion`).
 *   - `gold`: somado a `character_state.gp` de cada PC (split inteiro).
 *   - `reputation`: por faction name → `applyDelta` no SessionFactionStateService
 *     (que por sua vez emite `reputation_shift` — pode encadear em outra quest).
 *   - `items`: V2; por enquanto só log.
 *
 * Idempotente via `event_listener_processed` (mesma quest auto-completada
 * 2× via race não credita 2×). Best-effort por character: erro num PC não
 * bloqueia os demais.
 */
@Injectable()
export class QuestRewardListener implements EventListener {
  readonly name = "QuestRewardListener";
  readonly categories: readonly EventCategory[] = ["WorldEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly characterStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(FactionEntity)
    private readonly factionRepo: Repository<FactionEntity>,
    private readonly xpAwardService: XpAwardService,
    private readonly factionStateService: SessionFactionStateService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(QuestRewardListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "quest_completed") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const sessionId = envelope.scope.sessionId;
    const questId = envelope.payload?.questId as string | undefined;
    const campaignId = envelope.scope.campaignId;
    if (!sessionId || !questId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const quest = await this.questRepo.findOne({ where: { id: questId } });
    if (quest?.isMainQuest && campaignId) {
      await this.markCampaignVictory(campaignId, quest);
    }

    const rewards = (quest?.rewards ?? {}) as QuestRewards;
    const hasAny =
      (rewards.xp ?? 0) > 0 ||
      (rewards.gold ?? 0) > 0 ||
      (rewards.items?.length ?? 0) > 0 ||
      Object.keys(rewards.reputation ?? {}).length > 0;
    if (!hasAny) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true, characterIds: true },
    });
    const characterIds = session?.characterIds ?? [];

    if (characterIds.length > 0) {
      await this.applyXpAndGold(
        characterIds,
        rewards,
        questId,
        campaignId,
        quest?.slug ?? "",
      );
    }

    if (campaignId && rewards.reputation) {
      await this.applyReputation(
        sessionId,
        campaignId,
        rewards.reputation,
        quest?.slug ?? "",
      );
    }

    if (rewards.items?.length) {
      this.logger.info("quest_reward.items_skipped_v2", {
        "quest.id": questId,
        "quest.slug": quest?.slug ?? "",
        "items.count": rewards.items.length,
      });
    }

    await this.markProcessed(envelope.eventId);
  }

  private async markCampaignVictory(
    campaignId: string,
    quest: QuestEntity,
  ): Promise<void> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });
    if (!campaign || campaign.questionAnswered) return;

    const previousBeat = campaign.arcState?.currentBeat ?? "YOU";
    const atScene = campaign.currentCounts?.scenes ?? 0;
    campaign.questionAnswered = true;
    campaign.questionAnswer =
      campaign.questionAnswer ?? `A missão principal "${quest.name}" foi concluída.`;
    campaign.status = "completed";
    campaign.arcState = {
      currentBeat: "CHANGE",
      beatEnteredAtScene: atScene,
      transitionHistory: [
        ...(campaign.arcState?.transitionHistory ?? []),
        {
          from: previousBeat,
          to: "CHANGE",
          atScene,
          reason: `Main quest completed: ${quest.slug}`,
        },
      ],
    };

    try {
      await this.campaignRepo.save(campaign);
      this.logger.info("campaign_victory.marked", {
        "campaign.id": campaignId,
        "quest.id": quest.id,
        "quest.slug": quest.slug,
      });
    } catch (err) {
      this.logger.warn("campaign_victory.mark_failed", {
        "campaign.id": campaignId,
        "quest.id": quest.id,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async applyXpAndGold(
    characterIds: string[],
    rewards: QuestRewards,
    questId: string,
    campaignId: string | undefined,
    questSlug: string,
  ): Promise<void> {
    const characters = await this.characterRepo.find({
      where: characterIds.map((id) => ({ id })),
      select: { id: true, userId: true, name: true },
    });

    const xpAmount = Math.max(0, Math.floor(rewards.xp ?? 0));
    const goldAmount = Math.max(0, Math.floor(rewards.gold ?? 0));

    for (const character of characters) {
      if (xpAmount > 0) {
        try {
          await this.xpAwardService.awardXp({
            characterId: character.id,
            amount: xpAmount,
            source: "quest_completion",
            reason: `Recompensa de quest: ${questSlug}`,
            ownerUserId: character.userId,
            campaignId,
          });
        } catch (err) {
          this.logger.warn("quest_reward.xp_failed", {
            "character.id": character.id,
            "quest.id": questId,
            "error.message": err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (goldAmount > 0) {
        try {
          await this.characterStateRepo
            .createQueryBuilder()
            .update()
            .set({ gp: () => `gp + :delta` })
            .where("character_id = :characterId", {
              characterId: character.id,
              delta: goldAmount,
            })
            .execute();
        } catch (err) {
          this.logger.warn("quest_reward.gold_failed", {
            "character.id": character.id,
            "quest.id": questId,
            "error.message": err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  private async applyReputation(
    sessionId: string,
    campaignId: string,
    reputation: Record<string, number>,
    questSlug: string,
  ): Promise<void> {
    const factions = await this.factionRepo.find({
      where: { campaignId },
      select: { id: true, name: true },
    });
    for (const [key, deltaRaw] of Object.entries(reputation)) {
      const delta = Math.floor(Number(deltaRaw) || 0);
      if (!delta) continue;
      const keySlug = slugifyFuzzy(key);
      const faction = factions.find((f) => slugifyFuzzy(f.name) === keySlug);
      if (!faction) {
        this.logger.warn("quest_reward.faction_not_found", {
          "quest.slug": questSlug,
          "faction.key": key,
        });
        continue;
      }
      try {
        await this.factionStateService.applyDelta(
          sessionId,
          faction.id,
          delta,
          `quest_reward:${questSlug}`,
        );
      } catch (err) {
        this.logger.warn("quest_reward.reputation_failed", {
          "faction.id": faction.id,
          "delta": delta,
          "error.message": err instanceof Error ? err.message : String(err),
        });
      }
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
      this.logger.warn("quest_reward.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
