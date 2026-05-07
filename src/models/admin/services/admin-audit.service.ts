import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ClsService } from "nestjs-cls";
import { AdminAuditLogEntity } from "src/entities/admin-audit-log.entity";

export interface RecordAuditDto {
  adminId: string;
  action: string;
  targetEntity?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly repo: Repository<AdminAuditLogEntity>,
    private readonly cls: ClsService,
  ) {}

  async record(dto: RecordAuditDto): Promise<void> {
    try {
      const traceId = this.cls.isActive()
        ? this.cls.get<string>("traceId")
        : undefined;

      const entity = this.repo.create({
        adminId: dto.adminId,
        action: dto.action,
        targetEntity: dto.targetEntity,
        targetId: dto.targetId,
        details: dto.details ?? {},
        traceId,
      });
      await this.repo.save(entity);
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar admin audit (action=${dto.action}): ${(err as Error).message}`,
      );
    }
  }
}
