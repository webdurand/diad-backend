import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

export const PERIOD_PRESETS = ["24h", "7d", "30d", "90d", "180d"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export class PeriodQueryDto {
  @IsOptional()
  @IsIn(PERIOD_PRESETS)
  period?: PeriodPreset;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class CostsQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  model?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  agentRole?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  featureName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class UsageQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(["M0", "M3"])
  cohortStart?: "M0" | "M3";
}

export class LogsQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(["session_event", "ai_usage", "admin_audit"])
  source?: "session_event" | "ai_usage" | "admin_audit";

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  featureName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  eventType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  model?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  traceId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ExportLogsQueryDto extends LogsQueryDto {
  @IsOptional()
  @IsBooleanString()
  download?: string;
}
