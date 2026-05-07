import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AiAgentRole,
  AiUsageLogEntity,
} from "src/entities/ai-usage-log.entity";

/**
 * Preços Anthropic (por 1M tokens, USD). Spec §8 cost-aware.
 *
 * Fontes: https://www.anthropic.com/pricing (snapshot 2026-04).
 * Cache read = 10% do input. Cache write = 25% premium.
 */
const PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-haiku-4-5-20251001": {
    input: 1.0, // $1.00 / 1M input
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
  "claude-haiku-4-5": {
    input: 1.0,
    output: 5.0,
    cacheWrite: 1.25,
    cacheRead: 0.1,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-opus-4-7": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
};

const DEFAULT_PRICE = PRICING["claude-haiku-4-5-20251001"];

export interface LogAiUsageDto {
  campaignId?: string;
  sessionId?: string;
  agentRole: AiAgentRole;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  tookMs?: number;
  featureName?: string;
  characterId?: string;
  sceneType?: string;
  turnNumber?: number;
}

export interface CostBucket {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  calls: number;
}

export interface CampaignCostSummary {
  campaignId: string;
  totals: CostBucket;
  perSession: Array<CostBucket & { sessionId: string | null }>;
  perAgent: Array<CostBucket & { agentRole: AiAgentRole }>;
  avgPerSessionUsd: number;
  targetPerSessionUsd: number;
  withinTarget: boolean;
}

function computeCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
): number {
  const price = PRICING[modelId] ?? DEFAULT_PRICE;
  const cost =
    (inputTokens * price.input +
      outputTokens * price.output +
      cacheCreationTokens * price.cacheWrite +
      cacheReadTokens * price.cacheRead) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

@Injectable()
export class AiUsageService {
  constructor(
    @InjectRepository(AiUsageLogEntity)
    private readonly repo: Repository<AiUsageLogEntity>,
  ) {}

  async log(dto: LogAiUsageDto): Promise<AiUsageLogEntity> {
    const costUsd = computeCostUsd(
      dto.modelId,
      dto.inputTokens,
      dto.outputTokens,
      dto.cacheCreationTokens ?? 0,
      dto.cacheReadTokens ?? 0,
    );
    const entity = this.repo.create({
      campaignId: dto.campaignId,
      sessionId: dto.sessionId,
      agentRole: dto.agentRole,
      modelId: dto.modelId,
      inputTokens: dto.inputTokens,
      outputTokens: dto.outputTokens,
      cacheCreationTokens: dto.cacheCreationTokens ?? 0,
      cacheReadTokens: dto.cacheReadTokens ?? 0,
      costUsd: String(costUsd),
      tookMs: dto.tookMs,
      featureName: dto.featureName,
      characterId: dto.characterId,
      sceneType: dto.sceneType,
      turnNumber: dto.turnNumber,
    });
    return this.repo.save(entity);
  }

  async summaryForCampaign(
    campaignId: string,
    targetPerSessionUsd = 0.5,
  ): Promise<CampaignCostSummary> {
    const rows = await this.repo.find({
      where: { campaignId },
      order: { createdAt: "ASC" },
    });

    const totals = emptyBucket();
    const sessionMap = new Map<string | null, CostBucket>();
    const agentMap = new Map<AiAgentRole, CostBucket>();

    for (const row of rows) {
      const cost = Number(row.costUsd);
      accumulate(totals, row, cost);

      const sKey = row.sessionId ?? null;
      if (!sessionMap.has(sKey)) sessionMap.set(sKey, emptyBucket());
      accumulate(sessionMap.get(sKey)!, row, cost);

      if (!agentMap.has(row.agentRole))
        agentMap.set(row.agentRole, emptyBucket());
      accumulate(agentMap.get(row.agentRole)!, row, cost);
    }

    const perSession = Array.from(sessionMap.entries()).map(([sid, b]) => ({
      sessionId: sid,
      ...b,
    }));
    const perAgent = Array.from(agentMap.entries()).map(([role, b]) => ({
      agentRole: role,
      ...b,
    }));

    const sessionBuckets = perSession.filter((s) => s.sessionId !== null);
    const avgPerSessionUsd =
      sessionBuckets.length === 0
        ? 0
        : sessionBuckets.reduce((acc, s) => acc + s.costUsd, 0) /
          sessionBuckets.length;

    return {
      campaignId,
      totals,
      perSession,
      perAgent,
      avgPerSessionUsd: round6(avgPerSessionUsd),
      targetPerSessionUsd,
      withinTarget: avgPerSessionUsd <= targetPerSessionUsd,
    };
  }
}

function emptyBucket(): CostBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    calls: 0,
  };
}

function accumulate(bucket: CostBucket, row: AiUsageLogEntity, cost: number) {
  bucket.inputTokens += row.inputTokens;
  bucket.outputTokens += row.outputTokens;
  bucket.cacheCreationTokens += row.cacheCreationTokens;
  bucket.cacheReadTokens += row.cacheReadTokens;
  bucket.costUsd = round6(bucket.costUsd + cost);
  bucket.calls += 1;
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}
