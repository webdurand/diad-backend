import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QuestEntity } from "src/entities/quest.entity";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";
import { QuestPrerequisiteEntity } from "src/entities/quest-prerequisite.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { EventAudience } from "src/common/event-bus/event-envelope.types";
import { randomBytes } from "crypto";

const MISSION_AUDIENCES: EventAudience[] = [
  "Narrator",
  "Director",
  "HUD",
  "CompanionAI",
];

export interface CreateQuestDto {
  name: string;
  description?: string;
  descriptionHidden?: string;
  storyArcId?: string;
  giverNpcId?: string;
  locationId?: string;
  rewards?: {
    xp?: number;
    gold?: number;
    items?: string[];
    reputation?: Record<string, number>;
  };
  levelRange?: { min?: number; max?: number };
  objectives?: Array<{
    description: string;
    pathGroup?: string;
    isOptional?: boolean;
    kind?: "talk_to_npc" | "travel_to" | "defeat_monster" | "gain_reputation";
    targetName?: string;
    targetNpcId?: string;
    targetLocationId?: string;
    targetFactionId?: string;
    targetCity?: string | null;
    amount?: number | null;
  }>;
  isMainQuest?: boolean;
  triggerNpcName?: string;
  triggerLocationName?: string;
  activationKeys?: string[];
}

export interface UpdateQuestDto {
  name?: string;
  description?: string;
  descriptionHidden?: string;
  status?:
    | "unknown"
    | "available"
    | "active"
    | "completed"
    | "failed"
    | "abandoned";
  storyArcId?: string;
  giverNpcId?: string;
  locationId?: string;
  rewards?: Record<string, any>;
}

export interface RevealQuestResult {
  quest: QuestEntity;
  alreadyRevealed: boolean;
}

export interface AdvanceObjectiveResult {
  objective: QuestObjectiveEntity;
  questAutoCompleted: boolean;
  questAutoFailed: boolean;
}

@Injectable()
export class QuestService {
  constructor(
    @InjectRepository(QuestEntity)
    private readonly questRepo: Repository<QuestEntity>,
    @InjectRepository(QuestObjectiveEntity)
    private readonly objectiveRepo: Repository<QuestObjectiveEntity>,
    @InjectRepository(QuestPrerequisiteEntity)
    private readonly prereqRepo: Repository<QuestPrerequisiteEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  private async publishQuestEvent(
    eventType:
      | "quest_revealed"
      | "quest_advanced"
      | "quest_completed"
      | "quest_failed",
    gameSessionId: string,
    payload: Record<string, unknown>,
    narrativeDescriptor?: string,
  ): Promise<void> {
    try {
      const session = await this.sessionRepo.findOne({
        where: { id: gameSessionId },
        select: { id: true, campaignId: true },
      });
      if (!session?.campaignId) return;
      const envelope = this.envelopeFactory.build({
        eventCategory: "WorldEvent",
        eventType,
        source: {
          service: "diad-backend",
          module: `QuestService.${eventType}`,
        },
        scope: {
          campaignId: session.campaignId,
          sessionId: gameSessionId,
        },
        payload,
        narrativeDescriptor,
      });
      await this.eventBus.publish(envelope);
    } catch {

    }
  }

  private async publishMissionProgressAdvanced(
    gameSessionId: string,
    quest: QuestEntity,
    objective: QuestObjectiveEntity,
    oldProgress: number,
    newProgress: number,
    narrativeDescriptor: string | null,
  ): Promise<void> {
    try {
      const session = await this.sessionRepo.findOne({
        where: { id: gameSessionId },
        select: { id: true, campaignId: true },
      });
      if (!session?.campaignId) return;
      await this.sessionRepo.update(gameSessionId, {
        turnsSinceMissionProgress: 0,
      });
      const envelope = this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "mission_progress_advanced",
        source: {
          service: "diad-backend",
          module: "QuestService.advanceObjective",
        },
        scope: {
          campaignId: session.campaignId,
          sessionId: gameSessionId,
        },
        payload: {
          sessionId: gameSessionId,
          questId: quest.id,
          questSlug: quest.slug,
          objectiveId: objective.id,
          objectiveDescription: objective.description,
          objectiveStatus: objective.status,
          oldProgress,
          newProgress,
          completedConditions:
            objective.status === "completed"
              ? [`objective_completed:${objective.id}`]
              : [],
        },
        audiences: MISSION_AUDIENCES,
        narrativeDescriptor:
          narrativeDescriptor ?? `Missão avançou: ${objective.description}`,
      });
      await this.eventBus.publish(envelope);
    } catch {

    }
  }

  async create(
    gameSessionId: string,
    dto: CreateQuestDto,
  ): Promise<QuestEntity> {
    const slug = this.generateSlug(dto.name);
    const quest = this.questRepo.create({
      gameSessionId,
      slug,
      name: dto.name,
      description: dto.description,
      descriptionHidden: dto.descriptionHidden,
      storyArcId: dto.storyArcId,
      giverNpcId: dto.giverNpcId,
      locationId: dto.locationId,
      rewards: dto.rewards ?? {},
      levelRange: dto.levelRange,
      status: "unknown",
      isMainQuest: dto.isMainQuest ?? false,
      triggerNpcName: dto.triggerNpcName,
      triggerLocationName: dto.triggerLocationName,
      activationKeys: (dto.activationKeys ?? []).map((k) =>
        k.toLowerCase().trim(),
      ),
    });

    const saved = await this.questRepo.save(quest);

    if (dto.objectives?.length) {
      const objectives = dto.objectives.map((o, i) => {
        const completionConditions: Record<string, any> = {};
        if (o.kind) completionConditions.kind = o.kind;
        if (o.targetName) completionConditions.targetName = o.targetName;
        if (o.targetNpcId) completionConditions.targetNpcId = o.targetNpcId;
        if (o.targetLocationId) {
          completionConditions.targetLocationId = o.targetLocationId;
        }
        if (o.targetFactionId) {
          completionConditions.targetFactionId = o.targetFactionId;
        }
        if (o.targetCity !== undefined && o.targetCity !== null) {
          completionConditions.targetCity = o.targetCity;
        }
        if (o.amount !== undefined && o.amount !== null) {
          completionConditions.amount = o.amount;
        }
        return this.objectiveRepo.create({
          questId: saved.id,
          description: o.description,
          pathGroup: o.pathGroup,
          isOptional: o.isOptional ?? false,
          sortOrder: i,
          status: i === 0 ? "active" : "locked",
          completionConditions,
        });
      });
      await this.objectiveRepo.save(objectives);
    }

    return this.getById(saved.id);
  }

  async revealQuest(
    gameSessionId: string,
    slug: string,
    evidence: string | null,
  ): Promise<RevealQuestResult> {
    const quest = await this.questRepo.findOne({
      where: { gameSessionId, slug },
      relations: ["objectives"],
    });
    if (!quest) {
      throw new NotFoundException({
        ok: false,
        error: `Quest '${slug}' nao encontrada na aventura.`,
        code: "QUEST_NOT_FOUND",
      });
    }

    if (quest.status !== "unknown") {
      return { quest, alreadyRevealed: true };
    }

    quest.status = "active";
    quest.revealedAt = new Date();
    quest.discoveredAt = new Date();
    if (evidence) quest.revealEvidence = evidence;
    const saved = await this.questRepo.save(quest);

    await this.publishQuestEvent(
      "quest_revealed",
      gameSessionId,
      {
        questId: saved.id,
        questSlug: saved.slug,
        questName: saved.name,
        isMainQuest: saved.isMainQuest,
        evidence: evidence ?? null,
      },
      evidence ?? `Quest revelada: ${saved.name}`,
    );

    return { quest: saved, alreadyRevealed: false };
  }

  async advanceObjective(
    gameSessionId: string,
    slug: string,
    objectiveIdx: number,
    newStatus: "completed" | "failed",
    evidence: string | null,
  ): Promise<AdvanceObjectiveResult> {
    const quest = await this.questRepo.findOne({
      where: { gameSessionId, slug },
      relations: ["objectives"],
    });
    if (!quest) {
      throw new NotFoundException({
        ok: false,
        error: `Quest '${slug}' nao encontrada.`,
        code: "QUEST_NOT_FOUND",
      });
    }

    const objectives = (quest.objectives ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const target = objectives.find((o) => o.sortOrder === objectiveIdx);
    if (!target) {
      throw new NotFoundException({
        ok: false,
        error: `Objetivo idx=${objectiveIdx} nao encontrado em '${slug}'.`,
        code: "QUEST_OBJECTIVE_NOT_FOUND",
      });
    }

    const oldProgress = target.progressCount ?? 0;
    target.status = newStatus;
    if (newStatus === "completed") {
      target.progressCount = Math.max(oldProgress + 1, 1);
    }
    if (evidence) target.advanceEvidence = evidence;
    if (evidence) target.lastNarrativeDescriptor = evidence.slice(0, 240);
    await this.objectiveRepo.save(target);

    if (newStatus === "completed") {
      const next = objectives.find(
        (o) => o.sortOrder > objectiveIdx && o.status === "locked",
      );
      if (next) {
        next.status = "active";
        await this.objectiveRepo.save(next);
      }
    }

    const refreshed = await this.objectiveRepo.find({
      where: { questId: quest.id },
    });
    const required = refreshed.filter((o) => !o.isOptional);
    const allRequiredCompleted =
      required.length > 0 && required.every((o) => o.status === "completed");
    const anyRequiredFailed = required.some((o) => o.status === "failed");

    let questAutoCompleted = false;
    let questAutoFailed = false;

    if (allRequiredCompleted && quest.status === "active") {
      quest.status = "completed";
      await this.questRepo.save(quest);
      await this.cascadeUnlock(quest);
      questAutoCompleted = true;
    } else if (anyRequiredFailed && quest.status === "active") {
      const failedRequired = refreshed.filter(
        (o) => !o.isOptional && o.status === "failed",
      );
      const hasViableAlternative = failedRequired.every((failed) => {
        if (!failed.pathGroup) return false;
        return refreshed.some(
          (o) =>
            o.id !== failed.id &&
            o.pathGroup === failed.pathGroup &&
            o.status !== "failed",
        );
      });
      if (!hasViableAlternative) {
        quest.status = "failed";
        await this.questRepo.save(quest);
        questAutoFailed = true;
      }
    }

    await this.publishQuestEvent(
      "quest_advanced",
      gameSessionId,
      {
        questId: quest.id,
        questSlug: quest.slug,
        objectiveId: target.id,
        objectiveIdx,
        objectiveDescription: target.description,
        newStatus,
        evidence: evidence ?? null,
      },
      evidence ?? `Objetivo ${newStatus}: ${target.description}`,
    );
    if (questAutoCompleted) {
      await this.publishQuestEvent(
        "quest_completed",
        gameSessionId,
        {
          questId: quest.id,
          questSlug: quest.slug,
          questName: quest.name,
          isMainQuest: quest.isMainQuest,
        },
        `Quest concluída: ${quest.name}`,
      );
    } else if (questAutoFailed) {
      await this.publishQuestEvent(
        "quest_failed",
        gameSessionId,
        {
          questId: quest.id,
          questSlug: quest.slug,
          questName: quest.name,
          isMainQuest: quest.isMainQuest,
          failedObjectiveId: target.id,
          failedObjectiveDescription: target.description,
          evidence: evidence ?? null,
        },
        evidence ?? `Quest falhada: ${quest.name}`,
      );
    }
    if (quest.isMainQuest && newStatus === "completed") {
      await this.publishMissionProgressAdvanced(
        gameSessionId,
        quest,
        target,
        oldProgress,
        target.progressCount ?? oldProgress,
        evidence ?? null,
      );
    }

    return { objective: target, questAutoCompleted, questAutoFailed };
  }

  async getById(questId: string): Promise<QuestEntity> {
    const quest = await this.questRepo.findOne({
      where: { id: questId },
      relations: ["objectives", "giverNpc", "location", "storyArc"],
    });
    if (!quest) throw new NotFoundException("Quest nao encontrada.");
    return quest;
  }

  async listBySession(
    gameSessionId: string,
    status?: string,
  ): Promise<QuestEntity[]> {
    const where: any = { gameSessionId };
    if (status) where.status = status;
    return this.questRepo.find({
      where,
      relations: ["objectives"],
      order: { sortOrder: "ASC", name: "ASC" },
    });
  }

  async update(questId: string, dto: UpdateQuestDto): Promise<QuestEntity> {
    const quest = await this.getById(questId);
    Object.assign(quest, dto);
    const saved = await this.questRepo.save(quest);

    if (dto.status === "completed" || dto.status === "failed") {
      await this.cascadeUnlock(saved);
    }

    return this.getById(saved.id);
  }

  async updateObjectiveStatus(
    objectiveId: string,
    status: "locked" | "active" | "completed" | "failed" | "optional",
  ): Promise<QuestObjectiveEntity> {
    const obj = await this.objectiveRepo.findOne({
      where: { id: objectiveId },
    });
    if (!obj) throw new NotFoundException("Objetivo nao encontrado.");
    obj.status = status;
    return this.objectiveRepo.save(obj);
  }

  async addPrerequisite(
    questId: string,
    requiredQuestId: string,
    requiredStatus = "completed",
  ): Promise<QuestPrerequisiteEntity> {
    const prereq = this.prereqRepo.create({
      questId,
      requiredQuestId,
      requiredStatus,
    });
    return this.prereqRepo.save(prereq);
  }

  async getAvailableQuests(gameSessionId: string): Promise<QuestEntity[]> {
    const allQuests = await this.questRepo.find({
      where: { gameSessionId },
    });

    const prereqs = await this.prereqRepo.find();
    const prereqMap = new Map<string, QuestPrerequisiteEntity[]>();
    for (const p of prereqs) {
      const list = prereqMap.get(p.questId) ?? [];
      list.push(p);
      prereqMap.set(p.questId, list);
    }

    const questStatusMap = new Map(allQuests.map((q) => [q.id, q.status]));

    return allQuests.filter((q) => {
      if (q.status !== "unknown") return false;
      const reqs = prereqMap.get(q.id) ?? [];
      return reqs.every(
        (r) => questStatusMap.get(r.requiredQuestId) === r.requiredStatus,
      );
    });
  }

  async remove(questId: string): Promise<void> {
    await this.questRepo.delete(questId);
  }

  private async cascadeUnlock(quest: QuestEntity): Promise<void> {
    const dependents = await this.prereqRepo.find({
      where: { requiredQuestId: quest.id },
    });

    for (const dep of dependents) {
      const allPrereqs = await this.prereqRepo.find({
        where: { questId: dep.questId },
      });

      const depQuest = await this.questRepo.findOne({
        where: { id: dep.questId },
      });
      if (!depQuest || depQuest.status !== "unknown") continue;

      const allMet = await Promise.all(
        allPrereqs.map(async (p) => {
          const req = await this.questRepo.findOne({
            where: { id: p.requiredQuestId },
          });
          return req?.status === p.requiredStatus;
        }),
      );

      if (allMet.every(Boolean)) {
        depQuest.status = "available";
        await this.questRepo.save(depQuest);
      }
    }
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }
}
