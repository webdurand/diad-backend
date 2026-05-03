import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QuestEntity } from "src/entities/quest.entity";
import { QuestObjectiveEntity } from "src/entities/quest-objective.entity";
import { QuestPrerequisiteEntity } from "src/entities/quest-prerequisite.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { randomBytes } from "crypto";

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
  }>;
  // Spec NNN — quest pipeline
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

/** Resultado de revealQuest — mostra qual quest foi revelada e seus objectives. */
export interface RevealQuestResult {
  quest: QuestEntity;
  alreadyRevealed: boolean;
}

/** Resultado de advanceObjective — pode trigger auto-completion da quest. */
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
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
  ) {}

  /** Best-effort SSE publish — falha não bloqueia o write principal. */
  private async publishQuestEvent(
    eventType:
      | "quest_revealed"
      | "quest_advanced"
      | "quest_completed",
    campaignId: string,
    payload: Record<string, unknown>,
    narrativeDescriptor?: string,
  ): Promise<void> {
    try {
      const envelope = this.envelopeFactory.build({
        eventCategory: "WorldEvent",
        eventType,
        source: {
          service: "diad-backend",
          module: `QuestService.${eventType}`,
        },
        scope: { campaignId },
        payload,
        narrativeDescriptor,
      });
      await this.eventBus.publish(envelope);
    } catch {
      /* best-effort — quest write já persistiu */
    }
  }

  async create(campaignId: string, dto: CreateQuestDto): Promise<QuestEntity> {
    const slug = this.generateSlug(dto.name);
    const quest = this.questRepo.create({
      campaignId,
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
      // Primeiro objetivo nasce active, restantes locked (sequência ordenada).
      // Director destrava o próximo conforme advance.
      const objectives = dto.objectives.map((o, i) =>
        this.objectiveRepo.create({
          questId: saved.id,
          description: o.description,
          pathGroup: o.pathGroup,
          isOptional: o.isOptional ?? false,
          sortOrder: i,
          status: i === 0 ? "active" : "locked",
        }),
      );
      await this.objectiveRepo.save(objectives);
    }

    return this.getById(saved.id);
  }

  /**
   * Spec NNN — reveal pipeline. Transição `unknown` → `active`.
   *
   * Emitido pelo Director quando a cena justifica revelar a quest (main quest
   * ao fim do primeiro turn, side quests por trigger). Persiste evidence pra
   * audit ("Player encontrou Padre Anselmo no Cais Velho").
   *
   * Idempotente: chamadas repetidas após reveal retornam alreadyRevealed=true
   * sem tocar no estado. Dispara EventBus quest_revealed na primeira chamada.
   */
  async revealQuest(
    campaignId: string,
    slug: string,
    evidence: string | null,
  ): Promise<RevealQuestResult> {
    const quest = await this.questRepo.findOne({
      where: { campaignId, slug },
      relations: ["objectives"],
    });
    if (!quest) {
      throw new NotFoundException({
        ok: false,
        error: `Quest '${slug}' nao encontrada na campanha.`,
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
      campaignId,
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

  /**
   * Spec NNN — advance pipeline. Marca um objetivo `completed`/`failed` e
   * destrava o próximo `locked` na sequência. Se todos requeridos terminam
   * `completed`, auto-completa a quest.
   *
   * `objectiveIdx` é o `sortOrder` do objetivo (0-indexed). Persiste evidence
   * pra audit.
   */
  async advanceObjective(
    campaignId: string,
    slug: string,
    objectiveIdx: number,
    newStatus: "completed" | "failed",
    evidence: string | null,
  ): Promise<AdvanceObjectiveResult> {
    const quest = await this.questRepo.findOne({
      where: { campaignId, slug },
      relations: ["objectives"],
    });
    if (!quest) {
      throw new NotFoundException({
        ok: false,
        error: `Quest '${slug}' nao encontrada.`,
        code: "QUEST_NOT_FOUND",
      });
    }

    const objectives = (quest.objectives ?? []).slice().sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const target = objectives.find((o) => o.sortOrder === objectiveIdx);
    if (!target) {
      throw new NotFoundException({
        ok: false,
        error: `Objetivo idx=${objectiveIdx} nao encontrado em '${slug}'.`,
        code: "QUEST_OBJECTIVE_NOT_FOUND",
      });
    }

    target.status = newStatus;
    if (evidence) target.advanceEvidence = evidence;
    await this.objectiveRepo.save(target);

    // Destrava próximo objetivo `locked` na sequência (apenas em completed)
    if (newStatus === "completed") {
      const next = objectives.find(
        (o) => o.sortOrder > objectiveIdx && o.status === "locked",
      );
      if (next) {
        next.status = "active";
        await this.objectiveRepo.save(next);
      }
    }

    // Auto-complete quest se todos requeridos done
    const refreshed = await this.objectiveRepo.find({
      where: { questId: quest.id },
    });
    const required = refreshed.filter((o) => !o.isOptional);
    const allRequiredCompleted =
      required.length > 0 &&
      required.every((o) => o.status === "completed");
    const anyRequiredFailed = required.some((o) => o.status === "failed");

    let questAutoCompleted = false;
    let questAutoFailed = false;

    if (allRequiredCompleted && quest.status === "active") {
      quest.status = "completed";
      await this.questRepo.save(quest);
      await this.cascadeUnlock(quest);
      questAutoCompleted = true;
    } else if (anyRequiredFailed && quest.status === "active") {
      // Failure de objetivo NÃO faliu a quest — Director pode marcar fail
      // explícito via update(). Mantemos só no advanceObjective o objetivo.
      // (Ajuste futuro: flag isCriticalObjective.)
    }

    // Eventos: advanced sempre; completed se cascade auto-fechou
    await this.publishQuestEvent(
      "quest_advanced",
      campaignId,
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
        campaignId,
        {
          questId: quest.id,
          questSlug: quest.slug,
          questName: quest.name,
          isMainQuest: quest.isMainQuest,
        },
        `Quest concluída: ${quest.name}`,
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

  async listByCampaign(
    campaignId: string,
    status?: string,
  ): Promise<QuestEntity[]> {
    const where: any = { campaignId };
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

    // If quest completed, unlock dependent quests
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

  async getAvailableQuests(campaignId: string): Promise<QuestEntity[]> {
    const allQuests = await this.questRepo.find({
      where: { campaignId },
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
    // Find quests that depend on this one
    const dependents = await this.prereqRepo.find({
      where: { requiredQuestId: quest.id },
    });

    for (const dep of dependents) {
      // Check if ALL prereqs for the dependent quest are met
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
