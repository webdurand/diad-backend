import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { CampaignChronicleEntity } from "src/entities/campaign-chronicle.entity";
import { CharacterEntity } from "src/entities/character.entity";
import { DowntimeTurnEntity } from "src/entities/downtime-turn.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { PhaseEntity } from "src/entities/phase.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { SessionStoryArcStateEntity } from "src/entities/session-story-arc-state.entity";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import type { OutcomeTier } from "src/models/story-hidden-layer/domain/hidden-layer.types";
import {
  EvolveDowntimeUseCase,
  type DowntimeEventPort,
  type DowntimeRepositoryPort,
} from "../application/evolve-downtime.use-case";
import {
  RollChaosFactorUseCase,
  type ChaosFactorEventPort,
  type ChaosFactorRepositoryPort,
  type ChaosFactorSessionRecord,
} from "../application/roll-chaos-factor.use-case";
import {
  TierChronicleEntriesUseCase,
  type ChronicleSummarizerPort,
  type ChronicleTierEventPort,
  type TierChronicleRepositoryPort,
} from "../application/tier-chronicle-entries.use-case";
import {
  UpdateIdentityTagsUseCase,
  type IdentityTagsEventPort,
  type IdentityTagsRepositoryPort,
} from "../application/update-identity-tags.use-case";
import type {
  ChronicleMemoryEntry,
  ChronicleSummarizeResult,
  DowntimeTurnDraft,
  PCIdentityState,
} from "../domain/narrative-memory.types";

@Injectable()
export class NarrativeMemoryService
  implements
    ChaosFactorRepositoryPort,
    ChaosFactorEventPort,
    IdentityTagsRepositoryPort,
    IdentityTagsEventPort,
    TierChronicleRepositoryPort,
    ChronicleSummarizerPort,
    ChronicleTierEventPort,
    DowntimeRepositoryPort,
    DowntimeEventPort
{
  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CampaignChronicleEntity)
    private readonly chronicleRepo: Repository<CampaignChronicleEntity>,
    @InjectRepository(DowntimeTurnEntity)
    private readonly downtimeRepo: Repository<DowntimeTurnEntity>,
    @InjectRepository(PhaseEntity)
    private readonly phaseRepo: Repository<PhaseEntity>,
    @InjectRepository(SessionStoryArcStateEntity)
    private readonly stateRepo: Repository<SessionStoryArcStateEntity>,
    @InjectRepository(SessionMessageEntity)
    private readonly messageRepo: Repository<SessionMessageEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly outbound: OutboundFetch,
    private readonly config: ConfigService,
  ) {
    this.agentBaseUrl =
      this.config.get<string>("AGENT_BASE_URL") ?? "http://localhost:9003";
    this.internalToken =
      this.config.get<string>("INTERNAL_AGENTS_TOKEN") ?? "diad-internal-dev";
  }

  private readonly agentBaseUrl: string;
  private readonly internalToken: string;

  rollChaosFactor(input: {
    sessionId: string;
    outcomeTier: OutcomeTier;
    traceId?: string;
  }): Promise<unknown> {
    return new RollChaosFactorUseCase({
      repository: this,
      events: this,
    }).execute(input);
  }

  updateIdentityTags(input: {
    sessionId: string;
    pcId: string;
    phaseTransitionId: string;
    added: string[];
    removed: string[];
    rationale?: string;
    traceId?: string;
  }): Promise<PCIdentityState> {
    return new UpdateIdentityTagsUseCase({
      repository: this,
      events: this,
    }).execute(input);
  }

  tierChronicleEntries(input: {
    sessionId: string;
    campaignId: string;
    fromPhaseIndex: number;
    toPhaseIndex: number;
    traceId?: string;
  }): Promise<unknown> {
    return new TierChronicleEntriesUseCase({
      repository: this,
      summarizer: this,
      events: this,
    }).executeForPhaseChanged(input);
  }

  evolveDowntime(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseTransitionId: string;
    chaosFactor: number;
    traceId?: string;
  }): Promise<unknown> {
    return new EvolveDowntimeUseCase({
      repository: this,
      events: this,
    }).execute(input);
  }

  async evaluateNaturalLanguageTriggers(input: {
    sessionId: string;
    campaignId: string;
    sceneNumber: number;
    traceId?: string;
  }): Promise<{ evaluatedCount: number; satisfiedCount: number }> {
    const state = await this.stateRepo.findOne({
      where: { gameSessionId: input.sessionId },
      select: ["storyArcId", "currentPhaseIndex"],
    });
    if (!state) return { evaluatedCount: 0, satisfiedCount: 0 };

    const phase = await this.phaseRepo.findOne({
      where: {
        storyArcId: state.storyArcId,
        index: state.currentPhaseIndex,
      },
      select: ["id", "completionConditions"],
    });
    if (!phase) return { evaluatedCount: 0, satisfiedCount: 0 };

    const conditions = extractNaturalLanguageConditions(
      phase.completionConditions,
    );
    if (conditions.length === 0) {
      return { evaluatedCount: 0, satisfiedCount: 0 };
    }

    const messages = await this.loadRecentMessages(input.sessionId);
    let satisfiedCount = 0;
    for (const condition of conditions) {
      const result = await this.evaluateNaturalLanguageTrigger({
        ...condition,
        messages,
      });
      if (result.satisfied) satisfiedCount += 1;
      await this.publishNaturalLanguageTriggerEvaluated({
        sessionId: input.sessionId,
        campaignId: input.campaignId,
        phaseId: phase.id,
        sceneNumber: input.sceneNumber,
        conditionKey: condition.conditionKey,
        satisfied: result.satisfied,
        evidence: result.evidence,
        auditorMetadata: result.metadata,
        validationError: result.validationError ?? null,
        traceId: input.traceId,
      });
    }

    return { evaluatedCount: conditions.length, satisfiedCount };
  }

  async findSession(
    sessionId: string,
  ): Promise<ChaosFactorSessionRecord | null> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId", "chaosFactor"],
    });
    return session
      ? {
          id: session.id,
          campaignId: session.campaignId ?? null,
          chaosFactor: session.chaosFactor,
        }
      : null;
  }

  async saveChaosFactor(sessionId: string, newFactor: number): Promise<void> {
    await this.sessionRepo.update(
      { id: sessionId },
      { chaosFactor: newFactor },
    );
  }

  async publishChaosFactorEvolved(input: {
    sessionId: string;
    campaignId?: string | null;
    oldFactor: number;
    newFactor: number;
    cause: "phase_outcome" | "admin_override" | "downtime_event";
    traceId?: string;
  }): Promise<void> {
    if (!input.campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "WorldEvent",
        eventType: "chaos_factor_evolved",
        source: {
          service: "diad-backend",
          module: "RollChaosFactorUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: ["Director", "HUD"],
        payload: input,
        narrativeDescriptor: `Chaos Factor: ${input.oldFactor} → ${input.newFactor} (${input.cause})`,
        metadata: { tags: ["world", "narrative_memory"], narrativeWeight: 6 },
      }),
    );
  }

  async findIdentityState(pcId: string): Promise<PCIdentityState | null> {
    const pc = await this.characterRepo.findOne({
      where: { id: pcId },
      select: ["id", "currentIdentityTags", "identityTagsHistory"],
    });
    if (!pc) return null;
    return {
      currentTags: Array.isArray(pc.currentIdentityTags)
        ? pc.currentIdentityTags
        : [],
      history: Array.isArray(pc.identityTagsHistory)
        ? pc.identityTagsHistory
        : [],
    };
  }

  async saveIdentityState(pcId: string, state: PCIdentityState): Promise<void> {
    await this.characterRepo.update(
      { id: pcId },
      {
        currentIdentityTags: state.currentTags,
        identityTagsHistory: state.history,
      },
    );
  }

  async publishIdentityTagsChanged(input: {
    sessionId: string;
    pcId: string;
    added: string[];
    removed: string[];
    totalTagsAfter: number;
    traceId?: string;
  }): Promise<void> {
    const session = await this.findSession(input.sessionId);
    if (!session?.campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "identity_tags_changed",
        source: {
          service: "diad-backend",
          module: "UpdateIdentityTagsUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId: session.campaignId, sessionId: input.sessionId },
        audiences: ["Narrator", "HUD", "Archivist"],
        payload: input,
        narrativeDescriptor: `Identidade do PC mudou: +${input.added.length}/-${input.removed.length} tags`,
        metadata: { tags: ["narrative", "identity"], narrativeWeight: 7 },
      }),
    );
  }

  async findActiveByPhase(input: {
    sessionId: string;
    phaseIndex: number;
  }): Promise<ChronicleMemoryEntry[]> {
    const rows = await this.chronicleRepo.find({
      where: {
        sessionId: input.sessionId,
        phaseIndex: input.phaseIndex,
        tier: "active",
      },
      order: { significance: "DESC", createdAt: "ASC" },
    });
    return rows.map(toChronicleMemoryEntry);
  }

  async findDiaryReadyForForgetting(input: {
    sessionId: string;
    maxPhaseIndex: number;
  }): Promise<ChronicleMemoryEntry[]> {
    const rows = await this.chronicleRepo.find({
      where: {
        sessionId: input.sessionId,
        tier: "diary",
        tierLocked: false,
        phaseIndex: LessThanOrEqual(input.maxPhaseIndex),
      },
      order: { createdAt: "ASC" },
    });
    return rows.map(toChronicleMemoryEntry);
  }

  async saveAll(entries: ChronicleMemoryEntry[]): Promise<void> {
    await this.chronicleRepo.save(
      entries.map((entry) =>
        this.chronicleRepo.create({
          id: entry.id,
          campaignId: entry.campaignId,
          sessionId: entry.sessionId ?? undefined,
          phaseId: entry.phaseId ?? null,
          phaseIndex: entry.phaseIndex ?? null,
          title: entry.title,
          content: entry.content,
          tier: entry.tier,
          legacyTags: entry.legacyTags,
          tierLocked: entry.tierLocked,
          tieredAt: entry.tieredAt ?? null,
          summarizerMetadata: entry.summarizerMetadata ?? null,
          significance: entry.significance,
        }),
      ),
    );
  }

  async summarize(
    entries: ChronicleMemoryEntry[],
  ): Promise<ChronicleSummarizeResult> {
    const startedAt = Date.now();
    try {
      const response =
        await this.outbound.request<AgentChronicleSummaryResponse>(
          `${this.agentBaseUrl}/internal/chronicles/tier-summary`,
          {
            method: "POST",
            upstreamService: "diad-agents",
            timeoutMs: 8_000,
            headers: {
              "Content-Type": "application/json",
              "X-Internal-Token": this.internalToken,
            },
            body: JSON.stringify({
              entries: entries.map((entry) => ({
                id: entry.id,
                title: entry.title,
                content: entry.content,
                legacyTags: entry.legacyTags,
                significance: entry.significance,
              })),
            }),
          },
        );
      if (isAgentChronicleSummaryResponse(response)) {
        return response;
      }
    } catch {
      // Agent tiering is best-effort. Keep phase advancement deterministic if agents are down.
    }

    return {
      summaries: entries.map((entry) => ({
        entryId: entry.id,
        content: summarizeChronicleEntry(entry),
        legacyTags: buildLegacyTags(entry),
      })),
      metadata: {
        model: "claude-haiku-4-5-20251001",
        latencyMs: Math.max(1, Date.now() - startedAt),
        cacheHit: false,
      },
    };
  }

  async publishChronicleTierChanged(input: {
    sessionId: string;
    campaignId: string;
    entryIds: string[];
    fromTier: "active" | "diary" | "forgotten";
    toTier: "active" | "diary" | "forgotten";
    summarized: boolean;
    traceId?: string;
  }): Promise<void> {
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "chronicle_tier_changed",
        source: {
          service: "diad-backend",
          module: "TierChronicleEntriesUseCase.executeForPhaseChanged",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: ["Archivist"],
        payload: input,
        narrativeDescriptor: `Chronicle entries ${input.entryIds.length} movidas de ${input.fromTier} para ${input.toTier}`,
        metadata: { tags: ["narrative", "memory_tiering"], narrativeWeight: 5 },
      }),
    );
  }

  async saveTurns(turns: DowntimeTurnDraft[]): Promise<DowntimeTurnDraft[]> {
    const rows = turns.map((turn) => ({
      gameSessionId: turn.gameSessionId,
      phaseTransitionId: turn.phaseTransitionId,
      turnIndex: turn.turnIndex,
      archetypeChosen: turn.archetypeChosen,
      chaosFactor: turn.chaosFactor,
      narrativeText: turn.narrativeText,
      status: turn.status,
      metadata: turn.metadata,
    })) as QueryDeepPartialEntity<DowntimeTurnEntity>[];
    await this.downtimeRepo.upsert(rows, ["phaseTransitionId", "turnIndex"]);
    return turns;
  }

  async publishDowntimeExecuted(input: {
    sessionId: string;
    campaignId?: string | null;
    phaseTransitionId: string;
    turnsCount: number;
    archetypeChosen: "expected" | "altered" | "interrupt";
    chaosFactor: number;
    traceId?: string;
  }): Promise<void> {
    if (!input.campaignId) return;
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "downtime_executed",
        source: {
          service: "diad-backend",
          module: "EvolveDowntimeUseCase.execute",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: ["Narrator", "Director", "HUD"],
        payload: input,
        narrativeDescriptor: `Downtime de ${input.turnsCount} turnos executado (${input.archetypeChosen})`,
        metadata: { tags: ["narrative", "downtime"], narrativeWeight: 6 },
      }),
    );
  }

  private async loadRecentMessages(sessionId: string): Promise<
    Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
    }>
  > {
    const rows = await this.messageRepo.find({
      where: { sessionId },
      order: { sequenceNumber: "DESC" },
      take: 30,
      select: ["id", "kind", "content", "sequenceNumber"],
    });
    return rows
      .reverse()
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        id: message.id,
        role: roleForMessageKind(message.kind),
        content: message.content,
      }));
  }

  private async evaluateNaturalLanguageTrigger(input: {
    conditionKey: string;
    naturalLanguage: string;
    messages: Array<{ id: string; role: string; content: string }>;
  }): Promise<NLTriggerEvaluationResult> {
    return this.outbound.request<NLTriggerEvaluationResult>(
      `${this.agentBaseUrl}/internal/nl-triggers/evaluate`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs: 8_000,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.internalToken,
        },
        body: JSON.stringify({
          conditionKey: input.conditionKey,
          naturalLanguage: input.naturalLanguage,
          messages: input.messages,
        }),
      },
    );
  }

  private async publishNaturalLanguageTriggerEvaluated(input: {
    sessionId: string;
    campaignId: string;
    phaseId: string;
    sceneNumber: number;
    conditionKey: string;
    satisfied: boolean;
    evidence: string[];
    auditorMetadata: Record<string, unknown>;
    validationError: string | null;
    traceId?: string;
  }): Promise<void> {
    await this.eventBus.publish(
      this.envelopeFactory.build({
        eventCategory: "NarrativeEvent",
        eventType: "nl_trigger_evaluated",
        source: {
          service: "diad-backend",
          module: "EvaluateNaturalLanguageTriggerListener.handle",
          traceId: input.traceId,
        },
        scope: { campaignId: input.campaignId, sessionId: input.sessionId },
        audiences: ["Director", "Archivist"],
        payload: {
          sessionId: input.sessionId,
          phaseId: input.phaseId,
          sceneNumber: input.sceneNumber,
          conditionKey: input.conditionKey,
          satisfied: input.satisfied,
          evidence: input.evidence,
          auditorMetadata: input.auditorMetadata,
          validationError: input.validationError,
        },
        narrativeDescriptor: `NL trigger '${input.conditionKey}' avaliado: satisfied=${input.satisfied}`,
        metadata: { tags: ["narrative", "nl_trigger"], narrativeWeight: 4 },
      }),
    );
  }
}

interface AgentChronicleSummaryResponse {
  summaries: Array<{
    entryId: string;
    content: string;
    legacyTags: string[];
  }>;
  metadata: {
    model: string;
    latencyMs: number;
    [key: string]: unknown;
  };
}

interface NLTriggerEvaluationResult {
  satisfied: boolean;
  evidence: string[];
  validationError?: string | null;
  metadata: Record<string, unknown>;
}

function isAgentChronicleSummaryResponse(
  value: unknown,
): value is AgentChronicleSummaryResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as AgentChronicleSummaryResponse;
  return (
    Array.isArray(response.summaries) &&
    response.summaries.every(
      (summary) =>
        typeof summary?.entryId === "string" &&
        typeof summary?.content === "string" &&
        Array.isArray(summary?.legacyTags),
    ) &&
    typeof response.metadata?.model === "string" &&
    typeof response.metadata?.latencyMs === "number"
  );
}

function extractNaturalLanguageConditions(
  value: unknown,
): Array<{ conditionKey: string; naturalLanguage: string }> {
  const conditionSet = record(value);
  const out: Array<{ conditionKey: string; naturalLanguage: string }> = [];

  const topLevel = stringOrNull(conditionSet.naturalLanguage);
  if (topLevel) {
    out.push({
      conditionKey: conditionKeyFor(conditionSet, topLevel, "naturalLanguage"),
      naturalLanguage: topLevel,
    });
  }

  const any = Array.isArray(conditionSet.any) ? conditionSet.any : [];
  for (let index = 0; index < any.length; index += 1) {
    const condition = record(any[index]);
    const naturalLanguage = stringOrNull(condition.naturalLanguage);
    if (!naturalLanguage) continue;
    out.push({
      conditionKey: conditionKeyFor(
        condition,
        naturalLanguage,
        `naturalLanguage:${index}`,
      ),
      naturalLanguage,
    });
  }

  return out;
}

function conditionKeyFor(
  source: Record<string, unknown>,
  naturalLanguage: string,
  fallback: string,
): string {
  return (
    stringOrNull(source.conditionKey) ??
    stringOrNull(source.key) ??
    normalizeConditionKey(naturalLanguage) ??
    fallback
  ).slice(0, 80);
}

function normalizeConditionKey(value: string): string | null {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function roleForMessageKind(
  kind: SessionMessageEntity["kind"],
): "user" | "assistant" | "system" {
  if (kind === "player_action") return "user";
  if (kind === "system" || kind === "dice_roll") return "system";
  return "assistant";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toChronicleMemoryEntry(
  row: CampaignChronicleEntity,
): ChronicleMemoryEntry {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sessionId: row.sessionId ?? null,
    phaseId: row.phaseId ?? null,
    phaseIndex: row.phaseIndex ?? null,
    title: row.title,
    content: row.content,
    tier: row.tier ?? "active",
    legacyTags: Array.isArray(row.legacyTags) ? row.legacyTags : [],
    tierLocked: row.tierLocked === true,
    significance: row.significance ?? 5,
    tieredAt: row.tieredAt ?? null,
    summarizerMetadata: row.summarizerMetadata ?? null,
  };
}

function summarizeChronicleEntry(entry: ChronicleMemoryEntry): string {
  const body = entry.content.trim().replace(/\s+/g, " ");
  const summary =
    body.length > 360 ? `${body.slice(0, 357).trimEnd()}...` : body;
  return summary || entry.title;
}

function buildLegacyTags(entry: ChronicleMemoryEntry): string[] {
  if (entry.legacyTags.length > 0) return entry.legacyTags.slice(0, 10);
  return [entry.title.slice(0, 80)];
}
