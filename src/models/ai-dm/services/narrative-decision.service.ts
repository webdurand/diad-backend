import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NarrativeDecisionAffectedEntityType,
  NarrativeDecisionEntity,
  NarrativeDecisionPayoffWindow,
  NarrativeDecisionProvenance,
  NarrativeDecisionTag,
} from "src/entities/narrative-decision.entity";
import { EventLogService } from "src/models/session/services/event-log.service";

const CANONICAL_TAGS: readonly NarrativeDecisionTag[] = [
  "violence",
  "mercy",
  "alliance_formed",
  "betrayal",
  "oath_sworn",
  "moral_gray",
  "heroic",
  "cowardly",
  "secret_kept",
  "bond_forged",
];

export interface CreateNarrativeDecisionDto {
  sessionId?: string;
  sceneId?: string;
  actorParticipantId?: string;
  decisionText: string;
  affectedEntityType?: NarrativeDecisionAffectedEntityType;
  affectedEntityId?: string;
  tags?: NarrativeDecisionTag[];
  impactWeight?: number;
  payoffWindow?: NarrativeDecisionPayoffWindow;
  payoffSceneTarget?: number;
  provenance?: NarrativeDecisionProvenance;
}

@Injectable()
export class NarrativeDecisionService {
  constructor(
    @InjectRepository(NarrativeDecisionEntity)
    private readonly repo: Repository<NarrativeDecisionEntity>,
    private readonly eventLog: EventLogService,
  ) {}

  async create(
    campaignId: string,
    dto: CreateNarrativeDecisionDto,
  ): Promise<NarrativeDecisionEntity> {
    const tags = (dto.tags ?? []).filter((t) => CANONICAL_TAGS.includes(t));
    const impactWeight = this.clampImpact(dto.impactWeight ?? 5);

    const entity = this.repo.create({
      campaignId,
      sessionId: dto.sessionId,
      sceneId: dto.sceneId,
      actorParticipantId: dto.actorParticipantId,
      decisionText: dto.decisionText,
      affectedEntityType: dto.affectedEntityType,
      affectedEntityId: dto.affectedEntityId,
      tags,
      impactWeight,
      payoffWindow: dto.payoffWindow ?? "act",
      payoffSceneTarget: dto.payoffSceneTarget,
      provenance: dto.provenance ?? {
        extractedBy: "player_explicit",
        confidence: 1,
      },
    });
    const saved = await this.repo.save(entity);

    // Princípio X: toda mutação narrativa emite evento consumível pelo Narrator.
    if (dto.sessionId) {
      await this.eventLog.logEvent({
        sessionId: dto.sessionId,
        sceneId: dto.sceneId,
        eventType: "player_decision",
        summary: dto.decisionText.slice(0, 240),
        details: {
          narrativeDecisionId: saved.id,
          tags,
          impactWeight,
          payoffWindow: saved.payoffWindow,
          payoffSceneTarget: saved.payoffSceneTarget,
          affectedEntity: dto.affectedEntityType
            ? { type: dto.affectedEntityType, id: dto.affectedEntityId }
            : undefined,
        },
        actorCharacterId: undefined,
      });
    }

    return saved;
  }

  async listByCampaign(
    campaignId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NarrativeDecisionEntity[]> {
    return this.repo.find({
      where: { campaignId },
      order: { createdAt: "DESC" },
      skip: opts.offset ?? 0,
      take: opts.limit ?? 100,
    });
  }

  async top(campaignId: string, limit = 5): Promise<NarrativeDecisionEntity[]> {
    return this.repo.find({
      where: { campaignId },
      order: { impactWeight: "DESC", createdAt: "DESC" },
      take: limit,
    });
  }

  async markPayoffRealized(
    decisionId: string,
    sceneNumber: number,
  ): Promise<NarrativeDecisionEntity> {
    const decision = await this.repo.findOne({ where: { id: decisionId } });
    if (!decision) {
      throw new Error(`NarrativeDecision ${decisionId} não encontrada.`);
    }
    decision.payoffRealizedAtScene = sceneNumber;
    return this.repo.save(decision);
  }

  private clampImpact(value: number): number {
    if (!Number.isFinite(value)) return 5;
    return Math.max(1, Math.min(10, Math.round(value)));
  }
}
