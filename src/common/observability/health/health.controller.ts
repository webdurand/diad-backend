import { Controller, Get, HttpCode } from "@nestjs/common";
import type { Response } from "express";
import { Res } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ClsService } from "nestjs-cls";
import { ErrorCode } from "../errors/error-codes.catalog";
import { ERROR_CODE_METADATA } from "../errors/error-codes.metadata";
import type { ErrorEnvelope } from "../types/error-envelope.types";

@Controller("observability")
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  @Get("healthz")
  @HttpCode(200)
  healthz(): {
    status: "ok";
    service: "diad-backend";
    version: string;
    timestamp: string;
    traceId: string | null;
  } {
    return {
      status: "ok",
      service: "diad-backend",
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
      traceId: this.readTraceId(),
    };
  }

  @Get("readyz")
  async readyz(@Res() res: Response): Promise<void> {
    try {
      await this.dataSource.query("SELECT 1");
      res.status(200).json({
        status: "ok",
        service: "diad-backend",
        timestamp: new Date().toISOString(),
        traceId: this.readTraceId(),
      });
    } catch (err) {
      const code = ErrorCode.SYSTEM_UNAVAILABLE;
      const md = ERROR_CODE_METADATA[code];
      const envelope: ErrorEnvelope = {
        type: `https://diad.dev/errors/${code}`,
        title: md.defaultTitle,
        status: 503,
        detail:
          err instanceof Error
            ? `Database unreachable: ${err.message}`
            : "Database unreachable",
        instance: "/observability/readyz",
        code,
        traceId: this.readTraceId() ?? "0".repeat(32),
        hint: md.defaultHint,
      };
      res
        .status(503)
        .setHeader("Content-Type", "application/problem+json")
        .json(envelope);
    }
  }

  private readTraceId(): string | null {
    try {
      if (!this.cls.isActive()) return null;
      const v = this.cls.get<string>("traceId");
      return typeof v === "string" && v.length ? v : null;
    } catch {
      return null;
    }
  }
}
