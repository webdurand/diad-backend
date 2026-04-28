import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { AiProxyService } from "./ai-proxy.service";
import { SessionResumeService } from "../session/services/session-resume.service";
import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type { AuthRequest } from "../auth/auth.types";

@Controller("ai")
@UseGuards(AuthGuard)
export class AiProxyController {
  private readonly logger = new Logger(AiProxyController.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly resumeService: SessionResumeService,
  ) {}

  // ────── Assistente D&D ──────

  @Post("assistant/message")
  async assistantMessage(
    @Body() body: { message: string; sessionId?: string },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      await this.aiProxyService.pipeStream(
        "/assistant/message",
        {
          message: body.message,
          session_id: body.sessionId,
          user_id: req.user!.id,
        },
        res,
      );
    } catch (err: any) {
      this.logger.error(`Assistant proxy error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Get("assistant/history")
  async assistantHistory(@Req() req: AuthRequest) {
    return this.aiProxyService.requestAgent(
      "GET",
      `/assistant/history?user_id=${req.user!.id}`,
    );
  }

  // ────── Solo Play ──────

  @Post("solo/create")
  async soloCreate(
    @Body()
    body: {
      characterId: string;
      tone: string;
      difficulty: string;
      type: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.aiProxyService.requestAgent("POST", "/solo/create", {
      character_id: body.characterId,
      tone: body.tone,
      difficulty: body.difficulty,
      type: body.type,
      user_id: req.user!.id,
    });
  }

  @Post("solo/:sessionId/narrate-start")
  async soloNarrateStart(
    @Param("sessionId") sessionId: string,
    @Body() body: { characterId: string },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/narrate-start`,
        {
          character_id: body.characterId,
          user_id: req.user!.id,
        },
        res,
      );
    } catch (err: any) {
      this.logger.error(`Solo narrate-start error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Post("solo/:sessionId/message")
  async soloMessage(
    @Param("sessionId") sessionId: string,
    @Body() body: { message: string; lastMessageId?: number | null },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      // Spec 024 — monta payload enriquecido server-side: sceneContext,
      // recentMessages, isResumed, previousSessionSummary, hot-recap
      // (fire-and-forget) e session_resumed event quando aplicável.
      const ctx = await this.resumeService.assemble(sessionId, {
        lastMessageIdFromClient: body.lastMessageId ?? null,
      });

      if (ctx.lastMessageMismatch) {
        res.statusCode = 409;
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            code: ErrorCode.SESSION_LAST_MESSAGE_MISMATCH,
            content:
              "Histórico desincronizado — recarregue para continuar a sessão.",
          })}\n\n`,
        );
        res.end();
        return;
      }

      res.setHeader(
        "X-Session-Resume-Hot-Recap",
        ctx.hotRecapTriggered
          ? "pending"
          : ctx.previousSessionSummary
          ? "cached"
          : "none",
      );
      res.setHeader(
        "X-Session-Is-Resumed",
        ctx.isResumed ? "true" : "false",
      );

      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/message`,
        {
          message: body.message,
          user_id: req.user!.id,
          // Spec 024 — payload enriquecido (camelCase per contract).
          sessionId,
          campaignId: ctx.campaignId,
          isResumed: ctx.isResumed,
          previousSessionId: ctx.previousSessionId,
          sceneContext: ctx.sceneContext,
          recentMessages: ctx.recentMessages,
          previousSessionSummary: ctx.previousSessionSummary,
          lastMessageId: body.lastMessageId ?? ctx.serverLastMessageId,
          gapMinutes: ctx.gapMinutes,
        },
        res,
      );
    } catch (err: any) {
      this.logger.error(`Solo message error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Post("solo/:sessionId/action")
  async soloAction(
    @Param("sessionId") sessionId: string,
    @Body()
    body: {
      type: string;
      actionId?: string;
      targetId?: string;
      spellId?: string;
      text?: string;
    },
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      await this.aiProxyService.pipeStream(
        `/solo/${sessionId}/action`,
        { ...body, user_id: req.user!.id },
        res,
      );
    } catch (err: any) {
      this.logger.error(`Solo action error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  @Get("solo/:sessionId/state")
  async soloState(@Param("sessionId") sessionId: string) {
    return this.aiProxyService.requestAgent("GET", `/solo/${sessionId}/state`);
  }

  @Post("solo/:sessionId/end")
  async soloEnd(
    @Param("sessionId") sessionId: string,
    @Req() req: AuthRequest,
  ) {
    return this.aiProxyService.requestAgent("POST", `/solo/${sessionId}/end`, {
      user_id: req.user!.id,
    });
  }

  // ────── Admin: Knowledge Management ──────

  @Post("admin/knowledge/upload")
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor("file"))
  async uploadKnowledge(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error("Nenhum arquivo recebido.");
    }

    this.logger.log(
      `Upload knowledge: ${file.originalname} (${file.size} bytes)`,
    );

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(file.buffer)]),
      file.originalname,
    );

    const agentUrl = `${this.aiProxyService.getAgentBaseUrl()}/admin/knowledge/upload-file`;
    const response = await fetch(agentUrl, { method: "POST", body: formData });
    if (!response.ok) {
      const error = await response.text().catch(() => "Upload failed");
      this.logger.error(`Agent upload failed: ${error}`);
      throw new Error(`Falha no upload: ${error}`);
    }
    return response.json();
  }

  @Get("admin/knowledge")
  @UseGuards(AdminGuard)
  async listKnowledge() {
    try {
      return await this.aiProxyService.requestAgent(
        "GET",
        "/admin/knowledge/documents",
      );
    } catch {
      return { documents: [], total: 0 };
    }
  }

  @Post("admin/knowledge/:id/cancel")
  @UseGuards(AdminGuard)
  async cancelKnowledge(@Param("id") id: string) {
    return this.aiProxyService.requestAgent(
      "POST",
      `/admin/knowledge/doc/${id}/cancel`,
    );
  }

  @Delete("admin/knowledge/:id")
  @UseGuards(AdminGuard)
  async deleteKnowledge(@Param("id") id: string) {
    return this.aiProxyService.requestAgent(
      "DELETE",
      `/admin/knowledge/doc/${id}`,
    );
  }

  @Post("admin/knowledge/rebuild")
  @UseGuards(AdminGuard)
  async rebuildKnowledge() {
    return this.aiProxyService.requestAgent("POST", "/admin/knowledge/rebuild");
  }
}
