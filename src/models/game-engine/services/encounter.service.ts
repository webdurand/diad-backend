import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { MonsterEntity } from 'src/entities/monster.entity';
import { CharacterEntity } from 'src/entities/character.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { InventoryService } from 'src/models/characters/services/inventory.service';
import { DiceService } from './dice.service';
import { EventService } from './event.service';
import { SessionService } from './session.service';
import { CampaignService } from 'src/models/world/services/campaign.service';
import { getAbilityModifier } from 'src/shared/srd-utils';
import { XP_THRESHOLDS } from 'src/shared/srd-constants';
import { EquipmentSourceEnum } from 'src/entities/enums';

export interface CreateEncounterDto {
  name: string;
}

export interface ResolveEncounterDto {
  outcome: 'victory' | 'retreat' | 'negotiation' | 'defeat';
  xpRewards: Array<{ characterId: string; xp: number }>;
  goldRewards: Array<{ characterId: string; gp: number }>;
  itemRewards: Array<{ characterId: string; equipmentId?: string; magicItemId?: string }>;
  ownerUserId: string;
}

export interface AddMonsterDto {
  monsterId: string;
  count: number;
  displayNamePrefix?: string;
  hpOverride?: number;
}

export interface BatchPositionDto {
  participantId: string;
  x: number;
  y: number;
}

export interface InitiativeRollResult {
  participantId: string;
  displayName: string;
  roll: number;
  modifier: number;
  total: number;
}

export interface EncounterDifficulty {
  totalMonsterXp: number;
  adjustedXp: number;
  threshold: 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
  partySize: number;
  partyAverageLevel: number;
}

@Injectable()
export class EncounterService {
  private readonly logger = new Logger(EncounterService.name);

  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    private readonly diceService: DiceService,
    private readonly eventService: EventService,
    private readonly sessionService: SessionService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly inventoryService: InventoryService,
    private readonly campaignService: CampaignService,
  ) {}

  async create(
    sessionId: string,
    dto: CreateEncounterDto,
    ownerUserId?: string,
  ): Promise<EncounterEntity> {
    const encounter = this.encounterRepo.create({
      sessionId,
      name: dto.name,
      status: 'preparing',
    });
    const saved = await this.encounterRepo.save(encounter);

    if (ownerUserId) {
      const session = await this.sessionService.getById(sessionId);
      const charIds = new Set<string>();

      // 1. Add PCs explicitly added to the session
      for (const charId of session.characterIds ?? []) {
        charIds.add(charId);
      }

      // 2. Add PCs from campaign players (their chosen characters)
      if (session.campaignId) {
        try {
          const players = await this.campaignService.getPlayers(session.campaignId);
          for (const player of players) {
            if (player.characterId) {
              charIds.add(player.characterId);
            }
          }
        } catch {}
      }

      // Add all unique characters with their respective owner IDs.
      // Iterate in deterministic order for snapshot stability.
      const orderedIds = Array.from(charIds).sort();
      for (const charId of orderedIds) {
        const userId = await this.resolveCharacterOwner(
          charId,
          ownerUserId,
          session.campaignId ?? undefined,
        );
        try {
          await this.addCharacter(saved.id, charId, userId);
        } catch (err) {
          // Don't block the encounter creation if a single PC fails
          // (e.g. orphan characterId in session, sheet compute error).
          // Log + continue — the DM can add manually later.
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `auto-include skipped character=${charId} on encounter=${saved.id}: ${msg}`,
          );
        }
      }
    }

    return this.getById(saved.id);
  }

  /**
   * Resolves the owning userId of a character. Lookup order:
   *  1. CampaignPlayer with this characterId (when campaignId is given)
   *  2. CharacterEntity.userId direct DB lookup
   *  3. fallbackUserId (caller — typically the DM)
   */
  async resolveCharacterOwner(
    characterId: string,
    fallbackUserId: string,
    campaignId?: string,
  ): Promise<string> {
    if (campaignId) {
      try {
        const players = await this.campaignService.getPlayers(campaignId);
        const owner = players.find((p) => p.characterId === characterId);
        if (owner?.userId) return owner.userId;
      } catch {
        // fall through to direct lookup
      }
    }
    const character = await this.characterRepo.findOne({
      where: { id: characterId },
      select: ['id', 'userId'],
    });
    if (character?.userId) return character.userId;
    return fallbackUserId;
  }

  async getById(
    encounterId: string,
  ): Promise<EncounterEntity> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
      relations: ['participants'],
    });
    if (!encounter)
      throw new NotFoundException('Encontro nao encontrado.');
    await this.enrichPcHp(encounter);
    return encounter;
  }

  private async enrichPcHp(encounter: EncounterEntity): Promise<void> {
    const session = await this.sessionService.getById(encounter.sessionId).catch(() => null);
    const campaignId = session?.campaignId ?? undefined;
    for (const p of encounter.participants ?? []) {
      if (p.type !== 'pc' || !p.characterId) continue;
      const ownerId = await this.resolveCharacterOwner(p.characterId, '', campaignId);
      if (!ownerId) continue;
      try {
        const sheet = await this.sheetService.computeSheet(ownerId, p.characterId);
        (p as any).currentHp = sheet.currentHp;
        (p as any).maxHp = sheet.maxHp;
        (p as any).armorClass = sheet.armorClass;
        // initiativeModifier may already be persisted but keep it in sync with
        // the computed sheet (e.g. after ASI/feat changes).
        if (p.initiativeModifier == null || p.initiativeModifier !== sheet.initiative) {
          (p as any).initiativeModifier = sheet.initiative;
        }
        (p as any).deathSaveSuccesses = sheet.deathSaves?.successes ?? 0;
        (p as any).deathSaveFailures = sheet.deathSaves?.failures ?? 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(
          `enrichPcHp skipped characterId=${p.characterId}: ${msg}`,
        );
      }
    }
  }

  async listBySession(sessionId: string): Promise<EncounterEntity[]> {
    return this.encounterRepo.find({
      where: { sessionId },
      relations: ['participants'],
      order: { createdAt: 'DESC' },
    });
  }

  async listByCampaign(campaignId: string): Promise<EncounterEntity[]> {
    // Find all sessions for this campaign, then all encounters
    const sessions = await this.encounterRepo.manager.find('GameSessionEntity' as any, {
      where: { campaignId },
    } as any);
    const sessionIds = sessions.map((s: any) => s.id);
    if (sessionIds.length === 0) return [];

    return this.encounterRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.participants', 'p')
      .where('e.session_id IN (:...sessionIds)', { sessionIds })
      .orderBy('e.createdAt', 'DESC')
      .getMany();
  }

  async addMonster(
    encounterId: string,
    dto: AddMonsterDto,
  ): Promise<EncounterParticipantEntity[]> {
    const monster = await this.monsterRepo.findOne({
      where: { id: dto.monsterId },
    });
    if (!monster) throw new NotFoundException('Monstro nao encontrado.');

    const existingCount = await this.participantRepo.count({
      where: { encounterId, monsterId: dto.monsterId },
    });

    const prefix = dto.displayNamePrefix ?? monster.name;
    const dexMod = getAbilityModifier(monster.dexterity);

    const participants: EncounterParticipantEntity[] = [];
    for (let i = 0; i < dto.count; i++) {
      const index = existingCount + i + 1;
      const displayName =
        dto.count === 1 && existingCount === 0
          ? prefix
          : `${prefix} ${index}`;

      let hp = dto.hpOverride ?? monster.hit_points;
      if (!dto.hpOverride && monster.hit_points_roll) {
        const rolled = this.diceService.rollExpression(
          monster.hit_points_roll,
        );
        hp = Math.max(1, rolled.total);
      }

      const participant = this.participantRepo.create({
        encounterId,
        type: 'monster',
        monsterId: dto.monsterId,
        displayName,
        initiativeModifier: dexMod,
        currentHp: hp,
        maxHp: hp,
        tempHp: 0,
        conditions: [],
        isDefeated: false,
        faction: 'enemy',
        // Spec 003 FR-018 — monstros default 'dm' (backfill da migration só
        // pega rows existentes; novos precisam explícito).
        controlledBy: 'dm',
      });
      participants.push(participant);
    }

    return this.participantRepo.save(participants);
  }

  async addCharacter(
    encounterId: string,
    characterId: string,
    userId: string,
  ): Promise<EncounterParticipantEntity> {
    const encounter = await this.getById(encounterId);
    const session = await this.sessionService.getById(encounter.sessionId);
    const ownerUserId = await this.resolveCharacterOwner(
      characterId,
      userId,
      session.campaignId ?? undefined,
    );
    const sheet = await this.sheetService.computeSheet(ownerUserId, characterId);

    const participant = this.participantRepo.create({
      encounterId,
      type: 'pc',
      characterId,
      displayName: sheet.name,
      initiativeModifier: sheet.initiative,
      // PCs delegate HP to CharacterStateService — currentHp/maxHp stay undefined
      tempHp: 0,
      conditions: [],
      isDefeated: false,
      faction: 'ally',
    });

    return this.participantRepo.save(participant);
  }

  async removeParticipant(participantId: string): Promise<void> {
    await this.participantRepo.delete(participantId);
  }

  /**
   * Add a participant to an active encounter (late join).
   * Rolls initiative and inserts at the correct position in turnOrder.
   */
  async lateJoinCharacter(
    encounterId: string,
    characterId: string,
    userId: string,
  ): Promise<EncounterParticipantEntity> {
    const encounter = await this.getById(encounterId);
    if (encounter.status !== 'active') {
      throw new Error('Late join so e permitido em encontros ativos.');
    }

    // Add the character
    const participant = await this.addCharacter(encounterId, characterId, userId);

    // Roll initiative
    const mod = participant.initiativeModifier ?? 0;
    const init = this.diceService.rollInitiative(mod);
    participant.initiativeRoll = init.roll;
    participant.initiativeTotal = init.total;
    await this.participantRepo.save(participant);

    // Insert into turnOrder at the correct position (sorted by initiative desc)
    const allParticipants = await this.participantRepo.find({
      where: { encounterId },
    });

    // Find where to insert based on initiative
    let insertIndex = encounter.turnOrder.length;
    for (let i = 0; i < encounter.turnOrder.length; i++) {
      const existing = allParticipants.find((p) => p.id === encounter.turnOrder[i]);
      if (existing && (existing.initiativeTotal ?? 0) < init.total) {
        insertIndex = i;
        break;
      }
    }

    // Adjust currentTurnIndex if inserting before current turn
    if (insertIndex <= encounter.currentTurnIndex) {
      encounter.currentTurnIndex += 1;
    }

    encounter.turnOrder.splice(insertIndex, 0, participant.id);
    await this.encounterRepo.save(encounter);

    return participant;
  }

  async lateJoinMonster(
    encounterId: string,
    dto: AddMonsterDto,
  ): Promise<EncounterParticipantEntity[]> {
    const encounter = await this.getById(encounterId);
    if (encounter.status !== 'active') {
      throw new Error('Late join so e permitido em encontros ativos.');
    }

    const newParticipants = await this.addMonster(encounterId, dto);

    const allParticipants = await this.participantRepo.find({
      where: { encounterId },
    });

    for (const participant of newParticipants) {
      // Roll initiative
      const mod = participant.initiativeModifier ?? 0;
      const init = this.diceService.rollInitiative(mod);
      participant.initiativeRoll = init.roll;
      participant.initiativeTotal = init.total;
      await this.participantRepo.save(participant);

      // Insert into turnOrder
      let insertIndex = encounter.turnOrder.length;
      for (let i = 0; i < encounter.turnOrder.length; i++) {
        const existing = allParticipants.find((p) => p.id === encounter.turnOrder[i]);
        if (existing && (existing.initiativeTotal ?? 0) < init.total) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex <= encounter.currentTurnIndex) {
        encounter.currentTurnIndex += 1;
      }

      encounter.turnOrder.splice(insertIndex, 0, participant.id);
    }

    await this.encounterRepo.save(encounter);
    return newParticipants;
  }

  async deleteEncounter(encounterId: string): Promise<void> {
    const encounter = await this.getById(encounterId);
    // Clear activeEncounterId if this encounter is active
    await this.sessionService.setActiveEncounter(encounter.sessionId, null);
    // Cascade deletes participants via FK
    await this.encounterRepo.delete(encounterId);
  }

  async rollAllInitiative(
    encounterId: string,
  ): Promise<InitiativeRollResult[]> {
    const encounter = await this.getById(encounterId);
    const participants = encounter.participants ?? [];

    const hasPc = participants.some((p) => p.type === 'pc' && !p.isDefeated);
    const hasEnemy = participants.some((p) => p.type === 'monster' && !p.isDefeated);
    if (!hasPc || !hasEnemy) {
      throw new Error(
        'O encontro precisa de pelo menos 1 jogador e 1 monstro para rolar iniciativa.',
      );
    }

    const results: InitiativeRollResult[] = [];

    for (const p of participants) {
      if (p.isDefeated) continue;
      const mod = p.initiativeModifier ?? 0;
      const init = this.diceService.rollInitiative(mod);
      p.initiativeRoll = init.roll;
      p.initiativeTotal = init.total;
      results.push({
        participantId: p.id,
        displayName: p.displayName,
        roll: init.roll,
        modifier: mod,
        total: init.total,
      });
    }

    await this.participantRepo.save(participants);

    await this.encounterRepo.update(encounterId, {
      status: 'rolling_initiative',
    });

    return results;
  }

  async setManualInitiative(
    participantId: string,
    total: number,
  ): Promise<void> {
    await this.participantRepo.update(participantId, {
      initiativeTotal: total,
    });
  }

  async startCombat(encounterId: string): Promise<EncounterEntity> {
    const encounter = await this.getById(encounterId);
    const participants = (encounter.participants ?? []).filter(
      (p) => !p.isDefeated,
    );

    // Sort by initiative descending, DEX mod as tiebreaker
    participants.sort((a, b) => {
      const diff = (b.initiativeTotal ?? 0) - (a.initiativeTotal ?? 0);
      if (diff !== 0) return diff;
      return (b.initiativeModifier ?? 0) - (a.initiativeModifier ?? 0);
    });

    encounter.turnOrder = participants.map((p) => p.id);
    encounter.currentTurnIndex = 0;
    encounter.currentRound = 1;
    encounter.status = 'active';

    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(
      encounter.sessionId,
      encounter.id,
    );

    await this.eventService.emit(encounter.sessionId, encounter.id, [
      {
        event_type: 'encounter_start',
        data: {
          name: encounter.name,
          round: 1,
          turnOrder: encounter.turnOrder,
        },
      },
      {
        event_type: 'turn_start',
        actor_participant_id: encounter.turnOrder[0],
        data: { round: 1 },
      },
    ]);

    return this.getById(encounterId);
  }

  async endEncounter(
    encounterId: string,
  ): Promise<{ totalXp: number; xpPerCharacter: number }> {
    const encounter = await this.getById(encounterId);
    const participants = encounter.participants ?? [];

    const monsters = participants.filter((p) => p.type === 'monster');
    const pcs = participants.filter(
      (p) => p.type === 'pc' && !p.isDefeated,
    );

    let totalXp = 0;
    for (const m of monsters) {
      if (m.monster) {
        totalXp += m.monster.xp ?? 0;
      }
    }

    const xpPerCharacter = pcs.length > 0 ? Math.floor(totalXp / pcs.length) : 0;

    encounter.status = 'completed';
    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(
      encounter.sessionId,
      null,
    );

    await this.eventService.emit(encounter.sessionId, encounterId, [
      {
        event_type: 'encounter_end',
        data: {
          name: encounter.name,
          totalXp,
          xpPerCharacter,
          monstersDefeated: monsters.filter((m) => m.isDefeated).length,
        },
      },
    ]);

    return { totalXp, xpPerCharacter };
  }

  async calculateDifficulty(
    encounterId: string,
    partyLevels: number[],
  ): Promise<EncounterDifficulty> {
    const encounter = await this.getById(encounterId);
    const monsters = (encounter.participants ?? []).filter(
      (p) => p.type === 'monster' && p.monster,
    );

    let totalXp = 0;
    for (const m of monsters) {
      totalXp += m.monster?.xp ?? 0;
    }

    // DMG multiplier based on monster count
    const monsterCount = monsters.length;
    let multiplier = 1;
    if (monsterCount === 2) multiplier = 1.5;
    else if (monsterCount >= 3 && monsterCount <= 6) multiplier = 2;
    else if (monsterCount >= 7 && monsterCount <= 10) multiplier = 2.5;
    else if (monsterCount >= 11 && monsterCount <= 14) multiplier = 3;
    else if (monsterCount >= 15) multiplier = 4;

    const adjustedXp = Math.floor(totalXp * multiplier);

    const partySize = partyLevels.length;
    const avgLevel =
      partySize > 0
        ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partySize)
        : 1;

    // DMG XP thresholds per character level
    const thresholds: Record<string, number[]> = {
      easy: [25, 50, 75, 125, 250, 300, 350, 450, 550, 600, 800, 1000, 1100, 1250, 1400, 1600, 2000, 2100, 2400, 2800],
      medium: [50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500, 2800, 3200, 3900, 4200, 4900, 5700],
      hard: [75, 150, 225, 375, 750, 900, 1100, 1400, 1600, 1900, 2400, 3000, 3400, 3800, 4300, 4800, 5900, 6300, 7300, 8500],
      deadly: [100, 200, 400, 500, 1100, 1400, 1700, 2100, 2400, 2800, 3600, 4500, 5100, 5700, 6400, 7200, 8800, 9500, 10900, 12700],
    };

    const getThreshold = (level: number, tier: string) =>
      thresholds[tier]?.[Math.min(level, 20) - 1] ?? 0;

    const partyEasy = partyLevels.reduce((s, l) => s + getThreshold(l, 'easy'), 0);
    const partyMedium = partyLevels.reduce((s, l) => s + getThreshold(l, 'medium'), 0);
    const partyHard = partyLevels.reduce((s, l) => s + getThreshold(l, 'hard'), 0);
    const partyDeadly = partyLevels.reduce((s, l) => s + getThreshold(l, 'deadly'), 0);

    let threshold: EncounterDifficulty['threshold'] = 'trivial';
    if (adjustedXp >= partyDeadly) threshold = 'deadly';
    else if (adjustedXp >= partyHard) threshold = 'hard';
    else if (adjustedXp >= partyMedium) threshold = 'medium';
    else if (adjustedXp >= partyEasy) threshold = 'easy';

    return {
      totalMonsterXp: totalXp,
      adjustedXp,
      threshold,
      partySize,
      partyAverageLevel: avgLevel,
    };
  }

  async resolveEncounter(
    encounterId: string,
    dto: ResolveEncounterDto,
  ): Promise<{
    xpApplied: Array<{ characterId: string; xp: number; newTotal: number; levelUpAvailable: boolean }>;
    goldApplied: Array<{ characterId: string; gp: number }>;
    itemsApplied: Array<{ characterId: string; itemName: string }>;
  }> {
    const encounter = await this.getById(encounterId);

    // Apply XP
    const xpApplied: Array<{ characterId: string; xp: number; newTotal: number; levelUpAvailable: boolean }> = [];
    for (const reward of dto.xpRewards) {
      if (reward.xp <= 0) continue;
      try {
        const result = await this.stateService.updateXp(
          dto.ownerUserId,
          reward.characterId,
          { amount: reward.xp },
        );
        xpApplied.push({
          characterId: reward.characterId,
          xp: reward.xp,
          newTotal: result.xp,
          levelUpAvailable: result.levelUpAvailable,
        });
      } catch {}
    }

    // Apply Gold
    const goldApplied: Array<{ characterId: string; gp: number }> = [];
    for (const reward of dto.goldRewards) {
      if (reward.gp <= 0) continue;
      try {
        await this.inventoryService.updateGold(
          dto.ownerUserId,
          reward.characterId,
          { gp: reward.gp },
        );
        goldApplied.push({ characterId: reward.characterId, gp: reward.gp });
      } catch {}
    }

    // Apply Items
    const itemsApplied: Array<{ characterId: string; itemName: string }> = [];
    for (const reward of dto.itemRewards) {
      try {
        if (reward.equipmentId) {
          const result = await this.inventoryService.addItem(
            dto.ownerUserId,
            reward.characterId,
            { equipmentId: reward.equipmentId, source: EquipmentSourceEnum.Loot },
          );
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: (result as any).equipment?.name ?? 'Item',
          });
        }
        if (reward.magicItemId) {
          await this.inventoryService.addMagicItem(
            dto.ownerUserId,
            reward.characterId,
            { magicItemId: reward.magicItemId },
          );
          itemsApplied.push({
            characterId: reward.characterId,
            itemName: 'Magic Item',
          });
        }
      } catch {}
    }

    // Mark encounter as completed
    encounter.status = 'completed';
    await this.encounterRepo.save(encounter);
    await this.sessionService.setActiveEncounter(encounter.sessionId, null);

    // Emit event
    await this.eventService.emit(encounter.sessionId, encounterId, [
      {
        event_type: 'encounter_end',
        data: {
          name: encounter.name,
          outcome: dto.outcome,
          xpApplied,
          goldApplied,
          itemsApplied,
        },
      },
    ]);

    return { xpApplied, goldApplied, itemsApplied };
  }

  async updateMapData(
    encounterId: string,
    mapData: Partial<EncounterEntity['mapData']>,
  ): Promise<EncounterEntity> {
    const encounter = await this.getById(encounterId);
    encounter.mapData = { ...encounter.mapData, ...mapData };
    return this.encounterRepo.save(encounter);
  }

  async updateParticipantPosition(
    participantId: string,
    x: number,
    y: number,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.getParticipant(participantId);
    const encounter = await this.getById(p.encounterId);

    this.validatePositionBounds(x, y, encounter);
    await this.validatePositionNotOccupied(p.encounterId, x, y, participantId);

    p.positionX = x;
    p.positionY = y;
    return this.participantRepo.save(p);
  }

  async batchUpdatePositions(
    encounterId: string,
    positions: BatchPositionDto[],
  ): Promise<EncounterParticipantEntity[]> {
    const encounter = await this.getById(encounterId);

    // Validate all positions are in bounds
    for (const pos of positions) {
      this.validatePositionBounds(pos.x, pos.y, encounter);
    }

    // Check for duplicates within the batch itself
    const cellKeys = new Set<string>();
    for (const pos of positions) {
      const key = `${pos.x},${pos.y}`;
      if (cellKeys.has(key)) {
        throw new Error(
          `Posicao duplicada no batch: (${pos.x}, ${pos.y}).`,
        );
      }
      cellKeys.add(key);
    }

    // Check against existing positioned participants not in this batch
    const batchIds = new Set(positions.map((p) => p.participantId));
    const existingParticipants = await this.participantRepo.find({
      where: { encounterId },
    });
    for (const existing of existingParticipants) {
      if (batchIds.has(existing.id)) continue;
      if (existing.isDefeated) continue;
      if (existing.positionX == null || existing.positionY == null) continue;
      const key = `${existing.positionX},${existing.positionY}`;
      if (cellKeys.has(key)) {
        throw new Error(
          `Posicao (${existing.positionX}, ${existing.positionY}) ja ocupada por ${existing.displayName}.`,
        );
      }
    }

    // Apply all positions
    const updated: EncounterParticipantEntity[] = [];
    for (const pos of positions) {
      const p = existingParticipants.find((pp) => pp.id === pos.participantId);
      if (!p) continue;
      p.positionX = pos.x;
      p.positionY = pos.y;
      updated.push(p);
    }

    return this.participantRepo.save(updated);
  }

  // --- Position Validation Helpers ---

  private validatePositionBounds(
    x: number,
    y: number,
    encounter: EncounterEntity,
  ): void {
    const gridColumns = encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows = encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;

    if (x < 0 || x >= gridColumns || y < 0 || y >= gridRows) {
      throw new Error(
        `Posicao (${x}, ${y}) fora dos limites do grid (${gridColumns}x${gridRows}).`,
      );
    }
  }

  private async validatePositionNotOccupied(
    encounterId: string,
    x: number,
    y: number,
    excludeParticipantId?: string,
  ): Promise<void> {
    const qb = this.participantRepo
      .createQueryBuilder('p')
      .where('p.encounter_id = :encounterId', { encounterId })
      .andWhere('p.position_x = :x', { x })
      .andWhere('p.position_y = :y', { y })
      .andWhere('p.is_defeated = false');

    if (excludeParticipantId) {
      qb.andWhere('p.id != :excludeId', { excludeId: excludeParticipantId });
    }

    const occupant = await qb.getOne();
    if (occupant) {
      throw new Error(
        `Posicao (${x}, ${y}) ja ocupada por ${occupant.displayName}.`,
      );
    }
  }

  async updateParticipantVisibility(
    participantId: string,
    visible: boolean,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.getParticipant(participantId);
    p.isVisible = visible;
    return this.participantRepo.save(p);
  }

  async getParticipant(
    participantId: string,
  ): Promise<EncounterParticipantEntity> {
    const p = await this.participantRepo.findOne({
      where: { id: participantId },
      relations: ['monster'],
    });
    if (!p) throw new NotFoundException('Participante nao encontrado.');
    return p;
  }

  /**
   * Spec 003 T062 — DM altera `controlledBy` do participante.
   * Apenas DM da sessão tem permissão (CONTROL_CHANGE_FORBIDDEN).
   * Retorna {previousMode, newMode, effectiveFrom} para o frontend decidir
   * quando a mudança vale (imediato vs próximo turno).
   */
  async updateControlMode(
    encounterId: string,
    participantId: string,
    mode: 'human' | 'ai' | 'dm',
    authUserId: string,
  ): Promise<{
    participantId: string;
    previousMode: 'human' | 'ai' | 'dm';
    newMode: 'human' | 'ai' | 'dm';
    effectiveFrom: 'immediate' | 'next_turn_of_participant';
  }> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) throw new NotFoundException('Encontro nao encontrado.');

    // Permissão: DM da sessão
    const session = await this.sessionService.getById(encounter.sessionId);
    if (!session) throw new NotFoundException('Sessao nao encontrada.');
    if (session.ownerId !== authUserId) {
      throw new ForbiddenException(
        'Apenas o DM da sessao pode alterar o controle de um participante.',
      );
    }

    const participant = await this.getParticipant(participantId);
    const previousMode = participant.controlledBy ?? 'human';

    if (previousMode === mode) {
      return {
        participantId,
        previousMode,
        newMode: mode,
        effectiveFrom: 'immediate',
      };
    }

    const isActiveTurn =
      encounter.turnOrder[encounter.currentTurnIndex] === participant.id;
    participant.controlledBy = mode;
    await this.participantRepo.save(participant);

    await this.eventService.emit(encounter.sessionId, encounter.id, [
      {
        event_type: 'control_changed',
        actor_participant_id: participant.id,
        data: {
          previousMode,
          newMode: mode,
          actorUserId: authUserId,
        },
      },
    ]);

    return {
      participantId,
      previousMode,
      newMode: mode,
      effectiveFrom: isActiveTurn
        ? 'next_turn_of_participant'
        : 'immediate',
    };
  }
}
