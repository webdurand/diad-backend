import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { SummonSpawnDto } from "../interfaces/summoning.interfaces";
import { getAbilityModifier } from "src/shared/srd-utils";
import type { GameEventData } from "../interfaces/result.type";

type SummonDismissReason =
  | "player-dismiss"
  | "caster-death"
  | "concentration-broken"
  | "duration-end"
  | "hp-zero";

interface SummonDismissResult {
  removed: boolean;
  events: GameEventData[];
}


@Injectable()
export class SummoningService {
  private readonly logger = new Logger(SummoningService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
  ) {}


  async spawnSummon(
    encounterId: string,
    dto: SummonSpawnDto,
  ): Promise<EncounterParticipantEntity> {
    const caster = await this.participantRepo.findOne({
      where: { id: dto.casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException(
        `caster participant ${dto.casterParticipantId} not found`,
      );
    }
    if (caster.encounterId !== encounterId) {
      throw new BadRequestException(
        "caster participant n\u00e3o pertence a este encounter",
      );
    }
    const monster = await this.monsterRepo.findOne({
      where: { slug: dto.monsterSlug },
    });
    if (!monster) {
      throw new NotFoundException(`monster ${dto.monsterSlug} n\u00e3o existe`);
    }

    const summon = new EncounterParticipantEntity();
    summon.encounterId = encounterId;
    summon.type = "monster";
    summon.monsterId = monster.id;
    summon.monster = monster;
    summon.displayName = dto.displayName ?? monster.name;
    summon.faction = dto.faction ?? caster.faction ?? "ally";
    summon.currentHp = monster.hit_points;
    summon.maxHp = monster.hit_points;
    summon.tempHp = 0;
    summon.initiativeModifier = getAbilityModifier(
      Number((monster as any).dexterity ?? 10),
    );
    summon.initiativeRoll = undefined;
    summon.initiativeTotal = caster.initiativeTotal ?? 0;
    summon.positionX = dto.position?.x ?? caster.positionX ?? 0;
    summon.positionY = dto.position?.y ?? caster.positionY ?? 0;
    summon.isVisible = true;
    summon.isDefeated = false;
    summon.dyingState = "none";
    summon.actionUsed = false;
    summon.bonusActionUsed = false;
    summon.hasDashed = false;
    summon.hasDisengaged = false;
    summon.reactionsUsed = 0;
    summon.conditions = [];
    summon.conditionInstances = [];
    summon.appliedEffects = [];
    summon.effectInstances = [];
    summon.spellSlotsUsed = {};
    summon.rechargeState = {};
    summon.legendaryActionsUsed = 0;
    summon.freeObjectInteractionsUsed = 0;
    summon.attacksUsedThisTurn = 0;
    summon.attacksMaxThisTurn = 1;
    summon.recklessAttackActive = false;
    summon.cleaveUsedThisTurn = false;
    summon.nickUsedThisTurn = false;
    summon.sneakAttackUsedThisTurn = false;
    summon.tacticalMasterOverride = null;
    summon.inspirationArmed = false;
    summon.superiorityDiceUsed = 0;
    summon.relentlessRageUsesUsed = 0;
    summon.sorceryPointsUsed = 0;
    summon.sorcerousRestorationUsed = false;
    summon.indomitableArmed = false;
    summon.dodgingUntilTurnOfParticipantId = null;
    summon.helpingAllyParticipantId = null;
    summon.helpingTargetParticipantId = null;
    summon.helpingUntilTurnOfParticipantId = null;
    summon.readiedAction = null;
    summon.lastAiTurnRound = null;
    summon.lastAiTurnResult = null;
    summon.controlledBy = this.resolveControlledBy(caster, dto);
    summon.concentrationRoundsRemaining = null;
    summon.concentrationSaveDc = null;
    summon.isConcentrating = false;
    summon.grappledByParticipantId = null;
    summon.transformationState = null;
    summon.linkedCasterParticipantId = caster.id;

    const saved = await this.participantRepo.save(summon);
    await this.addSummonToTurnOrder(encounterId, caster, saved, dto);
    if (dto.concentrationLinked) {
      await this.trackConcentrationSummon(caster, saved, dto);
    }
    this.logger.log(
      `[summoning] ${dto.source} \u2192 ${monster.name} (id=${saved.id}, caster=${caster.id}, faction=${summon.faction})`,
    );
    return saved;
  }


  async dismissSummon(
    summonParticipantId: string,
    reason: SummonDismissReason,
  ): Promise<SummonDismissResult> {
    const summon = await this.participantRepo.findOne({
      where: { id: summonParticipantId },
    });
    if (!summon || !summon.linkedCasterParticipantId) {
      return { removed: false, events: [] };
    }
    await this.removeSummonFromTurnOrder(summon);
    await this.participantRepo.remove(summon);
    this.logger.log(
      `[summoning] dismissed ${summonParticipantId} (reason=${reason})`,
    );
    return {
      removed: true,
      events: [
        {
          event_type: "summon_dismissed",
          target_participant_id: summon.id,
          actor_participant_id: summon.linkedCasterParticipantId,
          data: {
            reason,
            summonId: summon.id,
            displayName: summon.displayName,
          },
        },
      ],
    };
  }


  async getSummonsOf(
    casterParticipantId: string,
  ): Promise<EncounterParticipantEntity[]> {
    return this.participantRepo.find({
      where: { linkedCasterParticipantId: casterParticipantId },
    });
  }


  async dismissAllOfCaster(
    casterParticipantId: string,
    reason: "caster-death" | "concentration-broken",
  ): Promise<number> {
    const summons = await this.getSummonsOf(casterParticipantId);
    await Promise.all(summons.map((s) => this.dismissSummon(s.id, reason)));
    return summons.length;
  }

  private resolveControlledBy(
    caster: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): "pc" | "ai" | "dm" {
    if (dto.controlMode === "ai-controlled") return "ai";
    return caster.controlledBy ?? "pc";
  }

  private async addSummonToTurnOrder(
    encounterId: string,
    caster: EncounterParticipantEntity,
    summon: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): Promise<void> {
    const controlMode = dto.controlMode ?? "own-initiative";
    if (controlMode === "shared-turn") return;

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") return;

    encounter.turnOrder = encounter.turnOrder ?? [];
    if (encounter.turnOrder.includes(summon.id)) return;

    const casterIndex = encounter.turnOrder.indexOf(caster.id);
    const insertIndex =
      casterIndex >= 0 ? casterIndex + 1 : encounter.currentTurnIndex + 1;
    const boundedIndex = Math.max(
      0,
      Math.min(insertIndex, encounter.turnOrder.length),
    );

    if (boundedIndex <= encounter.currentTurnIndex) {
      encounter.currentTurnIndex += 1;
    }
    encounter.turnOrder.splice(boundedIndex, 0, summon.id);
    await this.encounterRepo.save(encounter);
  }

  private async removeSummonFromTurnOrder(
    summon: EncounterParticipantEntity,
  ): Promise<void> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: summon.encounterId },
    });
    if (!encounter || !Array.isArray(encounter.turnOrder)) return;

    const removeIndex = encounter.turnOrder.indexOf(summon.id);
    if (removeIndex < 0) return;

    encounter.turnOrder = encounter.turnOrder.filter((id) => id !== summon.id);
    if (removeIndex < encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.max(0, encounter.currentTurnIndex - 1);
    } else if (removeIndex === encounter.currentTurnIndex) {
      encounter.currentTurnIndex = Math.min(
        encounter.currentTurnIndex,
        Math.max(0, encounter.turnOrder.length - 1),
      );
    }
    await this.encounterRepo.save(encounter);
  }

  private async trackConcentrationSummon(
    caster: EncounterParticipantEntity,
    summon: EncounterParticipantEntity,
    dto: SummonSpawnDto,
  ): Promise<void> {
    caster.appliedEffects = [
      ...(caster.appliedEffects ?? []),
      {
        kind: "summon",
        refId: summon.id,
        targetParticipantId: summon.id,
        description: `${dto.source}:${summon.displayName}`,
        metadata: {
          source: dto.source,
          concentrationBreakBehavior:
            dto.concentrationBreakBehavior ?? "dismiss",
        },
      },
    ];
    await this.participantRepo.save(caster);
  }
}
