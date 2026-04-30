import { Injectable, UnprocessableEntityException } from "@nestjs/common";
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
import { NpcService } from "src/models/world/services/npc.service";
import { LocationService } from "src/models/world/services/location.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

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

/**
 * Spec 027 (M2, AC2.9 / bug D2) — UUID detector. Archivist (agno) às vezes
 * envia nome ("eda") em campo UUID; service resolve antes de persistir
 * pra evitar 500 do Postgres ("invalid input syntax for type uuid").
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    // Spec 027 M2 D2 — name→UUID resolution dependencies.
    private readonly npcService: NpcService,
    private readonly locationService: LocationService,
  ) {}

  async create(
    campaignId: string,
    dto: CreateNarrativeDecisionDto,
  ): Promise<NarrativeDecisionEntity> {
    const tags = (dto.tags ?? []).filter((t) => CANONICAL_TAGS.includes(t));
    const impactWeight = this.clampImpact(dto.impactWeight ?? 5);

    // Spec 027 (M2, AC2.9 / bug D2) — resolve `affectedEntityId` se vier
    // como nome (Archivist envia "eda" em campo UUID, Postgres rejeita).
    // Ausência → null; nome resolvido → UUID; nome inexistente → 422.
    const resolvedEntityId = await this.resolveAffectedEntityId(
      campaignId,
      dto.affectedEntityType,
      dto.affectedEntityId,
    );

    const entity = this.repo.create({
      campaignId,
      sessionId: dto.sessionId,
      sceneId: dto.sceneId,
      actorParticipantId: dto.actorParticipantId,
      decisionText: dto.decisionText,
      affectedEntityType: dto.affectedEntityType,
      affectedEntityId: resolvedEntityId ?? undefined,
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

  /**
   * Spec 027 (M2, AC2.9 / bug D2) — resolve `affectedEntityId` quando vem
   * como nome em vez de UUID.
   *
   * Política:
   *  - Ausente → undefined (decision sem affected entity é válido)
   *  - UUID-shape → passthrough (não confirma existência aqui; trust)
   *  - Nome + type='npc' → NpcService.findByNameInCampaign
   *  - Nome + type='location' → LocationService.findByNameInCampaign
   *  - Nome + outro type não suportado ainda → 422 (forçar UUID)
   *  - Nome não resolvido → 422 NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND
   */
  private async resolveAffectedEntityId(
    campaignId: string,
    entityType: NarrativeDecisionAffectedEntityType | undefined,
    rawId: string | undefined,
  ): Promise<string | null> {
    if (!rawId || !rawId.trim()) return null;
    const candidate = rawId.trim();
    if (UUID_REGEX.test(candidate)) return candidate;

    // Não-UUID: precisa de entityType + resolver suportado.
    if (!entityType) {
      throw new UnprocessableEntityException({
        code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
        message:
          "affectedEntityId chegou como nome sem affectedEntityType — não é resolvível.",
        hint: "Envie affectedEntityType ou um UUID em affectedEntityId.",
      });
    }

    if (entityType === "npc") {
      const npc = await this.npcService.findByNameInCampaign(
        campaignId,
        candidate,
      );
      if (npc) return npc.id;
    } else if (entityType === "location") {
      const loc = await this.locationService.findByNameInCampaign(
        campaignId,
        candidate,
      );
      if (loc) return loc.id;
    }

    // Tipos restantes (item/quest/faction/party): exigem UUID por enquanto.
    throw new UnprocessableEntityException({
      code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
      message: `Não foi possível resolver "${candidate}" como ${entityType} na campanha.`,
      hint: "Confirme o nome (case-insensitive exato) ou passe o UUID direto.",
    });
  }
}
