import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CloseRollOutcome,
  VowCloseRollResult,
  VowEntity,
  VowMilestoneCondition,
  VowRank,
} from "src/entities/vow.entity";

export interface CreateVowDto {
  description: string;
  rank: VowRank;
  isMainVow?: boolean;
  milestoneConditions?: VowMilestoneCondition[];
  progress?: number;
}

export interface UpdateVowDto {
  progress?: number;
  description?: string;
  rank?: VowRank;
  status?: "open" | "fulfilled" | "forsaken";
  milestoneConditions?: VowMilestoneCondition[];
}

export interface FulfillVowResponse {
  vow: VowEntity;
  closeRollResult: VowCloseRollResult;
}

@Injectable()
export class VowService {
  constructor(
    @InjectRepository(VowEntity)
    private readonly vowRepo: Repository<VowEntity>,
  ) {}

  async create(
    gameSessionId: string,
    dto: CreateVowDto,
  ): Promise<VowEntity> {
    if (dto.isMainVow) {
      const existing = await this.vowRepo.findOne({
        where: { gameSessionId, isMainVow: true, status: "open" },
      });
      if (existing) {
        throw new ConflictException({
          ok: false,
          error: "Esta aventura já possui uma Vow principal aberta.",
          code: "MAIN_VOW_ALREADY_EXISTS",
          existingVowId: existing.id,
        });
      }
    }
    const progress = dto.progress ?? 0;
    if (progress < 0 || progress > 10) {
      throw new BadRequestException({
        ok: false,
        error: "progress deve estar entre 0 e 10.",
        code: "VOW_PROGRESS_OUT_OF_RANGE",
      });
    }
    const vow = this.vowRepo.create({
      gameSessionId,
      description: dto.description,
      rank: dto.rank,
      progress,
      status: "open",
      isMainVow: dto.isMainVow ?? false,
      milestoneConditions: dto.milestoneConditions ?? [],
    });
    return this.vowRepo.save(vow);
  }

  async listBySession(gameSessionId: string): Promise<VowEntity[]> {
    return this.vowRepo.find({
      where: { gameSessionId },
      order: { isMainVow: "DESC", createdAt: "ASC" },
    });
  }

  async getById(vowId: string): Promise<VowEntity> {
    const vow = await this.vowRepo.findOne({ where: { id: vowId } });
    if (!vow) {
      throw new NotFoundException({
        ok: false,
        error: "Vow não encontrada.",
        code: "VOW_NOT_FOUND",
      });
    }
    return vow;
  }

  async update(vowId: string, dto: UpdateVowDto): Promise<VowEntity> {
    const vow = await this.getById(vowId);
    if (typeof dto.progress === "number") {
      if (dto.progress < 0 || dto.progress > 10) {
        throw new BadRequestException({
          ok: false,
          error: "progress deve estar entre 0 e 10.",
          code: "VOW_PROGRESS_OUT_OF_RANGE",
        });
      }
      vow.progress = dto.progress;
    }
    if (dto.description !== undefined) vow.description = dto.description;
    if (dto.rank !== undefined) vow.rank = dto.rank;
    if (dto.status !== undefined) vow.status = dto.status;
    if (dto.milestoneConditions !== undefined) {
      vow.milestoneConditions = dto.milestoneConditions;
    }
    return this.vowRepo.save(vow);
  }

  async fulfill(vowId: string): Promise<FulfillVowResponse> {
    const vow = await this.getById(vowId);
    if (vow.status !== "open") {
      throw new ConflictException({
        ok: false,
        error: `Vow já está ${vow.status === "fulfilled" ? "cumprida" : "abandonada"}.`,
        code: "VOW_NOT_OPEN",
        currentStatus: vow.status,
      });
    }

    const target = Math.floor(Number(vow.progress) / 2);
    const c1 = this.rollD10();
    const c2 = this.rollD10();

    let outcome: CloseRollOutcome;
    if (target >= c1 && target >= c2) outcome = "strong_hit";
    else if (target >= c1 || target >= c2) outcome = "weak_hit";
    else outcome = "miss";

    const narrativeSeed = this.buildNarrativeSeed(outcome, vow.description);
    const closeRollResult: VowCloseRollResult = {
      targetNumber: target,
      challengeDice: [c1, c2],
      outcome,
      narrativeSeed,
      rolledAt: new Date().toISOString(),
    };

    vow.closeRollResult = closeRollResult;
    if (outcome !== "miss") {
      vow.status = "fulfilled";
      vow.fulfilledAt = new Date();
    }
    await this.vowRepo.save(vow);

    return { vow, closeRollResult };
  }

  private rollD10(): number {
    return Math.floor(Math.random() * 10) + 1;
  }

  private buildNarrativeSeed(
    outcome: CloseRollOutcome,
    description: string,
  ): string {
    if (outcome === "strong_hit") {
      return `A jura foi cumprida em sua forma plena: ${description}.`;
    }
    if (outcome === "weak_hit") {
      return `A jura foi cumprida, mas a custo — ${description}. Algo se perdeu no caminho.`;
    }
    return `A jura não foi cumprida como se esperava: ${description}. O destino pede novo preço.`;
  }
}
