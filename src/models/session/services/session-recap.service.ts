import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SessionMessageEntity } from "src/entities/session-message.entity";
import { OutboundFetch } from "src/common/observability/http/outbound-fetch.service";
import { DiadLogger } from "src/common/observability/logger/diad-logger.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import { UpstreamException } from "src/common/observability/errors/diad-exception";

/**
 * Spec 024 — Hot-recap on-demand para sessions cuja `summary_text` ficou NULL
 * (player fechou aba sem `/finalize`). Idempotente, async, advisory-lock.
 *
 * Princípio X v1.4.0 — esta camada existe pra suprir `previousSessionSummary`
 * em retomadas (cross-session continuity da spec 014). Sem isso, Narrator
 * perde o arco anterior — caso `d251a52f`.
 *
 * Princípio XI — falhas log estruturado, errors envelope-compliant; nunca
 * relança upstream (não-bloqueante por design). Retry imediato 1× +
 * agendado 1× após 30s; após 2 falhas, telemetria registra e desiste (M2
 * adiciona cron diário).
 */
export interface RecapSuccess {
  status: "cached" | "generated";
  summaryText: string;
  latencyMs?: number;
  tokensConsumed?: number;
}

export interface RecapSkipped {
  status: "skipped_too_few_messages" | "skipped_locked" | "skipped_not_found";
  messageCount?: number;
}

export interface RecapFailed {
  status: "failed";
  errorCode: string;
  willRetry: boolean;
}

export type RecapStatus = RecapSuccess | RecapSkipped | RecapFailed;

const MIN_MESSAGES = 10;
const MAX_MESSAGES_FOR_SUMMARIZE = 40;
const SUMMARIZE_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 30_000;

interface InternalSummarizeResponse {
  summaryText: string;
  keyFacts?: Record<string, unknown>;
  modelUsed?: string;
  tokensConsumed?: number;
  latencyMs?: number;
}

@Injectable()
export class SessionRecapService {
  private readonly agentBaseUrl: string;
  private readonly internalToken: string;
  /** sessionId pra o qual já foi agendado retry — evita acumular timers. */
  private readonly retryScheduled = new Set<string>();

  constructor(
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(SessionMessageEntity)
    private readonly messageRepo: Repository<SessionMessageEntity>,
    private readonly dataSource: DataSource,
    private readonly outbound: OutboundFetch,
    private readonly logger: DiadLogger,
    private readonly config: ConfigService,
  ) {
    this.logger.setContext(SessionRecapService.name);
    this.agentBaseUrl =
      this.config.get<string>("AGENT_BASE_URL") ?? "http://localhost:9003";
    this.internalToken =
      this.config.get<string>("INTERNAL_AGENTS_TOKEN") ?? "diad-internal-dev";
  }

  async ensureRecap(sessionId: string): Promise<RecapStatus> {
    if (!sessionId) {
      return {
        status: "failed",
        errorCode: ErrorCode.SUMMARIZE_INVALID_INPUT,
        willRetry: false,
      };
    }

    const lockKey = this.lockKey(sessionId);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const lockRow = await queryRunner.query(
        `SELECT pg_try_advisory_lock($1) AS got`,
        [lockKey],
      );
      const got = lockRow?.[0]?.got === true || lockRow?.[0]?.got === "t";
      if (!got) {
        this.logger.info("session.recap.skipped_locked", {
          "session.id": sessionId,
        });
        return { status: "skipped_locked" };
      }

      try {
        return await this.doEnsure(sessionId);
      } finally {
        await queryRunner.query(`SELECT pg_advisory_unlock($1)`, [lockKey]);
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async doEnsure(sessionId: string): Promise<RecapStatus> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ["id", "campaignId", "summaryText"],
    });
    if (!session) {
      this.logger.warn("session.recap.not_found", {
        "session.id": sessionId,
      });
      return { status: "skipped_not_found" };
    }

    if (session.summaryText && session.summaryText.length > 0) {
      return { status: "cached", summaryText: session.summaryText };
    }

    const messageCount = await this.messageRepo.count({
      where: { sessionId },
    });
    if (messageCount < MIN_MESSAGES) {
      this.logger.info("session.recap.skipped_too_few_messages", {
        "session.id": sessionId,
        "session.message_count": messageCount,
      });
      return { status: "skipped_too_few_messages", messageCount };
    }

    const messages = await this.messageRepo
      .createQueryBuilder("m")
      .where("m.session_id = :sessionId", { sessionId })
      .orderBy("m.sequence_number", "DESC")
      .take(MAX_MESSAGES_FOR_SUMMARIZE)
      .getMany();
    messages.reverse();

    this.logger.info("session.recap.triggered", {
      "session.id": sessionId,
      "session.message_count": messageCount,
    });

    const start = Date.now();
    let response: InternalSummarizeResponse;
    try {
      response = await this.callSummarize(sessionId, session.campaignId, messages);
    } catch (err) {
      return this.handleSummarizeError(err, sessionId);
    }

    const summaryText = (response.summaryText ?? "").slice(0, 3200);
    if (!summaryText) {
      this.logger.warn("session.recap.empty_summary", {
        "session.id": sessionId,
      });
      return {
        status: "failed",
        errorCode: ErrorCode.AGENT_INVALID_RESPONSE,
        willRetry: false,
      };
    }

    await this.sessionRepo.update(sessionId, {
      summaryText,
      summaryKeyFacts: (response.keyFacts ?? {}) as Record<string, any>,
    });

    const latencyMs = response.latencyMs ?? Date.now() - start;
    this.logger.info("session.recap.generated", {
      "session.id": sessionId,
      duration_ms: latencyMs,
      "llm.model": response.modelUsed ?? "unknown",
      "llm.tokens": response.tokensConsumed ?? 0,
    });

    return {
      status: "generated",
      summaryText,
      latencyMs,
      tokensConsumed: response.tokensConsumed ?? 0,
    };
  }

  private async callSummarize(
    sessionId: string,
    campaignId: string | undefined,
    messages: SessionMessageEntity[],
  ): Promise<InternalSummarizeResponse> {
    const payload = {
      sessionId,
      ...(campaignId ? { campaignId } : {}),
      messages: messages.map((m) => ({
        role: this.mapRole(m.kind),
        content: (m.content ?? "").slice(0, 4000),
        sequenceNumber: m.sequenceNumber,
        kind: m.kind,
      })),
    };
    return this.outbound.request<InternalSummarizeResponse>(
      `${this.agentBaseUrl}/internal/summarize`,
      {
        method: "POST",
        upstreamService: "diad-agents",
        timeoutMs: SUMMARIZE_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.internalToken,
        },
        body: JSON.stringify(payload),
      },
    );
  }

  private handleSummarizeError(err: unknown, sessionId: string): RecapStatus {
    const code = this.extractErrorCode(err);
    const willRetry =
      code === ErrorCode.AGENT_TIMEOUT ||
      code === ErrorCode.AGENT_UNREACHABLE ||
      code === ErrorCode.AGENT_UPSTREAM_ERROR ||
      code === ErrorCode.SUMMARIZE_LLM_TIMEOUT ||
      code === ErrorCode.SUMMARIZE_LLM_FAILURE;

    this.logger.error("session.recap.failed", err, {
      "session.id": sessionId,
      "error.code": code,
      "retry.scheduled": willRetry,
    });

    if (willRetry) this.scheduleRetry(sessionId);

    return { status: "failed", errorCode: code, willRetry };
  }

  private extractErrorCode(err: unknown): string {
    if (err instanceof UpstreamException) {
      return err.code;
    }
    if (err && typeof err === "object" && "code" in err) {
      const c = (err as { code: unknown }).code;
      if (typeof c === "string") return c;
    }
    return ErrorCode.SUMMARIZE_LLM_FAILURE;
  }

  private scheduleRetry(sessionId: string): void {
    if (this.retryScheduled.has(sessionId)) return;
    this.retryScheduled.add(sessionId);
    setTimeout(() => {
      this.retryScheduled.delete(sessionId);
      this.ensureRecap(sessionId).catch((err) => {
        this.logger.error("session.recap.retry_failed", err, {
          "session.id": sessionId,
        });
      });
    }, RETRY_DELAY_MS).unref?.();
  }

  private mapRole(kind: string): "user" | "assistant" | "system" {
    if (kind === "player_action") return "user";
    if (kind === "narration" || kind === "combat_resolution") return "assistant";
    return "system";
  }

  /**
   * pg_try_advisory_lock aceita bigint. Hash do sessionId em int32 estável.
   */
  private lockKey(sessionId: string): number {
    let h = 0;
    const s = `recap:${sessionId}`;
    for (let i = 0; i < s.length; i += 1) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }
}
