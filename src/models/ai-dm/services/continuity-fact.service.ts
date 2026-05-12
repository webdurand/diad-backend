import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  ContinuityFactEntity,
  ContinuityFactEntityType,
  ContinuityFactStatus,
  ContinuityFactType,
} from "src/entities/continuity-fact.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import { SceneContextCacheService } from "src/models/session/services/scene-context-cache.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ENTITY_TYPES: readonly ContinuityFactEntityType[] = [
  "npc",
  "location",
  "quest",
  "faction",
  "party",
  "item",
];

const VALID_STATUSES: readonly ContinuityFactStatus[] = [
  "active",
  "superseded",
  "retracted",
];

export interface CreateContinuityFactDto {
  sceneId?: string;
  factType: string;
  entityType?: ContinuityFactEntityType;
  entityId?: string;
  entityName?: string;
  summary: string;
  status?: ContinuityFactStatus;
  confidence?: number;
  salience?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sourceTurn?: number;
}

export interface ListRelevantContinuityFactsOptions {
  limit?: number;
  entityIds?: string[];
  q?: string;
}

interface NormalizedContinuityFact {
  sceneId?: string;
  factType: ContinuityFactType;
  entityType?: ContinuityFactEntityType;
  entityId?: string;
  entityName?: string;
  summary: string;
  status: ContinuityFactStatus;
  confidence: number;
  salience: number;
  tags: string[];
  metadata: Record<string, unknown>;
  sourceTurn?: number;
}

@Injectable()
export class ContinuityFactService {
  constructor(
    @InjectRepository(ContinuityFactEntity)
    private readonly repo: Repository<ContinuityFactEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
    private readonly sceneContextCache: SceneContextCacheService,
  ) {}

  async create(
    sessionId: string,
    dto: CreateContinuityFactDto,
  ): Promise<ContinuityFactEntity> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException("GameSession não encontrada.");
    }

    const normalized = this.normalizeDto(dto);
    const duplicate = await this.findActiveDuplicate(sessionId, normalized);
    if (duplicate) return duplicate;

    const entity = this.repo.create({
      sessionId,
      sceneId: normalized.sceneId,
      factType: normalized.factType,
      entityType: normalized.entityType,
      entityId: normalized.entityId,
      entityName: normalized.entityName,
      summary: normalized.summary,
      status: normalized.status,
      confidence: normalized.confidence,
      salience: normalized.salience,
      tags: normalized.tags,
      metadata: normalized.metadata,
      sourceTurn: normalized.sourceTurn,
    });
    const saved = await this.repo.save(entity);
    await this.applySideEffects(sessionId, saved);
    return saved;
  }

  async listRelevant(
    sessionId: string,
    opts: ListRelevantContinuityFactsOptions = {},
  ): Promise<ContinuityFactEntity[]> {
    const limit = this.clampInt(opts.limit ?? 16, 1, 50);
    const entityIds = new Set(
      (opts.entityIds ?? []).filter((id) => UUID_REGEX.test(id)),
    );
    const terms = this.tokenize(opts.q ?? "");

    const facts = await this.repo.find({
      where: { sessionId, status: "active" },
      order: { createdAt: "DESC" },
      take: Math.max(50, limit * 4),
    });

    return facts
      .map((fact) => ({ fact, score: this.scoreFact(fact, entityIds, terms) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.fact.salience !== a.fact.salience) {
          return b.fact.salience - a.fact.salience;
        }
        return b.fact.createdAt.getTime() - a.fact.createdAt.getTime();
      })
      .slice(0, limit)
      .map((scored) => scored.fact);
  }

  private normalizeDto(dto: CreateContinuityFactDto): NormalizedContinuityFact {
    const rawEntityId = this.cleanOptional(dto.entityId);
    const entityId =
      rawEntityId && UUID_REGEX.test(rawEntityId) ? rawEntityId : undefined;
    const entityName =
      this.cleanOptional(dto.entityName) ??
      (!entityId ? rawEntityId : undefined);
    const entityType =
      dto.entityType && VALID_ENTITY_TYPES.includes(dto.entityType)
        ? dto.entityType
        : undefined;
    const status =
      dto.status && VALID_STATUSES.includes(dto.status) ? dto.status : "active";
    const summary = String(dto.summary ?? "").trim();
    if (!summary) {
      throw new BadRequestException("summary é obrigatório.");
    }
    const rawFactType = String(dto.factType ?? "").trim();

    return {
      sceneId: this.cleanUuid(dto.sceneId),
      factType: (rawFactType || "open_thread") as ContinuityFactType,
      entityType,
      entityId,
      entityName,
      summary: summary.slice(0, 1000),
      status,
      confidence: this.clampNumber(dto.confidence ?? 1, 0, 1),
      salience: this.clampInt(dto.salience ?? 5, 1, 10),
      tags: this.normalizeTags(dto.tags),
      metadata: this.normalizeMetadata(dto.metadata),
      sourceTurn: this.normalizeSourceTurn(dto.sourceTurn),
    };
  }

  private async findActiveDuplicate(
    sessionId: string,
    fact: NormalizedContinuityFact,
  ): Promise<ContinuityFactEntity | null> {
    return this.repo.findOne({
      where: {
        sessionId,
        status: "active",
        factType: fact.factType,
        entityType: fact.entityType ?? (IsNull() as never),
        entityId: fact.entityId ?? (IsNull() as never),
        entityName: fact.entityName ?? (IsNull() as never),
        summary: fact.summary,
      },
    });
  }

  private async applySideEffects(
    sessionId: string,
    fact: ContinuityFactEntity,
  ): Promise<void> {
    if (fact.factType !== "npc_death" || !fact.entityId) return;

    let state = await this.npcStateRepo.findOne({
      where: { gameSessionId: sessionId, npcId: fact.entityId },
    });
    if (!state) {
      state = this.npcStateRepo.create({
        gameSessionId: sessionId,
        npcId: fact.entityId,
        status: "dead",
      });
    } else {
      state.status = "dead";
    }
    await this.npcStateRepo.save(state);
    this.sceneContextCache.invalidateAll();
  }

  private scoreFact(
    fact: ContinuityFactEntity,
    entityIds: Set<string>,
    terms: string[],
  ): number {
    let score = fact.salience * 10;
    if (fact.entityId && entityIds.has(fact.entityId)) score += 50;
    const haystack = [
      fact.summary,
      fact.entityName,
      fact.factType,
      fact.entityType,
      ...(fact.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchedTerms = terms.filter((term) => haystack.includes(term)).length;
    score += Math.min(30, matchedTerms * 5);
    return score;
  }

  private tokenize(q: string): string[] {
    return Array.from(
      new Set(
        q
          .toLowerCase()
          .split(/[^a-z0-9áàâãéêíóôõúç_-]+/i)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3),
      ),
    ).slice(0, 12);
  }

  private normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return Array.from(
      new Set(
        tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim().slice(0, 40))
          .filter(Boolean),
      ),
    ).slice(0, 12);
  }

  private normalizeMetadata(metadata: unknown): Record<string, unknown> {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return {};
    }
    return metadata as Record<string, unknown>;
  }

  private cleanOptional(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private cleanUuid(value: unknown): string | undefined {
    const cleaned = this.cleanOptional(value);
    return cleaned && UUID_REGEX.test(cleaned) ? cleaned : undefined;
  }

  private normalizeSourceTurn(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.floor(value));
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return max;
    return Math.max(min, Math.min(max, value));
  }

  private clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
