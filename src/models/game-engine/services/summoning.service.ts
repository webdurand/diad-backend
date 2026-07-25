import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { SummonSpawnDto } from "../interfaces/summoning.interfaces";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  failure,
  success,
  type GameEventData,
  type GameResult,
} from "../interfaces/result.type";
import { chebyshevDistanceFt } from "./combat-range";
import { getSummonMetadata, isFindFamiliarSummon } from "./summon-stat-block";

type SummonDismissReason =
  | "player-dismiss"
  | "form-change"
  | "caster-death"
  | "concentration-broken"
  | "duration-end"
  | "hp-zero";

interface SummonDismissResult {
  removed: boolean;
  events: GameEventData[];
}

export interface FamiliarActionResult {
  casterParticipantId: string;
  familiarParticipantId: string;
  familiarName: string;
  pocketed: boolean;
  position?: { x: number; y: number };
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
    const spawnPosition = await this.resolveSpawnPosition(
      encounterId,
      caster,
      dto.position,
    );
    summon.encounterId = encounterId;
    summon.type = "monster";
    summon.monsterId = monster.id;
    summon.monster = monster;
    summon.displayName = dto.displayName ?? monster.name;
    summon.faction = dto.faction ?? caster.faction ?? "ally";
    summon.currentHp = dto.statBlock?.maxHp ?? monster.hit_points;
    summon.maxHp = dto.statBlock?.maxHp ?? monster.hit_points;
    summon.tempHp = 0;
    summon.initiativeModifier = getAbilityModifier(
      Number((monster as any).dexterity ?? 10),
    );
    summon.initiativeRoll = undefined;
    summon.initiativeTotal = caster.initiativeTotal ?? 0;
    summon.positionX = spawnPosition.x;
    summon.positionY = spawnPosition.y;
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
    summon.appliedEffects = [
      {
        kind: "summon",
        refId: dto.source,
        targetParticipantId: summon.id ?? null,
        description: dto.statBlock
          ? `${dto.statBlock.kind}:${dto.statBlock.form}`
          : dto.source,
        metadata: {
          source: dto.source,
          ...(dto.metadata ?? {}),
          ...(dto.statBlock ? { statBlock: dto.statBlock } : {}),
        },
      },
    ];
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

  private async resolveSpawnPosition(
    encounterId: string,
    caster: EncounterParticipantEntity,
    requested?: { x: number; y: number },
  ): Promise<{ x: number; y: number }> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) {
      throw new NotFoundException(`encounter ${encounterId} not found`);
    }

    const gridColumns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const gridRows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    const occupied = new Set(
      [...participants, caster]
        .filter(
          (participant) =>
            !participant.isDefeated &&
            participant.positionX != null &&
            participant.positionY != null,
        )
        .map(
          (participant) =>
            `${participant.positionX as number},${participant.positionY as number}`,
        ),
    );
    const origin = {
      x: caster.positionX ?? 0,
      y: caster.positionY ?? 0,
    };
    const preferred = requested ?? { x: origin.x + 1, y: origin.y };
    const isAvailable = (x: number, y: number) =>
      x >= 0 &&
      x < gridColumns &&
      y >= 0 &&
      y < gridRows &&
      !occupied.has(`${x},${y}`);

    if (isAvailable(preferred.x, preferred.y)) return preferred;

    const maxRadius = Math.max(gridColumns, gridRows);
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (let y = origin.y - radius; y <= origin.y + radius; y++) {
        for (let x = origin.x - radius; x <= origin.x + radius; x++) {
          if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) !== radius)
            continue;
          if (isAvailable(x, y)) return { x, y };
        }
      }
    }

    throw new BadRequestException(
      "Não há uma célula livre no mapa para materializar a invocação.",
    );
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

  async getFindFamiliarOf(
    casterParticipantId: string,
  ): Promise<EncounterParticipantEntity | null> {
    const summons = await this.getSummonsOf(casterParticipantId);
    return summons.find((candidate) => isFindFamiliarSummon(candidate)) ?? null;
  }

  async shareFamiliarSenses(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { caster, familiar } = context;
    if (
      !familiar.isVisible ||
      familiar.isDefeated ||
      getSummonMetadata(familiar)?.pocketed === true
    ) {
      return failure(
        "O familiar precisa estar presente para compartilhar os sentidos.",
        "INVALID_ACTION",
      );
    }
    if (
      caster.positionX == null ||
      caster.positionY == null ||
      familiar.positionX == null ||
      familiar.positionY == null
    ) {
      return failure(
        "O familiar precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x: familiar.positionX, y: familiar.positionY },
    );
    if (distanceFt > 100) {
      return failure(
        `O familiar está fora do alcance telepático (${distanceFt}ft > 100ft).`,
        "OUT_OF_RANGE",
      );
    }

    caster.effectInstances = (caster.effectInstances ?? []).filter(
      (effect) =>
        !(
          effect.kind === "familiar_shared_senses" &&
          effect.sourceCasterParticipantId === caster.id
        ),
    );
    const effect = {
      id: randomUUID(),
      sourceSpellSlug: "find-familiar",
      sourceCasterParticipantId: caster.id,
      kind: "familiar_shared_senses" as const,
      payload: {
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
      },
      expiresAt: { kind: "until_caster_turn" as const },
      requiresConcentration: false,
      appliedAt: new Date().toISOString(),
    };
    caster.effectInstances = [...caster.effectInstances, effect];
    caster.actionUsed = true;
    await this.participantRepo.save(caster);

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: false,
        position: { x: familiar.positionX, y: familiar.positionY },
      },
      [
        {
          event_type: "effect_applied",
          actor_participant_id: caster.id,
          target_participant_id: caster.id,
          data: {
            effectId: effect.id,
            kind: effect.kind,
            sourceSpellSlug: "find-familiar",
            payload: effect.payload,
            expiresAt: effect.expiresAt,
            requiresConcentration: false,
          },
        },
        {
          event_type: "familiar_senses_shared",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            distanceFt,
            expiresAt: "start_of_caster_next_turn",
          },
        },
      ],
    );
  }

  async pocketFindFamiliar(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { caster, familiar } = context;
    if (
      !familiar.isVisible ||
      getSummonMetadata(familiar)?.pocketed === true
    ) {
      return failure(
        "O familiar já está no bolsão dimensional.",
        "INVALID_ACTION",
      );
    }

    const previousPosition =
      familiar.positionX != null && familiar.positionY != null
        ? { x: familiar.positionX, y: familiar.positionY }
        : undefined;
    this.setFamiliarPocketed(familiar, true);
    familiar.isVisible = false;
    familiar.positionX = null;
    familiar.positionY = null;
    caster.actionUsed = true;
    await this.participantRepo.save([caster, familiar]);
    await this.removeSummonFromTurnOrder(familiar);

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: true,
      },
      [
        {
          event_type: "familiar_pocketed",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            previousPosition,
          },
        },
      ],
    );
  }

  async reappearFindFamiliar(
    encounterId: string,
    casterParticipantId: string,
    position: { x: number; y: number },
  ): Promise<GameResult<FamiliarActionResult>> {
    const context = await this.getFamiliarActionContext(
      encounterId,
      casterParticipantId,
    );
    if (!context.ok) return context.result;
    const { encounter, caster, familiar } = context;
    if (getSummonMetadata(familiar)?.pocketed !== true) {
      return failure(
        "O familiar já está presente no plano atual.",
        "INVALID_ACTION",
      );
    }
    if (caster.positionX == null || caster.positionY == null) {
      return failure(
        "O conjurador precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }

    const x = Math.trunc(position.x);
    const y = Math.trunc(position.y);
    const columns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const rows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (x < 0 || y < 0 || x >= columns || y >= rows) {
      return failure(
        "Escolha um espaço dentro do mapa.",
        "POSITION_OUT_OF_BOUNDS",
      );
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x, y },
    );
    if (distanceFt > 30) {
      return failure(
        `O familiar só pode reaparecer a até 30 pés (${distanceFt}ft).`,
        "OUT_OF_RANGE",
      );
    }
    const occupant = await this.participantRepo.findOne({
      where: {
        encounterId,
        positionX: x,
        positionY: y,
        isDefeated: false,
      },
    });
    if (occupant) {
      return failure(
        `O espaço está ocupado por ${occupant.displayName}.`,
        "POSITION_OCCUPIED",
      );
    }

    this.setFamiliarPocketed(familiar, false);
    familiar.isVisible = true;
    familiar.positionX = x;
    familiar.positionY = y;
    familiar.reactionsUsed = 0;
    caster.actionUsed = true;
    await this.participantRepo.save([caster, familiar]);
    await this.addSummonToTurnOrder(encounterId, caster, familiar, {
      casterParticipantId: caster.id,
      monsterSlug: familiar.monster?.slug ?? "familiar",
      source: "find-familiar-spell",
      controlMode: "own-initiative",
    });

    return success(
      {
        casterParticipantId: caster.id,
        familiarParticipantId: familiar.id,
        familiarName: familiar.displayName,
        pocketed: false,
        position: { x, y },
      },
      [
        {
          event_type: "familiar_reappeared",
          actor_participant_id: caster.id,
          target_participant_id: familiar.id,
          data: {
            familiarName: familiar.displayName,
            position: { x, y },
            distanceFt,
          },
        },
      ],
    );
  }


  async dismissAllOfCaster(
    casterParticipantId: string,
    reason: "caster-death" | "concentration-broken",
  ): Promise<number> {
    const summons = await this.getSummonsOf(casterParticipantId);
    await Promise.all(summons.map((s) => this.dismissSummon(s.id, reason)));
    return summons.length;
  }

  private async getFamiliarActionContext(
    encounterId: string,
    casterParticipantId: string,
  ): Promise<
    | {
        ok: true;
        encounter: EncounterEntity;
        caster: EncounterParticipantEntity;
        familiar: EncounterParticipantEntity;
      }
    | { ok: false; result: GameResult<FamiliarActionResult> }
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return {
        ok: false,
        result: failure("Encontro não está ativo.", "ENCOUNTER_NOT_ACTIVE"),
      };
    }
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId, encounterId },
    });
    if (!caster) {
      return {
        ok: false,
        result: failure(
          "Conjurador não encontrado no encontro.",
          "PARTICIPANT_NOT_FOUND",
        ),
      };
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== caster.id) {
      return {
        ok: false,
        result: failure(
          "Não é o turno deste participante.",
          "NOT_YOUR_TURN",
        ),
      };
    }
    if (caster.actionUsed) {
      return {
        ok: false,
        result: failure(
          "Ação já utilizada neste turno.",
          "NO_ACTION_AVAILABLE",
        ),
      };
    }
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
          "haste_lethargy",
          "hypnotized",
        ].includes(condition),
      )
    ) {
      return {
        ok: false,
        result: failure(
          "Uma condição impede o conjurador de usar ações.",
          "CONDITION_PREVENTS_ACTION",
        ),
      };
    }
    const familiar = await this.getFindFamiliarOf(caster.id);
    if (!familiar || familiar.encounterId !== encounterId) {
      return {
        ok: false,
        result: failure(
          "Nenhum familiar vinculado está disponível.",
          "INVALID_ACTION",
        ),
      };
    }
    return { ok: true, encounter, caster, familiar };
  }

  private setFamiliarPocketed(
    familiar: EncounterParticipantEntity,
    pocketed: boolean,
  ): void {
    familiar.appliedEffects = (familiar.appliedEffects ?? []).map((effect) =>
      effect.kind === "summon"
        ? {
            ...effect,
            metadata: {
              ...(effect.metadata ?? {}),
              pocketed,
            },
          }
        : effect,
    );
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
