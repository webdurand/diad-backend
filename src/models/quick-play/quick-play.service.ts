import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { EncounterService } from "src/models/game-engine/services/encounter.service";
import {
  CharacterStateService,
  QuickPlayCharacterStateSnapshot,
} from "src/models/characters/services/character-state.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";

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
    @Optional()
    @InjectRepository(CharacterStateEntity)
    private readonly characterStateRepo?: Repository<CharacterStateEntity>,
    @Optional()
    private readonly characterSheetService?: CharacterSheetService,
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

    const trainingState = await this.prepareCharacterForTraining(
      ownerUserId,
      dto.characterId,
    );

    try {
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

      let difficulty:
        | {
            adjusted_xp: number;
            threshold: string;
            total_monster_xp: number;
            party_level_summary: Record<number, number>;
          }
        | undefined;
      if (this.characterSheetService) {
        const sheet = await this.characterSheetService.computeSheet(
          ownerUserId,
          dto.characterId,
        );
        const calculated = await this.encounterService.calculateDifficulty(
          encounter.id,
          [sheet.totalLevel],
        );
        difficulty = {
          adjusted_xp: calculated.adjustedXp,
          threshold: calculated.threshold,
          total_monster_xp: calculated.totalMonsterXp,
          party_level_summary: { [sheet.totalLevel]: 1 },
        };
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
          quickPlay: trainingState
            ? {
                characterId: dto.characterId,
                characterStateSnapshot: trainingState,
                restored: false,
              }
            : undefined,
        } as any,
        inLair: dto.inLair === true,
        difficulty,
      });

      await this.sessionRepo.update(sessionId, {
        activeEncounterId: encounter.id,
      });

      return { encounterId: encounter.id, sessionId, campaignId };
    } catch (error) {
      if (trainingState) {
        await this.restorePreparedState(dto.characterId, trainingState).catch(
          (restoreError: unknown) => {
            this.logger.error(
              `Falha ao restaurar estado após erro no Quick Play: ${
                restoreError instanceof Error
                  ? restoreError.message
                  : String(restoreError)
              }`,
            );
          },
        );
      }
      throw error;
    }
  }

  private async prepareCharacterForTraining(
    ownerUserId: string,
    characterId: string,
  ): Promise<QuickPlayCharacterStateSnapshot | null> {
    if (!this.characterStateRepo || !this.characterSheetService) return null;
    const state = await this.characterStateRepo.findOne({
      where: { character_id: characterId },
    });
    if (!state) return null;

    const sheet = await this.characterSheetService.computeSheet(
      ownerUserId,
      characterId,
    );
    const snapshot: QuickPlayCharacterStateSnapshot = {
      current_hp: state.current_hp,
      temp_hp: state.temp_hp,
      max_hp_bonus: state.max_hp_bonus,
      death_saves_success: state.death_saves_success,
      death_saves_fail: state.death_saves_fail,
      conditions: [...(state.conditions ?? [])],
      spell_slots_used: { ...(state.spell_slots_used ?? {}) },
      hit_dice_used: { ...(state.hit_dice_used ?? {}) },
      ki_points_used: state.ki_points_used,
      feature_uses_used: { ...(state.feature_uses_used ?? {}) },
      exhaustion_level: state.exhaustion_level,
      inspiration: state.inspiration,
    };

    state.current_hp = sheet.maxHp;
    state.temp_hp = 0;
    state.death_saves_success = 0;
    state.death_saves_fail = 0;
    state.conditions = [];
    state.spell_slots_used = {};
    state.hit_dice_used = {};
    state.ki_points_used = 0;
    state.feature_uses_used = {};
    state.exhaustion_level = 0;
    await this.characterStateRepo.save(state);
    return snapshot;
  }

  private async restorePreparedState(
    characterId: string,
    snapshot: QuickPlayCharacterStateSnapshot,
  ): Promise<void> {
    if (!this.characterStateRepo) return;
    const state = await this.characterStateRepo.findOne({
      where: { character_id: characterId },
    });
    if (!state) return;
    Object.assign(state, snapshot);
    await this.characterStateRepo.save(state);
  }
}
