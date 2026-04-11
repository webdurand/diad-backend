import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { MonsterEntity } from 'src/entities/monster.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { InventoryService } from 'src/models/characters/services/inventory.service';
import { DiceService } from './dice.service';
import { EventService } from './event.service';
import { SessionService } from './session.service';
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
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    private readonly diceService: DiceService,
    private readonly eventService: EventService,
    private readonly sessionService: SessionService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(
    sessionId: string,
    dto: CreateEncounterDto,
  ): Promise<EncounterEntity> {
    const encounter = this.encounterRepo.create({
      sessionId,
      name: dto.name,
      status: 'preparing',
    });
    return this.encounterRepo.save(encounter);
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
    return encounter;
  }

  async listBySession(sessionId: string): Promise<EncounterEntity[]> {
    return this.encounterRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
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
    const sheet = await this.sheetService.computeSheet(userId, characterId);

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

  async rollAllInitiative(
    encounterId: string,
  ): Promise<InitiativeRollResult[]> {
    const encounter = await this.getById(encounterId);
    const participants = encounter.participants ?? [];

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
    p.positionX = x;
    p.positionY = y;
    return this.participantRepo.save(p);
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
}
