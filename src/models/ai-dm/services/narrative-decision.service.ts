import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NarrativeDecisionAffectedEntityType,
  NarrativeDecisionCanonicalTag,
  NarrativeDecisionEntity,
  NarrativeDecisionPayoffWindow,
  NarrativeDecisionProvenance,
  NarrativeDecisionTag,
} from "src/entities/narrative-decision.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { EventLogService } from "src/models/session/services/event-log.service";
import { NpcService } from "src/models/world/services/npc.service";
import { LocationService } from "src/models/world/services/location.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";

const CANONICAL_TAGS: readonly NarrativeDecisionCanonicalTag[] = [
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateNarrativeDecisionDto {
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
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventLog: EventLogService,
    private readonly npcService: NpcService,
    private readonly locationService: LocationService,
  ) {}

  async create(
    sessionId: string,
    dto: CreateNarrativeDecisionDto,
  ): Promise<NarrativeDecisionEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true, campaignId: true },
    });
    if (!session) {
      throw new NotFoundException("GameSession não encontrada.");
    }

    const tags = (dto.tags ?? []).filter(
      (t): t is NarrativeDecisionTag =>
        CANONICAL_TAGS.includes(t as NarrativeDecisionCanonicalTag) ||
        t.startsWith("_meta:"),
    );
    const impactWeight = this.clampImpact(dto.impactWeight ?? 5);

    const resolvedEntityId = await this.resolveAffectedEntityId(
      sessionId,
      session.campaignId,
      dto.affectedEntityType,
      dto.affectedEntityId,
    );

    const entity = this.repo.create({
      sessionId,
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

    await this.eventLog.logEvent({
      sessionId,
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

    return saved;
  }

  async listBySession(
    sessionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NarrativeDecisionEntity[]> {
    return this.repo.find({
      where: { sessionId },
      order: { createdAt: "DESC" },
      skip: opts.offset ?? 0,
      take: opts.limit ?? 100,
    });
  }

  async top(sessionId: string, limit = 5): Promise<NarrativeDecisionEntity[]> {
    return this.repo.find({
      where: { sessionId },
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

  private async resolveAffectedEntityId(
    sessionId: string,
    campaignId: string | undefined,
    entityType: NarrativeDecisionAffectedEntityType | undefined,
    rawId: string | undefined,
  ): Promise<string | null> {
    if (!rawId || !rawId.trim()) return null;
    const candidate = rawId.trim();
    if (UUID_REGEX.test(candidate)) return candidate;

    if (!entityType) {
      throw new UnprocessableEntityException({
        code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
        message:
          "affectedEntityId chegou como nome sem affectedEntityType — não é resolvível.",
        hint: "Envie affectedEntityType ou um UUID em affectedEntityId.",
      });
    }

    if (entityType === "npc") {
      const npc = await this.npcService.findByNameInSession(
        sessionId,
        candidate,
      );
      if (npc) return npc.id;
      // Materializa stub na sessão atual.
      const stub = await this.npcService.materializeStubFromName(
        sessionId,
        candidate,
      );
      return stub.id;
    } else if (entityType === "location") {
      if (!campaignId) {
        throw new UnprocessableEntityException({
          code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
          message: `Não foi possível resolver "${candidate}" como ${entityType}: sessão sem campaignId.`,
        });
      }
      const loc = await this.locationService.findByNameInCampaign(
        campaignId,
        candidate,
      );
      if (loc) return loc.id;
    }

    throw new UnprocessableEntityException({
      code: ErrorCode.NARRATIVE_DECISION_AFFECTED_ENTITY_NOT_FOUND,
      message: `Não foi possível resolver "${candidate}" como ${entityType} na aventura.`,
      hint: "Confirme o nome (case-insensitive exato) ou passe o UUID direto.",
    });
  }
}
