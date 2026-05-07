import {
  Controller,
  Get,
  Header,
  Logger,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { AdminMetricsService } from "./services/admin-metrics.service";
import { AdminAuditService } from "./services/admin-audit.service";
import {
  CostsQueryDto,
  ExportLogsQueryDto,
  LogsQueryDto,
  PeriodQueryDto,
  UsageQueryDto,
} from "./dto/admin-metrics.dto";

interface AuthedRequest extends Request {
  user?: { sub: string; role: string; email?: string };
}

@Controller("admin/metrics")
@UseGuards(AuthGuard, AdminGuard)
export class AdminMetricsController {
  private readonly logger = new Logger(AdminMetricsController.name);

  constructor(
    private readonly metrics: AdminMetricsService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get("overview")
  async overview(@Query() query: PeriodQueryDto, @Req() req: AuthedRequest) {
    const result = await this.metrics.getOverview(query);
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.overview.read",
      details: { period: query.period, from: query.from, to: query.to },
    });
    return result;
  }

  @Get("costs")
  async costs(@Query() query: CostsQueryDto, @Req() req: AuthedRequest) {
    const result = await this.metrics.getCosts(query);
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.costs.read",
      details: { ...query },
    });
    return result;
  }

  @Get("usage")
  async usage(@Query() query: UsageQueryDto, @Req() req: AuthedRequest) {
    const result = await this.metrics.getUsage(query);
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.usage.read",
      details: { ...query },
    });
    return result;
  }

  @Get("logs")
  async logs(@Query() query: LogsQueryDto, @Req() req: AuthedRequest) {
    const result = await this.metrics.getLogs(query);
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.logs.read",
      details: { ...query },
    });
    return result;
  }

  @Get("logs/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="diad-logs.csv"')
  async exportLogs(
    @Query() query: ExportLogsQueryDto,
    @Req() req: AuthedRequest,
  ): Promise<string> {
    const csv = await this.metrics.exportLogsCsv(query);
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.logs.export",
      details: { ...query, rowCount: csv.split("\r\n").length - 1 },
    });
    return csv;
  }

  @Post("refresh-matviews")
  async refreshMatviews(@Req() req: AuthedRequest) {
    const result = await this.metrics.refreshMatviews();
    void this.audit.record({
      adminId: req.user!.sub,
      action: "metrics.matviews.refresh",
    });
    return result;
  }
}
