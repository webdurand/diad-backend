import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventListenerProcessedEntity } from "src/entities/event-listener-processed.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { QuestEntity } from "src/entities/quest.entity";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";
import { DiadLogger } from "../../observability/logger/diad-logger.service";
import { EventListener } from "../event-bus.types";
import { EventCategory, EventEnvelope } from "../event-envelope.types";
import { QuestService } from "src/models/world/services/quest.service";
import { slugifyFuzzy } from "../../text/slugify-fuzzy";


@Injectable()
export class QuestDefeatListener implements EventListener {
  readonly name = "QuestDefeatListener";
  readonly categories: readonly EventCategory[] = ["EncounterEvent"];

  constructor(
    @InjectRepository(EventListenerProcessedEntity)
    private readonly processedRepo: Repository<EventListenerProcessedEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly partRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(QuestObjectiveEntity)
    private readonly objectiveRepo: Repository<QuestObjectiveEntity>,
    private readonly questService: QuestService,
    private readonly logger: DiadLogger,
  ) {
    this.logger.setContext(QuestDefeatListener.name);
  }

  async handle(envelope: EventEnvelope): Promise<void> {
    if (envelope.eventType !== "dying_state_changed") return;
    if (envelope.payload?.next !== "dead") return;
    if (await this.alreadyProcessed(envelope.eventId)) return;

    const participantId = envelope.payload?.participantId as string | undefined;
    if (!participantId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const participant = await this.partRepo.findOne({
      where: { id: participantId },
      select: ["id", "type", "displayName", "encounterId"],
    });
    if (!participant || participant.type === "pc") {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const sessionId = await this.resolveSessionId(participant.encounterId);
    if (!sessionId) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const targetSlug = slugifyFuzzy(participant.displayName);
    if (!targetSlug) {
      await this.markProcessed(envelope.eventId);
      return;
    }

    const matchKind =
      participant.type === "monster" ? "defeat_monster" : "defeat_villain";

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
      if (cond.kind !== matchKind) continue;
      const objTargetSlug = slugifyFuzzy(cond.targetName as string | undefined);
      if (!objTargetSlug || objTargetSlug !== targetSlug) continue;

      const requiredAmount =
        matchKind === "defeat_villain"
          ? 1
          : Math.max(1, Number(cond.amount ?? 1) || 1);

      const newProgress = (activeObj.progressCount ?? 0) + 1;
      activeObj.progressCount = newProgress;
      await this.objectiveRepo.save(activeObj);

      if (newProgress < requiredAmount) {

        this.logger.info("quest_defeat.progress", {
          "quest.slug": quest.slug,
          "objective.idx": activeObj.sortOrder,
          "progress.current": newProgress,
          "progress.required": requiredAmount,
          "participant.type": participant.type,
        });
        continue;
      }

      const evidence =
        matchKind === "defeat_villain"
          ? `Player derrotou ${participant.displayName} (vilão alvo).`
          : `Player derrotou ${participant.displayName} (${newProgress}/${requiredAmount}).`;

      try {
        await this.questService.advanceObjective(
          sessionId,
          quest.slug,
          activeObj.sortOrder,
          "completed",
          evidence,
        );
      } catch (err) {
        this.logger.warn("quest_defeat.advance_failed", {
          "quest.slug": quest.slug,
          "objective.idx": activeObj.sortOrder,
          "error.message": err instanceof Error ? err.message : String(err),
        });
      }
    }

    await this.markProcessed(envelope.eventId);
  }

  private async resolveSessionId(encounterId: string): Promise<string | null> {
    if (!encounterId) return null;
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      select: ["id", "sessionId"],
    });
    return encounter?.sessionId ?? null;
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
      this.logger.warn("quest_defeat.mark_processed_conflict", {
        "event.id": eventId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
    }
  }
}
