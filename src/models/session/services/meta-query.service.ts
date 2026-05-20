import { createHash } from "crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { EventBusService } from "src/common/event-bus/event-bus.service";
import { EventEnvelopeFactory } from "src/common/event-bus/event-envelope.factory";
import { DomainException } from "src/common/observability/errors/diad-exception";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import { generateTraceId } from "src/common/observability/trace/trace-context";
import { GameSessionEntity } from "src/entities/game-session.entity";
import {
  MetaQueryAuditEntity,
  type MetaQueryIntentCategory,
} from "src/entities/meta-query-audit.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { MetaQueryGuard } from "./meta-query-guard.service";
import {
  MetaQueryFactResolver,
  type MetaQueryAllowedFact,
} from "./meta-query-fact-resolver.service";

export interface MetaQueryInput {
  userId: string;
  sceneId: string;
  characterId?: string;
  question: string;
}

export interface MetaQueryAnswer {
  sessionId: string;
  campaignId?: string | null;
  sceneId: string;
  characterId: string | null;
  intentCategory: MetaQueryIntentCategory;
  answer: string;
  remaining: number;
  filteredFactsCount: number;
  traceId: string;
}

const META_QUERY_LIMIT_PER_SCENE = 3;
const META_QUERY_LLM_TIMEOUT_MS = 8_000;

interface MetaQueryAgentResponse {
  answer: string;
  modelUsed?: string;
  latencyMs?: number;
}

@Injectable()
export class MetaQueryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    private readonly eventBus: EventBusService,
    private readonly envelopeFactory: EventEnvelopeFactory,
    private readonly guard: MetaQueryGuard,
    private readonly factResolver: MetaQueryFactResolver,
    private readonly outbound: OutboundFetch,
    private readonly config: ConfigService,
  ) {}

  async answer(sessionId: string, input: MetaQueryInput): Promise<MetaQueryAnswer> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new DomainException(
        ErrorCode.SESSION_NOT_FOUND,
        `Sessão ${sessionId} não encontrada.`,
      );
    }
    if (session.config?.bimodalLoopEnabled !== true) {
      throw new DomainException(
        ErrorCode.SESSION_BIMODAL_LOOP_DISABLED,
        "Loop bimodal desabilitado para esta sessão.",
      );
    }

    const characterId = input.characterId ?? session.characterIds?.[0] ?? null;
    const traceId = generateTraceId();

    const result = await this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager) => {
        const scene = await manager.findOne(SceneEntity, {
          where: { id: input.sceneId, sessionId },
          lock: { mode: "pessimistic_write" },
        });
        if (!scene) {
          throw new DomainException(
            ErrorCode.SCENE_NOT_FOUND,
            "Cena não encontrada para meta-query.",
            { context: { sessionId, sceneId: input.sceneId } },
          );
        }

        const used = await this.countSceneQueries(manager, sessionId, input.sceneId);
        if (used >= META_QUERY_LIMIT_PER_SCENE) {
          throw new DomainException(
            ErrorCode.META_QUERY_RATE_LIMIT_EXCEEDED,
            "Limite de perguntas meta atingido nesta cena.",
            { context: { sessionId, sceneId: input.sceneId } },
          );
        }

        const allowedFacts = await this.factResolver.resolve({
          userId: input.userId,
          session,
          scene,
          characterId,
          question: input.question,
          intentCategory: "tactical_query",
        });
        const inspection = this.guard.inspect(input.question, allowedFacts);
        const answer = await this.verbalizeAnswer({
          question: input.question,
          intentCategory: inspection.intentCategory,
          allowedFactSet: inspection.allowedFactSet,
          traceId,
        });
        const audit = manager.create(MetaQueryAuditEntity, {
          sessionId,
          campaignId: session.campaignId ?? null,
          sceneId: input.sceneId,
          characterId,
          questionHash: this.hashQuestion(input.question),
          intentCategory: inspection.intentCategory,
          filteredFactsCount: inspection.filteredFactsCount,
          traceId,
          answerSummary: answer.slice(0, 500),
          metadata: {
            source: "bimodal_loop",
            limitPerScene: META_QUERY_LIMIT_PER_SCENE,
            allowedFactIds: inspection.allowedFactSet.map((fact) => fact.factId),
          },
        });
        await manager.save(MetaQueryAuditEntity, audit);

        return {
          sessionId,
          sceneId: input.sceneId,
          characterId,
          intentCategory: inspection.intentCategory,
          answer,
          remaining: META_QUERY_LIMIT_PER_SCENE - used - 1,
          filteredFactsCount: inspection.filteredFactsCount,
          traceId,
        };
      },
    );

    await this.publishMetaQueryInvoked(result);
    return result;
  }

  async remainingForScene(
    sessionId: string,
    sceneId: string | null | undefined,
  ): Promise<number> {
    if (!sceneId) return META_QUERY_LIMIT_PER_SCENE;
    const used = await this.dataSource.manager.count(MetaQueryAuditEntity, {
      where: { sessionId, sceneId },
    });
    return Math.max(0, META_QUERY_LIMIT_PER_SCENE - used);
  }

  private async countSceneQueries(
    manager: EntityManager,
    sessionId: string,
    sceneId: string,
  ): Promise<number> {
    return manager.count(MetaQueryAuditEntity, {
      where: { sessionId, sceneId },
    });
  }

  private hashQuestion(question: string): string {
    return createHash("sha256").update(question.trim()).digest("hex");
  }

  private async verbalizeAnswer(input: {
    question: string;
    intentCategory: MetaQueryIntentCategory;
    allowedFactSet: MetaQueryAllowedFact[];
    traceId: string;
  }): Promise<string> {
    const agentBaseUrl =
      this.config.get<string>("AGENT_BASE_URL") ?? "http://localhost:9003";
    const internalToken =
      this.config.get<string>("INTERNAL_AGENTS_TOKEN") ?? "diad-internal-dev";

    const response = await this.outbound.request<MetaQueryAgentResponse>(
      `${agentBaseUrl}/internal/meta-query`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs: META_QUERY_LLM_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internalToken,
        },
        body: JSON.stringify({
          question: input.question,
          intentCategory: input.intentCategory,
          allowedFactSet: input.allowedFactSet,
          traceId: input.traceId,
        }),
      },
    );
    const answer = response.answer?.trim();
    if (!answer) {
      throw new DomainException(
        ErrorCode.AGENT_INVALID_RESPONSE,
        "Agents retornou meta-query sem resposta verbalizada.",
      );
    }
    return answer.slice(0, 900);
  }

  private async publishMetaQueryInvoked(result: MetaQueryAnswer): Promise<void> {
    const envelope = this.envelopeFactory.build({
      eventCategory: "NarrativeEvent",
      eventType: "meta_query_invoked",
      source: {
        service: "diad-backend",
        module: "MetaQueryService.answer",
        traceId: result.traceId,
      },
      scope: {
        campaignId: result.campaignId ?? "",
        sessionId: result.sessionId,
        sceneId: result.sceneId,
      },
      audiences: ["Director", "Narrator", "HUD", "Archivist"],
      narrativeDescriptor: "Pergunta meta invocada pelo jogador.",
      payload: {
        sessionId: result.sessionId,
        sceneId: result.sceneId,
        characterId: result.characterId,
        intentCategory: result.intentCategory,
        filteredFactsCount: result.filteredFactsCount,
        remaining: result.remaining,
      },
    });
    await this.eventBus.publish(envelope);
  }
}
