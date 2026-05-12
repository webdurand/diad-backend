import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterService } from "src/models/game-engine/services/encounter.service";

export interface CreateQuickPlayEncounterDto {
  characterId: string;
  monsters: Array<{ monsterId: string; count: number }>;
  gridSize?: number;
  inLair?: boolean;
}

export interface QuickPlayEncounterResult {
  encounterId: string;
  sessionId: string;
  campaignId: string;
}

@Injectable()
export class QuickPlayService {
  private readonly logger = new Logger(QuickPlayService.name);

  constructor(
    @InjectRepository(CampaignEntity)
    private readonly campaignRepo: Repository<CampaignEntity>,
    @InjectRepository(GameSessionEntity)
    private readonly sessionRepo: Repository<GameSessionEntity>,
    @InjectRepository(CampaignPlayerEntity)
    private readonly campaignPlayerRepo: Repository<CampaignPlayerEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly encounterService: EncounterService,
  ) {}

  async getOrCreateSandbox(
    ownerUserId: string,
  ): Promise<{ campaignId: string; sessionId: string }> {
    let campaign = await this.campaignRepo.findOne({
      where: { dmUserId: ownerUserId, isSandbox: true },
    });
    if (!campaign) {
      campaign = await this.campaignRepo.save(
        this.campaignRepo.create({
          slug: `qp-sandbox-${ownerUserId}`,
          name: "Quick Play Sandbox",
          description: "Arena de treino — combate isolado, sem narrativa.",
          difficulty: "standard",
          dmUserId: ownerUserId,
          status: "active",
          dmMode: "human",
          scope: "solo",
          isDraft: false,
          isSandbox: true,
        }),
      );
      const exists = await this.campaignPlayerRepo.findOne({
        where: { campaignId: campaign.id, userId: ownerUserId },
      });
      if (!exists) {
        await this.campaignPlayerRepo.save(
          this.campaignPlayerRepo.create({
            campaignId: campaign.id,
            userId: ownerUserId,
            isActive: true,
          }),
        );
      }
    }

    let session = await this.sessionRepo.findOne({
      where: { campaignId: campaign.id, ownerId: ownerUserId },
    });
    if (!session) {
      session = await this.sessionRepo.save(
        this.sessionRepo.create({
          name: "Sandbox",
          ownerId: ownerUserId,
          campaignId: campaign.id,
          status: "active",
          characterIds: [],
          scene: {},
          config: {},
        }),
      );
    }

    return { campaignId: campaign.id, sessionId: session.id };
  }

  async createEncounter(
    ownerUserId: string,
    dto: CreateQuickPlayEncounterDto,
  ): Promise<QuickPlayEncounterResult> {
    if (!dto.characterId) {
      throw new BadRequestException("characterId é obrigatório.");
    }
    if (!Array.isArray(dto.monsters) || dto.monsters.length === 0) {
      throw new BadRequestException("Pelo menos um monstro é obrigatório.");
    }
    for (const m of dto.monsters) {
      if (!m.monsterId || typeof m.count !== "number" || m.count < 1) {
        throw new BadRequestException("Monstro inválido (monsterId/count).");
      }
    }

    const { campaignId, sessionId } =
      await this.getOrCreateSandbox(ownerUserId);

    const encounter = await this.encounterService.create(sessionId, {
      name: `Quick Play ${new Date().toISOString()}`,
    });

    await this.encounterService.addCharacter(
      encounter.id,
      dto.characterId,
      ownerUserId,
    );

    for (const m of dto.monsters) {
      await this.encounterService.addMonster(encounter.id, {
        monsterId: m.monsterId,
        count: m.count,
      });
    }

    await this.participantRepo.update(
      { encounterId: encounter.id, type: "monster" },
      { controlledBy: "ai" },
    );

    const gridSize =
      dto.gridSize && dto.gridSize > 0 ? Math.floor(dto.gridSize) : 20;
    await this.encounterRepo.update(encounter.id, {
      mapData: {
        ...(encounter.mapData ?? {}),
        gridSize,
        gridColumns: gridSize,
        gridRows: gridSize,
        gridVisible: true,
      },
      inLair: dto.inLair === true,
    });

    await this.sessionRepo.update(sessionId, {
      activeEncounterId: encounter.id,
    });

    return { encounterId: encounter.id, sessionId, campaignId };
  }
}
