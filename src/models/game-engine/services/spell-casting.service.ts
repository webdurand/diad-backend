import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SpellEntity } from "src/entities/spell.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameEventEntity } from "src/entities/game-event.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { SpellService } from "src/models/characters/services/spell.service";
import { DiceService } from "./dice.service";
import { SavingThrowService } from "./saving-throw.service";
import { hasHasteDexSaveAdvantage } from "./haste-action";
import {
  CombatService,
  type SavingThrowDamageContext,
} from "./combat.service";
import { EncounterService } from "./encounter.service";
import { MonsterSpellcastingService } from "./monster-spellcasting.service";
import {
  GameResult,
  GameEventData,
  GameErrorCode,
  success,
  failure,
} from "../interfaces/result.type";
import {
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
  getAoeShape,
  cellInAoe,
  cellInSelfOriginAoe,
  getPerHitDamage,
  repeatsFirstTargetToMaximum,
} from "./spell-targeting";
import { parseRangeString, chebyshevDistanceFt } from "./combat-range";
import { getSpellEffectiveRange } from "./spell-effective-range";
import { EffectInstanceService } from "./effect-instance.service";
import {
  materializeSpellEffects,
  checkSpellPreconditions,
  type TargetMetadata,
} from "./spell-effect-catalog";
import { getAbilityModifier } from "src/shared/srd-utils";
import { getMonsterSavingThrowBonus } from "./monster-saving-throw";
import { findFearCompulsion } from "./fear-compulsion";
import {
  abjureFoesChoiceError,
  chooseAbjureFoesTurnOption,
} from "./abjure-foes";
import {
  getBlightCreatureRules,
  maximumDiceExpression,
} from "./blight-rules";
import {
  MovementService,
  reconcileRemainingMovement,
} from "./movement.service";
import { getSpellDamage } from "./spell-damage-catalog";
import { getSpellHealing } from "./spell-healing-catalog";
import {
  getSpellcastingModifier,
  substituteSpellcastingMod,
} from "./spellcasting-mod";
import { getSpellCondition } from "./spell-condition-catalog";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { SummoningService } from "./summoning.service";
import {
  buildBestialSpiritStatBlock,
  buildElementalSpiritStatBlock,
  getSummonMetadata,
  type FamiliarCreatureType,
  type FamiliarForm,
  type SummonBeastForm,
  type SummonElementalForm,
} from "./summon-stat-block";
import {
  concentrationDurationRounds,
  huntersMarkDurationRounds,
} from "./spell-duration";
import type {
  SummonConcentrationBreakBehavior,
  SummonControlMode,
  SummonSource,
} from "../interfaces/summoning.interfaces";
import { PersistentAreaService } from "./persistent-area.service";
import {
  getTileEffectDefinition,
  type TileEffectKind,
  type TileEffectOriginCell,
} from "./tile-effect-catalog";
import { TransformationService } from "./transformation.service";
import { ConcentrationService } from "./concentration.service";
import type {
  AttackRollResult,
  ConditionSlug,
} from "../interfaces/combat.interfaces";
import {
  chromaticOrbRollCanLeap,
  isChromaticOrbDamageType,
  type ChromaticOrbDamageType,
} from "./chromatic-orb";
import { getForcedPushDestination } from "./spell-forced-movement";
import {
  createWitchBoltTether,
  findWitchBoltTether,
  witchBoltDistanceFt,
} from "./witch-bolt";
import {
  isBlindnessDeafnessChoice,
  resolveSpellConditionSlug,
  type BlindnessDeafnessChoice,
} from "./spell-condition-choice";
import { isHumanoidSpellTarget } from "./spell-target-eligibility";
import {
  canTakeReactionFromConditions,
  hasDodgeDexSaveAdvantage,
  isTargetingCharmer,
} from "./condition-effects.service";
import { getSpellAutomationEntry } from "./spell-automation-catalog";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { shouldDisintegrateTarget } from "./disintegrate-rules";
import { validateFireStormLayout } from "./fire-storm";
import { hasBeaconWisdomSaveAdvantage } from "./beacon-of-hope";
import {
  DispelMagicService,
  type DispelMagicResolution,
  type DispelMagicTarget,
  type PreparedDispelMagicTarget,
} from "./dispel-magic.service";
import {
  isMagicalMobilityCondition,
  isMagicalSpeedReduction,
} from "./freedom-of-movement";

export function concentrationSupportsSpell(
  caster: Pick<
    EncounterParticipantEntity,
    "isConcentrating" | "concentratingOn"
  >,
  normalizedSpellSlug: string,
): boolean {
  return (
    caster.isConcentrating &&
    caster.concentratingOn
      ?.toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "") === normalizedSpellSlug
  );
}


export interface SpellCastResult {
  spellName: string;
  spellLevel: number;
  slotUsed: number;
  concentration: boolean;
  previousConcentration?: string;
  saves?: Array<{
    targetId: string;
    ability: string;
    dc: number;
    roll: number;
    total: number;
    success: boolean;
  }>;
  damage?: {
    expression: string;
    total: number;
    type: string;
    halvedTargets?: string[];
  };
  healing?: {
    expression: string;
    total: number;
  };
  resourceDelta?: {
    spellSlots?: Array<{
      level: number;
      used: number;
      total: number;
      kind?: string;
    }>;
  };
}



export interface CastSpellDto {
  characterId: string;
  userId: string;
  spellSlug: string;
  slotLevel: number;
  targetIds?: string[];
  encounterId?: string;
  sessionId?: string;
  ownerUserId: string;

  _skipSlotConsumption?: boolean;
}

export interface CastSpellInCombatDto {
  encounterId: string;
  participantId: string;
  spellSlug: string;
  slotLevel: number;
  targetParticipantIds: string[];
  ownerUserId: string;
  damageType?: ChromaticOrbDamageType;
  conditionChoice?: BlindnessDeafnessChoice;

  asReaction?: boolean;

  triggerEventId?: string;

  aoeOriginCell?: TileEffectOriginCell;

  aoeOriginCells?: TileEffectOriginCell[];

  metamagic?: {
    type:
      | "twinned"
      | "quickened"
      | "distant"
      | "heightened"
      | "extended"
      | "subtle";

    targetExtra?: string;

    heightenedTargetId?: string;
  };

  polymorphBeastSlug?: string;

  summonMonsterSlug?: string;

  summonPosition?: { x: number; y: number };

  summonControlMode?: SummonControlMode;

  summonBeastForm?: SummonBeastForm;

  summonElementalForm?: SummonElementalForm;

  summonFamiliarForm?: FamiliarForm;

  summonFamiliarCreatureType?: FamiliarCreatureType;

  deliverThroughFamiliar?: boolean;

  dispelTarget?: DispelMagicTarget;
}

export interface CombatSpellResult extends SpellCastResult {
  targetsHit: Array<{
    participantId: string;
    displayName: string;
    attackRoll?: AttackRollResult;
    hit?: boolean;
    damageRolled?: number;
    damageDealt?: number;
    resisted?: boolean;
    immune?: boolean;
    vulnerable?: boolean;
    damageRolls?: number[];
    triggeredLeap?: boolean;
    healingApplied?: number;
    healingPrevented?: boolean;
    healingMaximized?: boolean;
    savedSuccessfully?: boolean;
    conditionApplied?: {
      instanceId: string;
      slug: ConditionSlug;
      durationRoundsRemaining: number;
    };
    defeated?: boolean;
    forcedMovement?: {
      from: { x: number; y: number };
      to: { x: number; y: number };
      distanceFt: number;
    };
  }>;
  dispelMagic?: DispelMagicResolution;
}

export function hasVerbalSpellComponent(components: unknown): boolean {
  if (Array.isArray(components)) {
    return components.some((component) =>
      ["v", "verbal"].includes(String(component).trim().toLowerCase()),
    );
  }
  if (typeof components === "string") {
    return components
      .split(/[\s,;/]+/)
      .some((component) =>
        ["v", "verbal"].includes(component.trim().toLowerCase()),
      );
  }
  if (components && typeof components === "object") {
    const record = components as Record<string, unknown>;
    return record.v === true || record.V === true || record.verbal === true;
  }
  return false;
}

export interface SustainedWitchBoltResult {
  targetParticipantId: string;
  targetName: string;
  damageRolled: number;
  damageDealt: number;
  targetHpAfter: number;
  targetDefeated: boolean;
  ended: boolean;
  endReason?: "out_of_range" | "target_defeated";
}

export interface SustainedCallLightningResult {
  originCell: TileEffectOriginCell;
  expression: string;
  damageRolled: number;
  targetsHit: Array<{
    participantId: string;
    displayName: string;
    savedSuccessfully: boolean;
    damageDealt: number;
    targetHpAfter: number;
    targetDefeated: boolean;
  }>;
}

export interface RelocatedCloudOfDaggersResult {
  areaId: string;
  from: TileEffectOriginCell;
  to: TileEffectOriginCell;
  affectedParticipantIds: string[];
  totalDamage: number;
}

export type RelocatedConjureAnimalsResult = RelocatedCloudOfDaggersResult;

export interface RelocatedSpiritualWeaponResult {
  areaId: string;
  from: TileEffectOriginCell;
  to: TileEffectOriginCell;
  targetParticipantId?: string;
  targetName?: string;
  attackRoll?: AttackRollResult;
  hit?: boolean;
  damageRolled: number;
  damageDealt: number;
  targetHpAfter?: number;
  targetDefeated?: boolean;
}

@Injectable()
export class SpellCastingService {
  constructor(
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly spellService: SpellService,
    private readonly diceService: DiceService,
    private readonly savingThrowService: SavingThrowService,
    private readonly combatService: CombatService,
    private readonly encounterService: EncounterService,
    private readonly monsterSpellcasting: MonsterSpellcastingService,
    private readonly effectInstanceService: EffectInstanceService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly concentration: ConcentrationService,
    private readonly summoning: SummoningService,
    private readonly persistentArea: PersistentAreaService,
    private readonly transformation: TransformationService,
    private readonly movementService: MovementService,
    private readonly characterStateService: CharacterStateService,
    private readonly dispelMagic: DispelMagicService,
  ) {}

  async sustainWitchBolt(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<SustainedWitchBoltResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const caster = await this.encounterService.getParticipant(participantId);
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "Ações bônus indisponíveis enquanto incapacitado.",
        "NO_ACTION_AVAILABLE",
      );
    }
    if (caster.bonusActionUsed) {
      return failure(
        "Bonus action ja utilizada neste turno.",
        "NO_ACTION_AVAILABLE",
      );
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      caster,
      "bonus",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const tether = findWitchBoltTether(caster);
    if (!tether) {
      return failure(
        "Nenhum vínculo ativo de Witch Bolt.",
        "INVALID_ACTION",
      );
    }
    if (encounter.currentRound <= tether.createdRound) {
      return failure(
        "Witch Bolt só pode ser sustentado em um turno posterior à conjuração.",
        "INVALID_ACTION",
      );
    }
    const target = await this.encounterService
      .getParticipant(tether.targetParticipantId)
      .catch(() => null);

    if (!target || target.isDefeated) {
      const breakResult = await this.concentration.break(caster, "expired");
      return success(
        {
          targetParticipantId: tether.targetParticipantId,
          targetName: tether.targetName,
          damageRolled: 0,
          damageDealt: 0,
          targetHpAfter: target?.currentHp ?? 0,
          targetDefeated: true,
          ended: true,
          endReason: "target_defeated",
        },
        [
          {
            event_type: "witch_bolt_ended",
            actor_participant_id: caster.id,
            target_participant_id: tether.targetParticipantId,
            data: { reason: "target_defeated" },
          },
          ...breakResult.events,
        ],
      );
    }

    const distanceFt = witchBoltDistanceFt(caster, target);
    if (distanceFt != null && distanceFt > tether.rangeFt) {
      const breakResult = await this.concentration.break(caster, "expired");
      return success(
        {
          targetParticipantId: target.id,
          targetName: target.displayName,
          damageRolled: 0,
          damageDealt: 0,
          targetHpAfter: target.currentHp ?? 0,
          targetDefeated: false,
          ended: true,
          endReason: "out_of_range",
        },
        [
          {
            event_type: "witch_bolt_ended",
            actor_participant_id: caster.id,
            target_participant_id: target.id,
            data: {
              reason: "out_of_range",
              distanceFt,
              rangeFt: tether.rangeFt,
            },
          },
          ...breakResult.events,
        ],
      );
    }

    const damageRoll = this.diceService.rollExpression("1d12");
    const damageResult = await this.combatService.applyDamage(encounterId, {
      targetParticipantId: target.id,
      amount: damageRoll.total,
      damageType: "lightning",
      ownerUserId,
    });
    if (!damageResult.ok) return damageResult as never;

    caster.bonusActionUsed = true;
    await this.participantRepo.update(caster.id, { bonusActionUsed: true });

    const events: GameEventData[] = [
      {
        event_type: "witch_bolt_sustained",
        actor_participant_id: caster.id,
        target_participant_id: target.id,
        data: {
          spellSlug: "witch-bolt",
          expression: "1d12",
          rolled: damageRoll.total,
          damageDealt: damageResult.value.damageApplied,
          targetHpAfter: damageResult.value.hpAfter,
        },
      },
    ];

    if (damageResult.value.defeated) {
      const freshCaster = await this.encounterService.getParticipant(caster.id);
      if (findWitchBoltTether(freshCaster)) {
        const breakResult = await this.concentration.break(
          freshCaster,
          "expired",
        );
        events.push(...breakResult.events);
      }
    }

    return success(
      {
        targetParticipantId: target.id,
        targetName: target.displayName,
        damageRolled: damageRoll.total,
        damageDealt: damageResult.value.damageApplied,
        targetHpAfter: damageResult.value.hpAfter,
        targetDefeated: damageResult.value.defeated,
        ended: damageResult.value.defeated,
        ...(damageResult.value.defeated
          ? { endReason: "target_defeated" as const }
          : {}),
      },
      events,
    );
  }

  async sustainCallLightning(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
    originCell: TileEffectOriginCell,
  ): Promise<GameResult<SustainedCallLightningResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const caster = await this.encounterService.getParticipant(participantId);
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "Ação Mágica indisponível enquanto incapacitado.",
        "NO_ACTION_AVAILABLE",
      );
    }
    if (caster.actionUsed) {
      return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      caster,
      "action",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (
      !caster.isConcentrating ||
      caster.concentratingOn
        ?.trim()
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "") !== "call-lightning"
    ) {
      return failure(
        "Nenhuma Call Lightning ativa sob sua concentração.",
        "NO_CONCENTRATION",
      );
    }

    const activeEffect = (caster.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "call_lightning_active" &&
        effect.requiresConcentration &&
        effect.sourceCasterParticipantId === caster.id,
    );
    if (!activeEffect) {
      return failure(
        "A tempestade ativa não preservou o nível do slot.",
        "INVALID_ACTION",
      );
    }
    if (caster.positionX == null || caster.positionY == null) {
      return failure(
        "O conjurador precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }

    const targetCell = {
      x: Math.trunc(originCell.x),
      y: Math.trunc(originCell.y),
    };
    const columns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const rows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (
      targetCell.x < 0 ||
      targetCell.y < 0 ||
      targetCell.x >= columns ||
      targetCell.y >= rows
    ) {
      return failure("Ponto fora dos limites do mapa.", "INVALID_ACTION");
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      targetCell,
    );
    if (distanceFt > 120) {
      return failure(
        "O ponto do relâmpago está além de 120 pés.",
        "OUT_OF_RANGE",
      );
    }

    const slotLevel = Math.max(3, Number(activeEffect.payload.slotLevel ?? 3));
    const expression =
      activeEffect.payload.diceExpression ??
      `${slotLevel}d10`;
    let saveDc = Number(activeEffect.payload.saveDc ?? 0);
    if (saveDc <= 0 && caster.characterId) {
      const sheet = await this.sheetService.computeSheet(
        ownerUserId,
        caster.characterId,
      );
      saveDc =
        sheet.classes.find((classBlock) => classBlock.spellSaveDc != null)
          ?.spellSaveDc ?? 13;
    }
    if (saveDc <= 0) saveDc = 13;

    const shape = {
      kind: "sphere" as const,
      radiusCells: 1,
      sizeFt: 5,
    };
    const targets = (
      await this.participantRepo.find({
        where: { encounterId },
        relations: ["monster"],
      })
    ).filter(
      (target) =>
        !target.isDefeated &&
        target.positionX != null &&
        target.positionY != null &&
        cellInAoe(
          { x: target.positionX, y: target.positionY },
          targetCell,
          shape,
        ),
    );

    const damageRoll = this.diceService.rollExpression(expression);
    const events: GameEventData[] = [];
    const targetsHit: SustainedCallLightningResult["targetsHit"] = [];
    for (const target of targets) {
      const save = await this.rollMonsterOrPcSave(
        target,
        "dex",
        saveDc,
        ownerUserId,
      );
      const damageBeforeDefenses = save.success
        ? Math.floor(damageRoll.total / 2)
        : damageRoll.total;
      const damageResult = await this.combatService.applyDamage(
        encounterId,
        {
          targetParticipantId: target.id,
          amount: damageBeforeDefenses,
          damageType: "lightning",
          ownerUserId,
          savingThrow: {
            ability: "dex",
            success: save.success,
            halfDamageOnSuccess: true,
          },
        },
        { emitEvents: false },
      );
      if (!damageResult.ok) return damageResult as never;
      events.push(...damageResult.events);
      targetsHit.push({
        participantId: target.id,
        displayName: target.displayName,
        savedSuccessfully: save.success,
        damageDealt: damageResult.value.damageApplied,
        targetHpAfter: damageResult.value.hpAfter,
        targetDefeated: damageResult.value.defeated,
      });
      events.push({
        event_type: "call_lightning_sustained",
        actor_participant_id: caster.id,
        target_participant_id: target.id,
        data: {
          spellSlug: "call-lightning",
          originCell: targetCell,
          expression,
          rolled: damageRoll.total,
          save: {
            ability: "dex",
            dc: saveDc,
            roll: save.roll,
            total: save.total,
            success: save.success,
          },
          damageDealt: damageResult.value.damageApplied,
          targetHpAfter: damageResult.value.hpAfter,
        },
      });
    }

    caster.actionUsed = true;
    await this.participantRepo.update(caster.id, { actionUsed: true });
    return success(
      {
        originCell: targetCell,
        expression,
        damageRolled: damageRoll.total,
        targetsHit,
      },
      events,
    );
  }

  async relocateCloudOfDaggers(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
    originCell: TileEffectOriginCell,
  ): Promise<GameResult<RelocatedCloudOfDaggersResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const caster = await this.encounterService.getParticipant(participantId);
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "Ação indisponível enquanto incapacitado.",
        "NO_ACTION_AVAILABLE",
      );
    }
    if (caster.actionUsed) {
      return failure(
        "Ação já utilizada neste turno.",
        "NO_ACTION_AVAILABLE",
      );
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      caster,
      "action",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (
      !caster.isConcentrating ||
      caster.concentratingOn !== "cloud-of-daggers"
    ) {
      return failure(
        "Nenhuma Nuvem de Adagas ativa sob sua concentração.",
        "NO_CONCENTRATION",
      );
    }
    if (caster.positionX == null || caster.positionY == null) {
      return failure(
        "O conjurador precisa estar posicionado no mapa.",
        "INVALID_ACTION",
      );
    }

    const x = Math.trunc(originCell.x);
    const y = Math.trunc(originCell.y);
    const columns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const rows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (x < 0 || y < 0 || x >= columns || y >= rows) {
      return failure(
        "Destino fora dos limites do mapa.",
        "POSITION_OUT_OF_BOUNDS",
      );
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x, y },
    );
    if (distanceFt > 30) {
      return failure(
        `O novo espaço está a ${distanceFt} pés; o limite é 30 pés.`,
        "OUT_OF_RANGE",
      );
    }

    const areas = await this.persistentArea.listByEncounter(encounterId);
    const area = areas.find(
      (candidate) =>
        candidate.casterParticipantId === participantId &&
        candidate.sourceSpell === "cloud-of-daggers",
    );
    if (!area) {
      return failure(
        "A área da Nuvem de Adagas não foi encontrada.",
        "PERSISTENT_AREA_NOT_FOUND",
      );
    }

    const from = area.originCell;
    const to: TileEffectOriginCell = { x, y };
    await this.persistentArea.relocate(area, to);
    caster.actionUsed = true;
    await this.participantRepo.save(caster);

    const participants = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });
    const inArea = participants.filter(
      (participant) =>
        participant.positionX != null &&
        participant.positionY != null &&
        this.persistentArea.cellInArea(
          participant.positionX,
          participant.positionY,
          area,
        ),
    );
    const triggerResult = await this.persistentArea.resolveOnCast(
      area,
      inArea,
      async () => ({ modifier: 0 }),
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (inArea.length > 0) {
      await this.participantRepo.save(inArea);
    }
    const movedEvents = triggerResult.events.map((event) =>
      event.event_type === "tile_effect_damage_applied"
        ? {
            ...event,
            data: {
              ...event.data,
              triggerKind: "on-area-moved-into",
            },
          }
        : event,
    );
    const hpEvents = await this.combatService.applyPersistentAreaDamageEvents(
      encounterId,
      movedEvents,
      ownerUserId,
    );
    const events: GameEventData[] = [
      {
        event_type: "tile_effect_relocated",
        actor_participant_id: caster.id,
        data: {
          areaId: area.id,
          sourceSpell: area.sourceSpell,
          effectKind: area.effectKind,
          from,
          to,
          rangeFt: 30,
          affectedParticipantIds: inArea.map((participant) => participant.id),
        },
      },
      ...movedEvents,
      ...hpEvents,
    ];

    return success(
      {
        areaId: area.id,
        from,
        to,
        affectedParticipantIds: inArea.map((participant) => participant.id),
        totalDamage: movedEvents.reduce(
          (sum, event) =>
            sum +
            (event.event_type === "tile_effect_damage_applied"
              ? Number(event.data?.finalDamage ?? event.data?.amount ?? 0)
              : 0),
          0,
        ),
      },
      events,
    );
  }

  async relocateConjureAnimals(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
    originCell: TileEffectOriginCell,
  ): Promise<GameResult<RelocatedConjureAnimalsResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const caster = await this.encounterService.getParticipant(participantId);
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "Movimento da matilha indisponível enquanto incapacitado.",
        "NO_ACTION_AVAILABLE",
      );
    }
    const normalizedConcentration = caster.concentratingOn
      ?.trim()
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    if (
      !caster.isConcentrating ||
      normalizedConcentration !== "conjure-animals"
    ) {
      return failure(
        "Nenhuma matilha de Conjure Animals ativa sob sua concentração.",
        "NO_CONCENTRATION",
      );
    }

    const baseMovement = await this.movementService.getBaseSpeed(
      caster,
      ownerUserId,
    );
    if ((caster.movementRemaining ?? baseMovement) >= baseMovement) {
      return failure(
        "Mova o conjurador antes de mover a matilha espiritual.",
        "MOVEMENT_REQUIRED",
      );
    }

    const areas = await this.persistentArea.listByEncounter(encounterId);
    const area = areas.find(
      (candidate) =>
        candidate.casterParticipantId === participantId &&
        candidate.sourceSpell === "conjure-animals",
    );
    if (!area) {
      return failure(
        "A área de Conjure Animals não foi encontrada.",
        "PERSISTENT_AREA_NOT_FOUND",
      );
    }

    const turnKey = `${encounter.currentRound}:${encounter.currentTurnIndex}`;
    if (area.tacticalMetadata?.relocatedTurnKey === turnKey) {
      return failure(
        "A matilha espiritual já foi movida neste turno.",
        "NO_ACTION_AVAILABLE",
      );
    }

    const x = Math.trunc(originCell.x);
    const y = Math.trunc(originCell.y);
    const columns =
      encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
    const rows =
      encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
    if (x < 0 || y < 0 || x + 1 >= columns || y + 1 >= rows) {
      return failure(
        "A matilha Grande precisa caber em um espaço desocupado do mapa.",
        "POSITION_OUT_OF_BOUNDS",
      );
    }

    const distanceFt = chebyshevDistanceFt(area.originCell, { x, y });
    if (distanceFt > 30) {
      return failure(
        `A matilha se moveria ${distanceFt} pés; o limite é 30 pés.`,
        "OUT_OF_RANGE",
      );
    }

    const participants = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
    });
    const largeFootprint = new Set([
      `${x},${y}`,
      `${x + 1},${y}`,
      `${x},${y + 1}`,
      `${x + 1},${y + 1}`,
    ]);
    if (
      participants.some(
        (participant) =>
          participant.positionX != null &&
          participant.positionY != null &&
          largeFootprint.has(
            `${participant.positionX},${participant.positionY}`,
          ),
      )
    ) {
      return failure(
        "Escolha um espaço desocupado para a matilha Grande.",
        "POSITION_OCCUPIED",
      );
    }

    const from = { ...area.originCell };
    const to: TileEffectOriginCell = { x, y };
    area.tacticalMetadata = {
      ...(area.tacticalMetadata ?? {
        tags: [],
        tacticalValue: 0,
        beneficiaryFaction: "caster",
      }),
      relocatedTurnKey: turnKey,
    };
    await this.persistentArea.relocate(area, to);

    const triggerResult = await this.persistentArea.resolveAreaMovedInto(
      area,
      participants,
      from,
      async (ability, target) => ({
        modifier: target
          ? await this.getTargetSaveModifier(target, ability, ownerUserId)
          : 0,
      }),
      turnKey,
    );
    if (participants.length > 0) {
      await this.participantRepo.save(participants);
    }
    const hpEvents = await this.combatService.applyPersistentAreaDamageEvents(
      encounterId,
      triggerResult.events,
      ownerUserId,
    );
    const affectedParticipantIds = [
      ...new Set(
        triggerResult.events
          .filter(
            (event) => event.event_type === "tile_effect_damage_applied",
          )
          .map((event) => event.target_participant_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const events: GameEventData[] = [
      {
        event_type: "tile_effect_relocated",
        actor_participant_id: caster.id,
        data: {
          areaId: area.id,
          sourceSpell: area.sourceSpell,
          effectKind: area.effectKind,
          from,
          to,
          rangeFt: 30,
          movementRequired: true,
          affectedParticipantIds,
        },
      },
      ...triggerResult.events,
      ...hpEvents,
    ];

    return success(
      {
        areaId: area.id,
        from,
        to,
        affectedParticipantIds,
        totalDamage: triggerResult.totalDamage,
      },
      events,
    );
  }

  async relocateSpiritualWeapon(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
    originCell: TileEffectOriginCell,
    targetParticipantId?: string,
  ): Promise<GameResult<RelocatedSpiritualWeaponResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }

    const caster = await this.encounterService.getParticipant(participantId);
    if (
      (caster.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "stunned",
          "paralyzed",
          "petrified",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "Ações bônus indisponíveis enquanto incapacitado.",
        "NO_ACTION_AVAILABLE",
      );
    }
    if (caster.bonusActionUsed) {
      return failure(
        "Bonus action ja utilizada neste turno.",
        "NO_ACTION_AVAILABLE",
      );
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      caster,
      "bonus",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const areas = await this.persistentArea.listByEncounter(encounterId);
    const area = areas.find(
      (candidate) =>
        candidate.casterParticipantId === participantId &&
        candidate.sourceSpell
          .toLowerCase()
          .replace(/-(phb|xphb|srd52)$/, "") === "spiritual-weapon",
    );
    if (!area) {
      return failure(
        "Nenhuma Spiritual Weapon ativa foi encontrada.",
        "PERSISTENT_AREA_NOT_FOUND",
      );
    }

    const x = Math.trunc(originCell.x);
    const y = Math.trunc(originCell.y);
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
    const to: TileEffectOriginCell = { x, y };
    const distanceFt = chebyshevDistanceFt(area.originCell, to);
    if (distanceFt > 20) {
      return failure(
        `A arma se moveria ${distanceFt} pés; o limite é 20 pés.`,
        "OUT_OF_RANGE",
      );
    }

    const participants = await this.participantRepo.find({
      where: { encounterId, isDefeated: false },
      relations: ["monster"],
    });
    if (
      participants.some(
        (participant) =>
          participant.positionX === x && participant.positionY === y,
      )
    ) {
      return failure(
        "Escolha um espaço desocupado para a arma espectral.",
        "POSITION_OCCUPIED",
      );
    }

    const target = targetParticipantId
      ? participants.find((participant) => participant.id === targetParticipantId)
      : undefined;
    if (targetParticipantId && !target) {
      return failure("Alvo inválido ou derrotado.", "INVALID_TARGET");
    }
    if (
      target &&
      (target.positionX == null ||
        target.positionY == null ||
        chebyshevDistanceFt(to, {
          x: target.positionX,
          y: target.positionY,
        }) > 5)
    ) {
      return failure(
        "O alvo precisa estar a até 5 pés da Spiritual Weapon.",
        "SPELL_OUT_OF_RANGE",
      );
    }

    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      caster.characterId!,
    );
    const spellAttackBonus =
      sheet.classes.find((classBlock) => classBlock.spellAttackBonus != null)
        ?.spellAttackBonus ?? 0;
    const from = { ...area.originCell };
    await this.persistentArea.relocate(area, to);
    // Keep the in-memory entity aligned with the atomic DB update. The spell
    // attack resolver persists this same entity after consuming one-shot
    // effects; leaving it stale would write bonusActionUsed=false back.
    caster.bonusActionUsed = true;
    await this.participantRepo.update(caster.id, { bonusActionUsed: true });

    const events: GameEventData[] = [
      {
        event_type: "spiritual_weapon_moved",
        actor_participant_id: caster.id,
        target_participant_id: target?.id,
        data: {
          areaId: area.id,
          sourceSpell: "spiritual-weapon",
          from,
          to,
          distanceFt,
          targetParticipantId: target?.id,
        },
      },
    ];

    if (!target) {
      return success(
        {
          areaId: area.id,
          from,
          to,
          damageRolled: 0,
          damageDealt: 0,
        },
        events,
      );
    }

    const resolution = await this.combatService.resolveSpellAttackRoll(
      caster,
      target,
      {
        attackBonus: spellAttackBonus,
        actionName: "Spiritual Weapon",
        isMelee: true,
        ownerUserId,
      },
    );
    events.push(...resolution.events);
    if (!resolution.attackRoll.hit) {
      events.push({
        event_type: "spiritual_weapon_attack",
        actor_participant_id: caster.id,
        target_participant_id: target.id,
        data: {
          areaId: area.id,
          expression: area.damageDice,
          attackRoll: resolution.attackRoll,
          hit: false,
          damageRolled: 0,
          damageDealt: 0,
        },
      });
      return success(
        {
          areaId: area.id,
          from,
          to,
          targetParticipantId: target.id,
          targetName: target.displayName,
          attackRoll: resolution.attackRoll,
          hit: false,
          damageRolled: 0,
          damageDealt: 0,
          targetHpAfter: target.currentHp,
          targetDefeated: target.isDefeated,
        },
        events,
      );
    }

    const expression =
      area.damageDice ||
      `${1 + Math.floor(Math.max(0, (area.slotLevel ?? 2) - 2) / 2)}d8 + ${getSpellcastingModifier(sheet)}`;
    const damageRoll = this.diceService.rollExpression(expression);
    const damageResult = await this.combatService.applyDamage(encounterId, {
      targetParticipantId: target.id,
      amount: damageRoll.total,
      damageType: "force",
      ownerUserId,
    });
    if (!damageResult.ok) return damageResult as never;

    events.push({
      event_type: "spiritual_weapon_attack",
      actor_participant_id: caster.id,
      target_participant_id: target.id,
      data: {
        areaId: area.id,
        expression,
        attackRoll: resolution.attackRoll,
        hit: true,
        damageRolled: damageRoll.total,
        damageDealt: damageResult.value.damageApplied,
        targetHpAfter: damageResult.value.hpAfter,
        targetDefeated: damageResult.value.defeated,
      },
    });

    return success(
      {
        areaId: area.id,
        from,
        to,
        targetParticipantId: target.id,
        targetName: target.displayName,
        attackRoll: resolution.attackRoll,
        hit: true,
        damageRolled: damageRoll.total,
        damageDealt: damageResult.value.damageApplied,
        targetHpAfter: damageResult.value.hpAfter,
        targetDefeated: damageResult.value.defeated,
      },
      events,
    );
  }


  private getSummonMonsterForSpell(
    spellSlug: string,
    slotLevel: number,
  ): string | null {
    if (spellSlug.replace(/-(phb|xphb|srd52)$/, "") === "summon-beast") {
      return "bestial-spirit";
    }
    if (spellSlug.replace(/-(phb|xphb|srd52)$/, "") === "summon-elemental") {
      return "elemental-spirit";
    }
    const map: Record<string, Record<number, string>> = {};
    return (
      map[spellSlug]?.[slotLevel] ??
      map[spellSlug]?.[
        Object.keys(map[spellSlug] ?? {})
          .map(Number)
          .sort()[0]
      ] ??
      null
    );
  }

  private getSummonSourceForSpell(spellSlug: string): SummonSource {
    const sourceBySpell: Record<string, SummonSource> = {
      "find-familiar": "find-familiar-spell",
      "conjure-animals": "conjure-animals-spell",
      "conjure-elemental": "summon-elemental-spell",
      "summon-elemental": "summon-elemental-spell",
      "summon-beast": "summon-beast-spell",
    };
    return sourceBySpell[spellSlug] ?? "summon-beast-spell";
  }

  private getSummonConcentrationBreakBehavior(
    spellSlug: string,
  ): SummonConcentrationBreakBehavior {
    return "dismiss";
  }

  async castSpell(dto: CastSpellDto): Promise<GameResult<SpellCastResult>> {

    const sheet = await this.sheetService.computeSheet(
      dto.userId,
      dto.characterId,
    );
    if (!sheet) {
      return failure("Personagem nao encontrado.", "INVALID_PARTICIPANT");
    }


    const charSpellRef = sheet.spells.find(
      (s) =>
        s.slug === dto.spellSlug ||
        s.name.toLowerCase() === dto.spellSlug.toLowerCase(),
    );
    if (!charSpellRef) {
      return failure(
        `Magia '${dto.spellSlug}' nao encontrada no repertorio.`,
        "INVALID_ACTION",
      );
    }


    const spell = await this.spellRepo.findOne({
      where: { slug: charSpellRef.slug },
    });
    if (!spell) {
      return failure(
        `Dados da magia '${dto.spellSlug}' nao encontrados.`,
        "INVALID_ACTION",
      );
    }


    const isCantrip = spell.level === 0;
    let resourceDelta: SpellCastResult["resourceDelta"] | undefined;

    if (!isCantrip) {

      if (dto.slotLevel < spell.level) {
        return failure(
          `Slot nivel ${dto.slotLevel} insuficiente para magia nivel ${spell.level}.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }




      const slotBlock =
        sheet.spellSlots.find(
          (s) =>
            s.level === dto.slotLevel && s.kind !== "pact" && s.used < s.total,
        ) ??
        sheet.spellSlots.find(
          (s) =>
            s.level >= dto.slotLevel && s.kind === "pact" && s.used < s.total,
        ) ??
        sheet.spellSlots.find((s) => s.level === dto.slotLevel);
      if (!slotBlock || slotBlock.used >= slotBlock.total) {
        return failure(
          `Sem slots de nivel ${dto.slotLevel} disponiveis.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }



      if (!dto._skipSlotConsumption) {
        const level = slotBlock.kind === "pact" ? -1 : dto.slotLevel;
        await this.spellService.updateSpellSlots(dto.userId, dto.characterId, {
          level,
          used: slotBlock.used + 1,
        });
        resourceDelta = {
          spellSlots: [
            {
              level,
              used: slotBlock.used + 1,
              total: slotBlock.total,
              kind: slotBlock.kind,
            },
          ],
        };
      }
    }


    let previousConcentration: string | undefined;
    const spellAutomation = getSpellAutomationEntry(spell.slug);
    const isConcentration =
      (spell.concentration ?? false) &&
      !spellAutomation?.automationTags.includes("no_concentration");






    const events: GameEventData[] = [];
    const result: SpellCastResult = {
      spellName: spell.name,
      spellLevel: spell.level,
      slotUsed: isCantrip ? 0 : dto.slotLevel,
      concentration: isConcentration,
      previousConcentration,
      ...(resourceDelta ? { resourceDelta } : {}),
    };




    const normalizedSpellSlug = spell.slug
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    const catalogDmg =
      normalizedSpellSlug === "spiritual-weapon"
        ? {
            expression: `${1 + Math.floor(Math.max(0, dto.slotLevel - 2) / 2)}d8 + ${getSpellcastingModifier(sheet)}`,
            type: "force",
          }
        : getSpellDamage(spell.slug, dto.slotLevel, sheet.totalLevel);
    if (catalogDmg) {
      const rollResult = this.diceService.rollExpression(catalogDmg.expression);
      result.damage = {
        expression: catalogDmg.expression,
        total: rollResult.total,
        type: catalogDmg.type,
      };
      events.push({
        event_type: "spell_damage",
        data: {
          spell: spell.name,
          expression: catalogDmg.expression,
          total: rollResult.total,
          type: catalogDmg.type,
          slot_level: dto.slotLevel,
          source: "catalog",
        },
      });
    } else if (spell.damage) {
      const damageInfo = spell.damage as Record<string, any>;
      const slotKey = String(dto.slotLevel);
      const cantripScalingExpr = (() => {
        const map = damageInfo?.damage_at_character_level;
        if (!map || typeof map !== "object") return null;
        const lvl = sheet.totalLevel;
        const validKeys = Object.keys(map)
          .map((k) => parseInt(k, 10))
          .filter((n) => Number.isFinite(n) && n <= lvl)
          .sort((a, b) => b - a);
        return validKeys.length > 0 ? map[String(validKeys[0])] : null;
      })();
      const expressionTemplate =
        damageInfo?.damage_at_slot_level?.[slotKey] ??
        cantripScalingExpr ??
        damageInfo?.base ??
        null;
      const expression =
        typeof expressionTemplate === "string"
          ? substituteSpellcastingMod(expressionTemplate, sheet)
          : null;

      if (expression) {
        const rollResult = this.diceService.rollExpression(expression);


        const rawDt = damageInfo?.damage_type as unknown;
        const damageType =
          (typeof rawDt === "object" && rawDt !== null && "name" in rawDt
            ? String((rawDt as { name: string }).name).toLowerCase()
            : Array.isArray(rawDt)
              ? String(rawDt[0] ?? "").toLowerCase()
              : typeof rawDt === "string"
                ? rawDt.toLowerCase()
                : null) ?? "magical";
        result.damage = {
          expression,
          total: rollResult.total,
          type: damageType,
        };
        events.push({
          event_type: "spell_damage",
          data: {
            spell: spell.name,
            expression,
            total: rollResult.total,
            type: damageType,
            slot_level: dto.slotLevel,
          },
        });
      }
    }






    const catalogHeal = getSpellHealing(dto.spellSlug, dto.slotLevel);
    const healTemplate =
      catalogHeal?.expression ??
      (spell.heal_at_slot_level as Record<string, string> | null)?.[
        String(dto.slotLevel)
      ] ??
      null;
    if (healTemplate) {
      const expression = substituteSpellcastingMod(healTemplate, sheet);

      if (expression) {
        const rollResult = this.diceService.rollExpression(expression);
        result.healing = {
          expression,
          total: rollResult.total,
        };

        events.push({
          event_type: "spell_healing",
          data: {
            spell: spell.name,
            expression,
            total: rollResult.total,
            slot_level: dto.slotLevel,
          },
        });
      }
    }

    events.push({
      event_type: "spell_cast",
      data: {
        character_id: dto.characterId,
        spell: spell.name,
        spell_level: spell.level,
        slot_used: isCantrip ? 0 : dto.slotLevel,
        concentration: isConcentration,
      },
    });

    return success(result, events);
  }

  async castSpellInCombat(
    dto: CastSpellInCombatDto,
  ): Promise<GameResult<CombatSpellResult>> {

    const encounter = await this.encounterRepo.findOne({
      where: { id: dto.encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");


    if (!dto.asReaction) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.participantId)
        return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    } else if (!dto.triggerEventId) {
      return failure(
        "asReaction=true exige 'triggerEventId'.",
        "MISSING_TRIGGER_EVENT",
      );
    }




    const requestedTargetIds = Array.isArray(dto.targetParticipantIds)
      ? dto.targetParticipantIds
      : [];

    const participant = await this.encounterService.getParticipant(
      dto.participantId,
    );
    if (!dto.asReaction && findFearCompulsion(participant)) {
      return failure(
        "Fear obriga esta criatura a usar Disparada e fugir.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (participant.type === "monster") {
      return this.castMonsterSpellInCombat(
        { ...dto, targetParticipantIds: requestedTargetIds },
        participant,
        encounter,
      );
    }
    if (!participant.characterId)
      return failure(
        "Apenas PCs e monstros casters podem lancar magias.",
        "INVALID_PARTICIPANT",
      );


    const spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {

      const byName = await this.spellRepo.findOne({
        where: { name: dto.spellSlug },
      });
      if (!byName)
        return failure(
          `Magia '${dto.spellSlug}' nao encontrada.`,
          "INVALID_ACTION",
        );
      dto.spellSlug = byName.slug;
    }
    const spellData =
      spell ??
      (await this.spellRepo.findOne({ where: { slug: dto.spellSlug } }))!;
    let touchDeliveryFamiliar: EncounterParticipantEntity | null = null;
    if (dto.deliverThroughFamiliar) {
      if ((spellData.range ?? "").trim().toLowerCase() !== "touch") {
        return failure(
          "O familiar só pode entregar magias com alcance Toque.",
          "INVALID_ACTION",
        );
      }
      const familiar = await this.summoning.getFindFamiliarOf(participant.id);
      const familiarMetadata = getSummonMetadata(familiar);
      if (
        !familiar ||
        familiar.encounterId !== dto.encounterId ||
        familiar.isDefeated ||
        !familiar.isVisible ||
        familiarMetadata?.pocketed === true
      ) {
        return failure(
          "O familiar precisa estar presente para entregar a magia.",
          "INVALID_ACTION",
        );
      }
      if ((familiar.reactionsUsed ?? 0) >= 1) {
        return failure(
          "O familiar já usou a reação nesta rodada.",
          "NO_REACTION_AVAILABLE",
        );
      }
      if (
        participant.positionX == null ||
        participant.positionY == null ||
        familiar.positionX == null ||
        familiar.positionY == null
      ) {
        return failure(
          "Conjurador e familiar precisam estar posicionados no mapa.",
          "INVALID_ACTION",
        );
      }
      const familiarDistanceFt = chebyshevDistanceFt(
        { x: participant.positionX, y: participant.positionY },
        { x: familiar.positionX, y: familiar.positionY },
      );
      if (familiarDistanceFt > 100) {
        return failure(
          `O familiar está fora do vínculo telepático (${familiarDistanceFt}ft > 100ft).`,
          "SPELL_OUT_OF_RANGE",
        );
      }
      touchDeliveryFamiliar = familiar;
    }
    const normalizedSpellSlug = dto.spellSlug
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    if (
      dto.asReaction &&
      normalizedSpellSlug === "shield" &&
      dto.triggerEventId
    ) {
      const shieldTrigger = await this.gameEventRepo.findOne({
        where: { id: dto.triggerEventId },
      });
      if (
        !shieldTrigger ||
        shieldTrigger.eventType !== "attack_roll" ||
        shieldTrigger.encounterId !== dto.encounterId ||
        shieldTrigger.targetParticipantId !== participant.id ||
        (shieldTrigger.data as { hit?: unknown }).hit !== true
      ) {
        return failure(
          "O gatilho de Shield não corresponde a um acerto atual contra este conjurador.",
          "INVALID_ACTION",
        );
      }
    }
    let preparedDispelTarget: PreparedDispelMagicTarget | null = null;
    if (normalizedSpellSlug === "dispel-magic") {
      const explicitParticipantTarget =
        dto.dispelTarget?.kind === "participant"
          ? dto.dispelTarget.participantId
          : null;
      const hasAmbiguousParticipantTargets =
        explicitParticipantTarget != null
          ? requestedTargetIds.length !== 1 ||
            requestedTargetIds[0] !== explicitParticipantTarget
          : requestedTargetIds.length !== 0;
      if (hasAmbiguousParticipantTargets) {
        return failure(
          "Dispel Magic exige um único alvo explícito.",
          "INVALID_TARGET",
        );
      }
      const prepared = await this.dispelMagic.prepareTarget({
        encounterId: dto.encounterId,
        caster: participant,
        target: dto.dispelTarget,
        rangeFt: 120,
      });
      if (!prepared.ok) return prepared;
      preparedDispelTarget = prepared.value;
    }
    const tileEffectDefinition = getTileEffectDefinition(normalizedSpellSlug);
    const delegatesInitialDamageToTileEffect =
      tileEffectDefinition?.triggers.some(
        (trigger) => trigger.kind === "on-cast" && Boolean(trigger.damage),
      ) === true;
    const isChromaticOrb = normalizedSpellSlug === "chromatic-orb";
    const isChainLightning = normalizedSpellSlug === "chain-lightning";
    if (isChromaticOrb && !isChromaticOrbDamageType(dto.damageType)) {
      return failure(
        "Chromatic Orb exige escolher Acid, Cold, Fire, Lightning, Poison ou Thunder.",
        "INVALID_ACTION",
      );
    }
    const conjureElementalDamageTypes = [
      "cold",
      "fire",
      "lightning",
      "thunder",
    ] as const;
    if (
      normalizedSpellSlug === "conjure-elemental" &&
      !conjureElementalDamageTypes.includes(
        dto.damageType as (typeof conjureElementalDamageTypes)[number],
      )
    ) {
      return failure(
        "Conjure Elemental exige escolher ar (lightning), terra (thunder), fogo (fire) ou água (cold).",
        "INVALID_ACTION",
      );
    }
    if (
      normalizedSpellSlug === "summon-beast" &&
      !["air", "land", "water"].includes(dto.summonBeastForm ?? "")
    ) {
      return failure(
        "Summon Beast exige escolher Espírito Bestial do Ar, Terra ou Água.",
        "INVALID_ACTION",
      );
    }
    if (
      normalizedSpellSlug === "summon-elemental" &&
      !["air", "earth", "fire", "water"].includes(
        dto.summonElementalForm ?? "",
      )
    ) {
      return failure(
        "Summon Elemental exige escolher Espírito Elemental do Ar, Terra, Fogo ou Água.",
        "INVALID_ACTION",
      );
    }
    const familiarForms: FamiliarForm[] = [
      "bat",
      "cat",
      "crab",
      "frog",
      "hawk",
      "lizard",
      "octopus",
      "owl",
      "poisonous-snake",
      "quipper",
      "rat",
      "raven",
      "sea-horse",
      "spider",
      "weasel",
    ];
    if (
      normalizedSpellSlug === "find-familiar" &&
      !familiarForms.includes(dto.summonFamiliarForm as FamiliarForm)
    ) {
      return failure(
        "Find Familiar exige escolher uma das quinze formas de familiar.",
        "INVALID_ACTION",
      );
    }
    if (
      normalizedSpellSlug === "find-familiar" &&
      !["celestial", "fey", "fiend"].includes(
        dto.summonFamiliarCreatureType ?? "",
      )
    ) {
      return failure(
        "Find Familiar exige escolher Celestial, Feérico ou Corruptor.",
        "INVALID_ACTION",
      );
    }
    if (
      normalizedSpellSlug === "blindness-deafness" &&
      !isBlindnessDeafnessChoice(dto.conditionChoice)
    ) {
      return failure(
        "Blindness/Deafness exige escolher Blinded ou Deafened.",
        "INVALID_ACTION",
      );
    }





    let effectiveTargetIds = [...requestedTargetIds];
    const aoeShape = getAoeShape(spellData);




    let effectiveOriginCell = dto.aoeOriginCell;
    let effectiveAoeOriginCells: TileEffectOriginCell[] = [];
    if (normalizedSpellSlug === "fire-storm") {
      const rawOrigins =
        dto.aoeOriginCells?.length
          ? dto.aoeOriginCells
          : dto.aoeOriginCell
            ? [dto.aoeOriginCell]
            : [];
      const columns =
        encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
      const rows =
        encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
      const layout = validateFireStormLayout(rawOrigins, {
        columns,
        rows,
        caster:
          participant.positionX != null && participant.positionY != null
            ? { x: participant.positionX, y: participant.positionY }
            : null,
      });
      if (!layout.ok) return failure(layout.message, layout.code);
      effectiveAoeOriginCells = layout.origins;
      effectiveOriginCell = effectiveAoeOriginCells[0];
      effectiveTargetIds = [];
    }
    if (
      aoeShape &&
      !effectiveOriginCell &&
      typeof spellData.range === "string" &&
      spellData.range.trim().toLowerCase() === "self" &&
      participant.positionX != null &&
      participant.positionY != null
    ) {
      effectiveOriginCell = {
        x: participant.positionX,
        y: participant.positionY,
      };
    }

    if (
      normalizedSpellSlug === "conjure-animals" &&
      effectiveOriginCell
    ) {
      const x = Math.trunc(effectiveOriginCell.x);
      const y = Math.trunc(effectiveOriginCell.y);
      const columns =
        encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
      const rows =
        encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
      if (x < 0 || y < 0 || x + 1 >= columns || y + 1 >= rows) {
        return failure(
          "A matilha Grande precisa caber em um espaço do mapa.",
          "POSITION_OUT_OF_BOUNDS",
        );
      }
      const largeFootprint = new Set([
        `${x},${y}`,
        `${x + 1},${y}`,
        `${x},${y + 1}`,
        `${x + 1},${y + 1}`,
      ]);
      const occupants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      if (
        occupants.some(
          (occupant) =>
            occupant.positionX != null &&
            occupant.positionY != null &&
            largeFootprint.has(
              `${occupant.positionX},${occupant.positionY}`,
            ),
        )
      ) {
        return failure(
          "Conjure Animals exige um espaço desocupado para a matilha Grande.",
          "POSITION_OCCUPIED",
        );
      }
    }
    if (
      normalizedSpellSlug === "conjure-elemental" &&
      effectiveOriginCell
    ) {
      const x = Math.trunc(effectiveOriginCell.x);
      const y = Math.trunc(effectiveOriginCell.y);
      const columns =
        encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
      const rows =
        encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
      if (
        x - 1 < 0 ||
        y - 1 < 0 ||
        x + 2 >= columns ||
        y + 2 >= rows
      ) {
        return failure(
          "O espírito elemental e seu perímetro de 5 pés precisam caber no mapa.",
          "POSITION_OUT_OF_BOUNDS",
        );
      }
      const largeFootprint = new Set([
        `${x},${y}`,
        `${x + 1},${y}`,
        `${x},${y + 1}`,
        `${x + 1},${y + 1}`,
      ]);
      const occupants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      if (
        occupants.some(
          (occupant) =>
            occupant.positionX != null &&
            occupant.positionY != null &&
            largeFootprint.has(
              `${occupant.positionX},${occupant.positionY}`,
            ),
        )
      ) {
        return failure(
          "Conjure Elemental exige um espaço desocupado para o espírito Large.",
          "POSITION_OCCUPIED",
        );
      }
    }
    if (normalizedSpellSlug === "guardian-of-faith") {
      if (!effectiveOriginCell) {
        return failure(
          "Escolha um espaço desocupado para o Guardian of Faith.",
          "INVALID_ACTION",
        );
      }
      const x = Math.trunc(effectiveOriginCell.x);
      const y = Math.trunc(effectiveOriginCell.y);
      effectiveOriginCell = { x, y };
      const columns =
        encounter.mapData?.gridColumns ?? encounter.mapData?.gridSize ?? 20;
      const rows =
        encounter.mapData?.gridRows ?? encounter.mapData?.gridSize ?? 20;
      if (x < 0 || y < 0 || x + 1 >= columns || y + 1 >= rows) {
        return failure(
          "O guardião Large precisa caber em um espaço do mapa.",
          "POSITION_OUT_OF_BOUNDS",
        );
      }
      const largeFootprint = new Set([
        `${x},${y}`,
        `${x + 1},${y}`,
        `${x},${y + 1}`,
        `${x + 1},${y + 1}`,
      ]);
      const occupants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      if (
        occupants.some(
          (occupant) =>
            occupant.positionX != null &&
            occupant.positionY != null &&
            largeFootprint.has(
              `${occupant.positionX},${occupant.positionY}`,
            ),
        )
      ) {
        return failure(
          "Guardian of Faith exige um espaço desocupado para o guardião Large.",
          "POSITION_OCCUPIED",
        );
      }
      // The spell creates a persistent guardian. It deals no damage when cast.
      effectiveTargetIds = [];
    }
    if (normalizedSpellSlug === "spiritual-weapon") {
      if (!effectiveOriginCell) {
        return failure(
          "Escolha um espaço para a Spiritual Weapon.",
          "INVALID_ACTION",
        );
      }
      if (effectiveTargetIds.length > 1) {
        return failure(
          "Spiritual Weapon pode atacar no máximo uma criatura.",
          "INVALID_ACTION",
        );
      }
      const x = Math.trunc(effectiveOriginCell.x);
      const y = Math.trunc(effectiveOriginCell.y);
      effectiveOriginCell = { x, y };
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
      const occupants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      if (
        occupants.some(
          (occupant) =>
            occupant.positionX === x && occupant.positionY === y,
        )
      ) {
        return failure(
          "Escolha um espaço desocupado para a arma espectral.",
          "POSITION_OCCUPIED",
        );
      }
      if (effectiveTargetIds.length === 1) {
        const target = occupants.find(
          (occupant) => occupant.id === effectiveTargetIds[0],
        );
        if (
          !target ||
          target.positionX == null ||
          target.positionY == null ||
          chebyshevDistanceFt(effectiveOriginCell, {
            x: target.positionX,
            y: target.positionY,
          }) > 5
        ) {
          return failure(
            "O alvo precisa estar a até 5 pés da Spiritual Weapon.",
            "SPELL_OUT_OF_RANGE",
          );
        }
      }
    }

    if (
      normalizedSpellSlug === "fire-storm" &&
      aoeShape &&
      effectiveAoeOriginCells.length > 0
    ) {
      const allParticipants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId },
      });
      effectiveTargetIds = allParticipants
        .filter((target) => !target.isDefeated)
        .filter((target) => !(target.conditions ?? []).includes("banished"))
        .filter(
          (target) =>
            target.positionX != null &&
            target.positionY != null &&
            effectiveAoeOriginCells.some((origin) =>
              cellInAoe(
                { x: target.positionX!, y: target.positionY! },
                origin,
                aoeShape,
              ),
            ),
        )
        .map((target) => target.id);
    } else if (
      normalizedSpellSlug !== "guardian-of-faith" &&
      aoeShape &&
      effectiveOriginCell &&
      effectiveTargetIds.length === 0
    ) {
      const allParticipants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId },
      });





      const isSelfRangeSpell =
        typeof spellData.range === "string" &&
        spellData.range.trim().toLowerCase() === "self";

      effectiveTargetIds = allParticipants
        .filter((p) => !p.isDefeated)
        .filter((p) => !(p.conditions ?? []).includes("banished"))
        .filter((p) => !(isSelfRangeSpell && p.id === participant.id))
        .filter(
          (p) =>
            p.positionX != null &&
            p.positionY != null &&
            (isSelfRangeSpell ? cellInSelfOriginAoe : cellInAoe)(
              { x: p.positionX, y: p.positionY },
              effectiveOriginCell,
              aoeShape,
            ),
        )
        .map((p) => p.id);
    }

    if (normalizedSpellSlug === "hold-person") {
      for (const targetId of effectiveTargetIds) {
        const target = await this.encounterService
          .getParticipant(targetId)
          .catch(() => null);
        if (!target || !isHumanoidSpellTarget(target)) {
          return failure(
            "Hold Person só pode afetar uma criatura Humanoide.",
            GameErrorCode.INVALID_TARGET,
          );
        }
      }
    }






    const targetCount = effectiveTargetIds.length;
    if (normalizedSpellSlug === "beacon-of-hope" && targetCount === 0) {
      return failure(
        "Beacon of Hope exige ao menos uma criatura no alcance.",
        GameErrorCode.INVALID_TARGET,
      );
    }
    if (normalizedSpellSlug === "beacon-of-hope") {
      if (participant.positionX == null || participant.positionY == null) {
        return failure(
          "O conjurador precisa estar posicionado no mapa.",
          GameErrorCode.INVALID_PARTICIPANT,
        );
      }
      for (const targetId of effectiveTargetIds) {
        const target = await this.encounterService
          .getParticipant(targetId)
          .catch(() => null);
        if (
          !target ||
          target.encounterId !== dto.encounterId ||
          target.isDefeated ||
          (target.conditions ?? []).includes("banished")
        ) {
          return failure(
            "Beacon of Hope exige criaturas válidas no encontro.",
            GameErrorCode.INVALID_TARGET,
          );
        }
        if (target.positionX == null || target.positionY == null) {
          return failure(
            `${target.displayName} precisa estar posicionado no mapa.`,
            GameErrorCode.INVALID_TARGET,
          );
        }
        const distanceFt = chebyshevDistanceFt(
          { x: participant.positionX, y: participant.positionY },
          { x: target.positionX, y: target.positionY },
        );
        if (distanceFt > 30) {
          return failure(
            `${target.displayName} está fora do alcance (${distanceFt}ft > 30ft).`,
            GameErrorCode.SPELL_OUT_OF_RANGE,
          );
        }
      }
    }
    const requiresDistinctTargets =
      isChromaticOrb ||
      isChainLightning ||
      normalizedSpellSlug === "aid" ||
      normalizedSpellSlug === "bless" ||
      normalizedSpellSlug === "beacon-of-hope" ||
      normalizedSpellSlug === "freedom-of-movement";
    if (
      requiresDistinctTargets &&
      new Set(effectiveTargetIds).size !== effectiveTargetIds.length
    ) {
      return failure(
        `${spellData.name} não pode selecionar a mesma criatura mais de uma vez.`,
        "INVALID_ACTION",
      );
    }
    if (
      targetCount > 1 &&
      !isAoeSpell(spellData) &&
      !tileEffectDefinition
    ) {
      let casterLevel = 0;
      if (isMultiTargetNonAoeSpell(spellData)) {
        const sheet = await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        );
        casterLevel = (sheet as any)?.totalLevel ?? 0;
      }
      const maxTargets = maxTargetsFor(spellData, dto.slotLevel, casterLevel);
      if (targetCount > maxTargets) {
        return failure(GameErrorCode.SPELL_NOT_AOE);
      }
    }






    if (
      effectiveTargetIds.length >= 1 &&
      isMultiTargetNonAoeSpell(spellData) &&
      repeatsFirstTargetToMaximum(spellData)
    ) {
      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const casterLevel = (sheet as any)?.totalLevel ?? 0;
      const maxTargets = maxTargetsFor(spellData, dto.slotLevel, casterLevel);
      if (
        Number.isFinite(maxTargets) &&
        effectiveTargetIds.length < maxTargets
      ) {
        const firstTarget = effectiveTargetIds[0];
        while (effectiveTargetIds.length < maxTargets) {
          effectiveTargetIds.push(firstTarget);
        }
      }
    }

    const automationBehavior =
      getSpellAutomationEntry(normalizedSpellSlug)?.behaviorKind;
    const isHarmfulSpell =
      automationBehavior != null &&
      !["healing", "buff", "summon"].includes(automationBehavior);
    if (
      isHarmfulSpell &&
      effectiveTargetIds.some((targetId) =>
        isTargetingCharmer(participant.conditionInstances, targetId),
      )
    ) {
      return failure(
        "Enfeitiçado: não pode usar efeitos nocivos contra quem aplicou a condição.",
        "CONDITION_PREVENTS_ACTION",
      );
    }








    const effectiveRange = getSpellEffectiveRange(spellData);
    if (
      effectiveRange.kind === "self-origin-attack" &&
      effectiveTargetIds.includes(participant.id)
    ) {
      return failure(
        "Esta magia precisa ser lancada contra outra criatura.",
        GameErrorCode.INVALID_TARGET_SELF,
      );
    }










    const distantRangeMultiplier =
      dto.metamagic?.type === "distant"
        ? (spellData.range ?? "").trim().toLowerCase() === "touch"
          ? 6
          : 2
        : 1;



    const parsedRange =
      effectiveRange.kind === "self-origin-attack"
        ? { normal: effectiveRange.attackRangeFt }
        : parseRangeString(spellData.range);
    if (parsedRange && parsedRange.normal > 0) {
      const rangeOriginParticipant = touchDeliveryFamiliar ?? participant;
      const casterPos =
        rangeOriginParticipant.positionX != null &&
        rangeOriginParticipant.positionY != null
          ? {
              x: rangeOriginParticipant.positionX,
              y: rangeOriginParticipant.positionY,
            }
          : null;


      if (
        (aoeShape || tileEffectDefinition) &&
        effectiveOriginCell &&
        casterPos
      ) {
        const dist = chebyshevDistanceFt(casterPos, effectiveOriginCell);
        const maxFt =
          (parsedRange.long ?? parsedRange.normal) * distantRangeMultiplier;
        if (dist > maxFt) {
          return failure(
            `Alvo fora do alcance (${dist}ft > ${maxFt}ft).`,
            GameErrorCode.SPELL_OUT_OF_RANGE,
          );
        }
      }


      if (!aoeShape && effectiveTargetIds.length > 0 && casterPos) {
        for (let targetIndex = 0; targetIndex < effectiveTargetIds.length; targetIndex += 1) {
          const tid = effectiveTargetIds[targetIndex];
          const t = await this.encounterService
            .getParticipant(tid)
            .catch(() => null);
          if (!t || t.positionX == null || t.positionY == null) continue;
          const previousTarget =
            isChromaticOrb && targetIndex > 0
              ? await this.encounterService
                  .getParticipant(effectiveTargetIds[targetIndex - 1])
                  .catch(() => null)
              : null;
          const chainPrimaryTarget =
            isChainLightning && targetIndex > 0
              ? await this.encounterService
                  .getParticipant(effectiveTargetIds[0])
                  .catch(() => null)
              : null;
          const rangeOrigin =
            chainPrimaryTarget?.positionX != null &&
            chainPrimaryTarget?.positionY != null
              ? {
                  x: chainPrimaryTarget.positionX,
                  y: chainPrimaryTarget.positionY,
                }
              : previousTarget?.positionX != null &&
            previousTarget?.positionY != null
              ? { x: previousTarget.positionX, y: previousTarget.positionY }
              : casterPos;
          const dist = chebyshevDistanceFt(rangeOrigin, {
            x: t.positionX,
            y: t.positionY,
          });
          const maxFt =
            (isChromaticOrb || isChainLightning) && targetIndex > 0
              ? 30
              : (parsedRange.long ?? parsedRange.normal) *
                distantRangeMultiplier;
          if (dist > maxFt) {
            return failure(
              `Alvo fora do alcance (${dist}ft > ${maxFt}ft).`,
              GameErrorCode.SPELL_OUT_OF_RANGE,
            );
          }
        }
      }
    }


    const castingTime = (spellData.casting_time ?? "action").toLowerCase();
    const baseIsBonusAction = castingTime.includes("bonus");
    const isReactionSpell = castingTime.includes("reaction");
    const isCombatCastingTime =
      castingTime.includes("action") ||
      baseIsBonusAction ||
      isReactionSpell;
    const isQuickPlayTraining = Boolean(
      (encounter.mapData as Record<string, unknown> | undefined)?.quickPlay,
    );
    if (!isCombatCastingTime && !isQuickPlayTraining) {
      return failure(
        `${spellData.name} exige tempo de conjuração ${spellData.casting_time} e não pode ser iniciada durante o combate.`,
        "INVALID_ACTION",
      );
    }




    let metamagicSpCost = 0;
    let metamagicAppliedType:
      | "twinned"
      | "quickened"
      | "distant"
      | "heightened"
      | "extended"
      | "subtle"
      | null = null;

    let heightenedTargetIdForSave: string | null = null;
    if (dto.metamagic) {

      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const sorcClass = (sheet as any).classes?.find(
        (c: any) => c.slug === "sorcerer",
      );
      if (!sorcClass || sorcClass.level < 2) {
        return failure("Metamagic requer Sorcerer L2+.", "INVALID_ACTION");
      }

      if (dto.metamagic.type === "twinned") {


        if (isAoeSpell(spellData) || isMultiTargetNonAoeSpell(spellData)) {
          return failure(
            "Twinned Spell requer spell de alvo único (não AoE, não multi-target).",
            "INVALID_ACTION",
          );
        }
        if (!dto.metamagic.targetExtra) {
          return failure(
            "Twinned Spell requer `targetExtra` (segundo alvo).",
            "INVALID_ACTION",
          );
        }
        if (effectiveTargetIds.includes(dto.metamagic.targetExtra)) {
          return failure(
            "Twinned Spell: targetExtra deve ser diferente do primeiro alvo.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = spellData.level === 0 ? 1 : dto.slotLevel;
        metamagicAppliedType = "twinned";
        effectiveTargetIds.push(dto.metamagic.targetExtra);
      } else if (dto.metamagic.type === "quickened") {

        if (isReactionSpell) {
          return failure(
            "Quickened Spell não pode ser aplicado em reaction spells.",
            "INVALID_ACTION",
          );
        }
        if (baseIsBonusAction) {
          return failure(
            "Quickened Spell não pode ser aplicado em spell que já é bonus action.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 2;
        metamagicAppliedType = "quickened";
      } else if (dto.metamagic.type === "distant") {


        const rangeStr = (spellData.range ?? "").trim().toLowerCase();
        if (rangeStr === "self") {
          return failure(
            "Distant Spell não pode ser aplicado em spells de range Self.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 1;
        metamagicAppliedType = "distant";
      } else if (dto.metamagic.type === "heightened") {

        if (!spellData.dc) {
          return failure(
            "Heightened Spell requer spell com saving throw.",
            "INVALID_ACTION",
          );
        }
        if (!dto.metamagic.heightenedTargetId) {
          return failure(
            "Heightened Spell requer `heightenedTargetId` (alvo com save em disadvantage).",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 3;
        metamagicAppliedType = "heightened";
        heightenedTargetIdForSave = dto.metamagic.heightenedTargetId;
      } else if (dto.metamagic.type === "extended") {




        const durationStr = (spellData.duration ?? "").trim().toLowerCase();
        if (
          durationStr === "instantaneous" ||
          durationStr === "1 round" ||
          durationStr.includes("until")
        ) {
          return failure(
            "Extended Spell requer spell de duração ≥ 1 minuto.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 1;
        metamagicAppliedType = "extended";
      } else if (dto.metamagic.type === "subtle") {



        metamagicSpCost = 1;
        metamagicAppliedType = "subtle";
      }


      const spTotal = sorcClass.level;
      const spUsed = participant.sorceryPointsUsed ?? 0;
      const spRemaining = spTotal - spUsed;
      if (spRemaining < metamagicSpCost) {
        return failure(
          `Metamagic '${dto.metamagic.type}' requer ${metamagicSpCost} SP, tem ${spRemaining}.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }
    }


    const isBonusAction =
      baseIsBonusAction || metamagicAppliedType === "quickened";


    if (dto.asReaction && !isReactionSpell) {
      return failure(
        `A magia '${dto.spellSlug}' nao e castavel como reaction (casting_time='${spellData.casting_time}').`,
        "SPELL_NOT_REACTION",
      );
    }

    if (dto.asReaction) {
      if (!canTakeReactionFromConditions(participant.conditions)) {
        return failure(
          "A condição atual impede reactions.",
          "CONDITION_PREVENTS_REACTION",
        );
      }
      if (participant.reactionsUsed > 0)
        return failure("Reacao ja utilizada.", "REACTION_ALREADY_USED");
    } else if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure(
          "Bonus action ja utilizada neste turno.",
          "NO_ACTION_AVAILABLE",
        );
    } else {
      if (participant.actionUsed)
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }
    if (!dto.asReaction) {
      const abjureChoice = chooseAbjureFoesTurnOption(
        participant,
        isBonusAction ? "bonus" : "action",
        `${encounter.currentRound}:${encounter.currentTurnIndex}`,
      );
      if (!abjureChoice.allowed) {
        return failure(
          abjureFoesChoiceError(abjureChoice.currentChoice),
          "CONDITION_PREVENTS_ACTION",
        );
      }
    }


    const targetMeta: TargetMetadata[] = [];
    for (const tid of effectiveTargetIds) {
      const t = await this.encounterService
        .getParticipant(tid)
        .catch(() => null);
      if (!t) continue;
      if ((t.conditions ?? []).includes("banished")) {
        return failure(
          `${t.displayName} está banido e fora do plano atual.`,
          GameErrorCode.INVALID_TARGET,
        );
      }
      const isWearingArmor = await this.isTargetWearingArmor(
        t,
        dto.ownerUserId,
      );
      targetMeta.push({ id: t.id, isWearingArmor, participant: t });
    }
    const precondFail = checkSpellPreconditions(dto.spellSlug, targetMeta);
    if (precondFail) {
      return failure(precondFail.message, precondFail.code as any);
    }
    if (normalizedSpellSlug === "freedom-of-movement") {
      if (
        effectiveTargetIds.length === 0 ||
        targetMeta.length !== effectiveTargetIds.length
      ) {
        return failure(
          "Freedom of Movement exige ao menos uma criatura disposta.",
          GameErrorCode.INVALID_TARGET,
        );
      }
      const unwillingTarget = targetMeta.find(
        ({ participant: target }) =>
          !target ||
          (target.id !== participant.id &&
            target.faction !== participant.faction),
      );
      if (unwillingTarget) {
        return failure(
          "Freedom of Movement só pode afetar uma criatura disposta.",
          GameErrorCode.INVALID_TARGET,
        );
      }
    }



    let skipSlotConsumption = false;
    let spellMasteryApplied = false;
    let signatureSpellApplied = false;
    try {
      const casterSheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const hasSpellMastery =
        (casterSheet as { hasSpellMastery?: boolean }).hasSpellMastery === true;
      const hasSignatureSpells =
        (casterSheet as { hasSignatureSpells?: boolean }).hasSignatureSpells ===
        true;
      if (
        hasSpellMastery &&
        (dto.slotLevel === 1 || dto.slotLevel === 2) &&
        spellData.level <= dto.slotLevel
      ) {
        skipSlotConsumption = true;
        spellMasteryApplied = true;
      } else if (
        hasSignatureSpells &&
        dto.slotLevel === 3 &&
        spellData.level <= 3
      ) {

        const usedMarkers = (participant.effectInstances ?? []).filter(
          (e) =>
            (e as unknown as { kind?: string }).kind ===
            "signature_spell_used_this_rest",
        );
        const usedSlugs = usedMarkers
          .map((m) => (m.payload as unknown as { slug?: string })?.slug)
          .filter(Boolean);
        if (!usedSlugs.includes(dto.spellSlug) && usedMarkers.length < 2) {
          skipSlotConsumption = true;
          signatureSpellApplied = true;
        }
      }
    } catch {

    }

    const castResult = await this.castSpell({
      characterId: participant.characterId,
      userId: dto.ownerUserId,
      spellSlug: dto.spellSlug,
      slotLevel: dto.slotLevel,
      targetIds: effectiveTargetIds,
      encounterId: dto.encounterId,
      ownerUserId: dto.ownerUserId,
      _skipSlotConsumption: skipSlotConsumption,
    });

    if (!castResult.ok) return castResult as any;

    const spellResult = castResult.value;
    if (isChromaticOrb && spellResult.damage) {
      spellResult.damage.type = dto.damageType!;
    }


    if (signatureSpellApplied) {
      participant.effectInstances = [
        ...(participant.effectInstances ?? []),
        {
          id: require("crypto").randomUUID(),
          kind: "signature_spell_used_this_rest",
          sourceFeatureSlug: "signature-spells",
          sourceCasterParticipantId: participant.id,
          payload: {
            slug: dto.spellSlug,
          } as unknown as import("../interfaces/combat.interfaces").EffectInstancePayload,
          expiresAt: { kind: "end_of_encounter" },
          requiresConcentration: false,
          appliedAt: new Date().toISOString(),
        } as unknown as (typeof participant.effectInstances)[number],
      ];
    }


    if (dto.asReaction) {
      participant.reactionsUsed = participant.reactionsUsed + 1;
    } else if (isBonusAction) {
      participant.bonusActionUsed = true;
    } else {
      participant.actionUsed = true;
    }


    if (metamagicAppliedType && metamagicSpCost > 0) {
      participant.sorceryPointsUsed =
        (participant.sorceryPointsUsed ?? 0) + metamagicSpCost;
    }





    const concentrationEvents: GameEventData[] = [];
    if (spellResult.concentration) {
      spellResult.previousConcentration = participant.isConcentrating
        ? (participant.concentratingOn ?? undefined)
        : undefined;
      const speedBeforeConcentrationChange =
        await this.movementService.getBaseSpeed(participant, dto.ownerUserId);
      const startResult = await this.concentration.startNew(
        participant,
        dto.spellSlug,
        normalizedSpellSlug === "hunters-mark"
          ? huntersMarkDurationRounds(
              dto.slotLevel,
              metamagicAppliedType === "extended",
            )
          : concentrationDurationRounds(
              spellData.duration,
              metamagicAppliedType === "extended",
            ),
        null,
      );
      concentrationEvents.push(...startResult.events);
      const speedAfterConcentrationChange =
        await this.movementService.getBaseSpeed(participant, dto.ownerUserId);
      if (speedAfterConcentrationChange !== speedBeforeConcentrationChange) {
        participant.movementRemaining = reconcileRemainingMovement(
          participant.movementRemaining,
          speedBeforeConcentrationChange,
          speedAfterConcentrationChange,
        );
        concentrationEvents.push({
          event_type: "movement_speed_changed",
          actor_participant_id: participant.id,
          target_participant_id: participant.id,
          data: {
            sourceSpell: spellResult.previousConcentration ?? "concentração",
            previousSpeed: speedBeforeConcentrationChange,
            newSpeed: speedAfterConcentrationChange,
            movementRemaining: participant.movementRemaining,
          },
        });
      }
      if (normalizedSpellSlug === "call-lightning") {
        let callLightningSaveDc = spellResult.saves?.[0]?.dc ?? 0;
        if (callLightningSaveDc <= 0) {
          const casterSheet = await this.sheetService.computeSheet(
            dto.ownerUserId,
            participant.characterId,
          );
          callLightningSaveDc =
            casterSheet.classes.find(
              (classBlock) => classBlock.spellSaveDc != null,
            )?.spellSaveDc ?? 13;
        }
        participant.effectInstances = [
          ...(participant.effectInstances ?? []).filter(
            (effect) => effect.kind !== "call_lightning_active",
          ),
          {
            id: require("crypto").randomUUID(),
            kind: "call_lightning_active",
            sourceSpellSlug: dto.spellSlug,
            sourceCasterParticipantId: participant.id,
            payload: {
              slotLevel: dto.slotLevel,
              saveDc: callLightningSaveDc,
              diceExpression: `${Math.max(3, dto.slotLevel)}d10`,
            },
            expiresAt: { kind: "concentration" },
            requiresConcentration: true,
            appliedAt: new Date().toISOString(),
          },
        ];
      }
    }

    const hiddenBrokenByVerbalSpell =
      (participant.conditions ?? []).includes("hidden") &&
      hasVerbalSpellComponent(spellData.components);
    if (hiddenBrokenByVerbalSpell) {
      participant.conditions = (participant.conditions ?? []).filter(
        (condition) => condition !== "hidden",
      );
    }

    await this.participantRepo.save(participant);



    const summonEvents: import("../interfaces/result.type").GameEventData[] =
      [];
    const summonMonsterSlug =
      dto.summonMonsterSlug ??
      (normalizedSpellSlug === "find-familiar"
        ? dto.summonFamiliarForm!
        : this.getSummonMonsterForSpell(dto.spellSlug, dto.slotLevel));
    if (summonMonsterSlug) {
      try {
        const spellAttackBonus =
          (
            await this.sheetService.computeSheet(
              dto.ownerUserId,
              participant.characterId,
            )
          ).classes.find(
            (classBlock) => classBlock.spellAttackBonus != null,
          )?.spellAttackBonus ?? 0;
        const summonStatBlock =
          normalizedSpellSlug === "summon-beast"
            ? buildBestialSpiritStatBlock({
                form: dto.summonBeastForm!,
                slotLevel: dto.slotLevel,
                spellAttackBonus,
              })
            : normalizedSpellSlug === "summon-elemental"
              ? buildElementalSpiritStatBlock({
                  form: dto.summonElementalForm!,
                  slotLevel: dto.slotLevel,
                  spellAttackBonus,
                })
              : undefined;
        if (normalizedSpellSlug === "find-familiar") {
          const existingFamiliars = (
            await this.summoning.getSummonsOf(participant.id)
          ).filter(
            (candidate) =>
              getSummonMetadata(candidate)?.source === "find-familiar-spell" ||
              candidate.displayName.toLowerCase().startsWith("find familiar"),
          );
          for (const existing of existingFamiliars) {
            const dismissed = await this.summoning.dismissSummon(
              existing.id,
              "form-change",
            );
            summonEvents.push(...dismissed.events);
          }
        }
        const familiarFormLabels: Record<FamiliarForm, string> = {
          bat: "Morcego",
          cat: "Gato",
          crab: "Caranguejo",
          frog: "Sapo",
          hawk: "Falcão",
          lizard: "Lagarto",
          octopus: "Polvo",
          owl: "Coruja",
          "poisonous-snake": "Cobra Venenosa",
          quipper: "Peixe",
          rat: "Rato",
          raven: "Corvo",
          "sea-horse": "Cavalo-marinho",
          spider: "Aranha",
          weasel: "Doninha",
        };
        const summon = await this.summoning.spawnSummon(dto.encounterId, {
          casterParticipantId: participant.id,
          monsterSlug: summonMonsterSlug,
          displayName:
            summonStatBlock?.kind === "bestial-spirit"
              ? `Bestial Spirit (${summonStatBlock.form === "air" ? "Ar" : summonStatBlock.form === "land" ? "Terra" : "Água"})`
              : summonStatBlock?.kind === "elemental-spirit"
                ? `Elemental Spirit (${summonStatBlock.form === "air" ? "Ar" : summonStatBlock.form === "earth" ? "Terra" : summonStatBlock.form === "fire" ? "Fogo" : "Água"})`
              : normalizedSpellSlug === "find-familiar"
                ? `Familiar ${familiarFormLabels[dto.summonFamiliarForm!]}`
              : `${dto.spellSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (${summonMonsterSlug})`,
          position:
            dto.summonPosition ??
            (participant.positionX != null && participant.positionY != null
              ? { x: participant.positionX + 1, y: participant.positionY }
              : undefined),
          faction: participant.faction ?? "ally",
          controlMode: dto.summonControlMode ?? "own-initiative",
          concentrationLinked: spellResult.concentration === true,
          concentrationBreakBehavior: this.getSummonConcentrationBreakBehavior(
            dto.spellSlug,
          ),
          durationRoundsTotal:
            normalizedSpellSlug === "find-familiar"
              ? null
              : spellResult.concentration
                ? 600
                : 60,
          source: this.getSummonSourceForSpell(dto.spellSlug),
          statBlock: summonStatBlock,
          metadata:
            normalizedSpellSlug === "find-familiar"
              ? {
                  familiarForm: dto.summonFamiliarForm,
                  familiarCreatureType: dto.summonFamiliarCreatureType,
                  cannotAttack: true,
                  telepathyRangeFt: 100,
                }
              : undefined,
        });
        summonEvents.push({
          event_type: "summon_spawned",
          actor_participant_id: participant.id,
          target_participant_id: summon.id,
          data: {
            spellSlug: dto.spellSlug,
            summonId: summon.id,
            displayName: summon.displayName,
            summonMonsterSlug,
            slotLevel: dto.slotLevel,
            summonBeastForm: dto.summonBeastForm,
            summonElementalForm: dto.summonElementalForm,
            summonFamiliarForm: dto.summonFamiliarForm,
            summonFamiliarCreatureType: dto.summonFamiliarCreatureType,
            statBlock: summonStatBlock,
          },
        });
      } catch (err) {

        const msg = err instanceof Error ? err.message : String(err);
        summonEvents.push({
          event_type: "summon_error",
          actor_participant_id: participant.id,
          data: { spellSlug: dto.spellSlug, error: msg },
        });
      }
    }


    const targetsHit: CombatSpellResult["targetsHit"] = [];
    const events = [
      ...(castResult.events ?? [])
        .filter(
          (event) =>
            !(
              event.event_type === "spell_damage" &&
              (spellData.attack_type ||
                normalizedSpellSlug === "blight" ||
                delegatesInitialDamageToTileEffect)
            ),
        )
        .map((event) => ({
          ...event,
          actor_participant_id:
            event.actor_participant_id ?? participant.id,
        })),
      ...concentrationEvents,
      ...summonEvents,
    ];
    if (hiddenBrokenByVerbalSpell) {
      events.push({
        event_type: "condition_removed",
        actor_participant_id: participant.id,
        target_participant_id: participant.id,
        data: {
          condition: "hidden",
          reason: "verbal_spell",
          spellSlug: dto.spellSlug,
        },
      });
    }
    if (!isCombatCastingTime && isQuickPlayTraining) {
      events.push({
        event_type: "casting_time_accelerated",
        actor_participant_id: participant.id,
        data: {
          spellSlug: dto.spellSlug,
          spellName: spellData.name,
          originalCastingTime: spellData.casting_time,
          reason: "quick-play-training",
        },
      });
    }


    if (metamagicAppliedType) {
      events.push({
        event_type: "metamagic_applied",
        actor_participant_id: participant.id,
        data: {
          type: metamagicAppliedType,
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
          spCost: metamagicSpCost,
          poolUsed: participant.sorceryPointsUsed ?? 0,
          ...(heightenedTargetIdForSave
            ? { heightenedTargetId: heightenedTargetIdForSave }
            : {}),
          ...(dto.metamagic?.targetExtra
            ? { targetExtra: dto.metamagic.targetExtra }
            : {}),
        },
      });
    }

    if (preparedDispelTarget) {
      const casterSheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const dispel = await this.dispelMagic.resolve({
        encounterId: dto.encounterId,
        prepared: preparedDispelTarget,
        castAtSlotLevel: dto.slotLevel,
        spellcastingModifier: getSpellcastingModifier(casterSheet),
        casterParticipantId: participant.id,
      });
      events.push(...dispel.events);
      return success(
        {
          ...spellResult,
          targetsHit: [],
          appliedEffectIds: [],
          dispelMagic: dispel.resolution,
        },
        events,
      );
    }





    const sheetForPerHit = isMultiTargetNonAoeSpell(spellData)
      ? await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        )
      : null;
    const sheetForSpellAttack = spellData.attack_type
      ? (sheetForPerHit ??
        (await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        )))
      : null;
    const spellAttackBonus =
      sheetForSpellAttack?.classes?.find(
        (classBlock: any) => classBlock.spellAttackBonus != null,
      )?.spellAttackBonus ?? 0;
    const perHitBase = sheetForPerHit
      ? getPerHitDamage(
          dto.spellSlug,
          dto.slotLevel,
          (sheetForPerHit as any)?.totalLevel ?? 0,
        )
      : null;

    let chromaticCanContinue = true;
    for (let targetIndex = 0; targetIndex < effectiveTargetIds.length; targetIndex += 1) {
      if (isChromaticOrb && targetIndex > 0 && !chromaticCanContinue) break;
      const targetId = effectiveTargetIds[targetIndex];
      let target = await this.encounterService.getParticipant(targetId);
      const targetResult: CombatSpellResult["targetsHit"][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };

      let spellAttackCritical = false;
      let damageSaveResult: {
        success: boolean;
        roll: number;
        total: number;
        dc: number;
      } | null = null;
      let damageSavingThrow:
        | SavingThrowDamageContext
        | undefined;
      if (spellData.attack_type) {
        const resolution = await this.combatService.resolveSpellAttackRoll(
          participant,
          target,
          {
            attackBonus: spellAttackBonus,
            actionName: spellData.name,
            isMelee: spellData.attack_type === "melee",
            ownerUserId: dto.ownerUserId,
          },
        );
        targetResult.attackRoll = resolution.attackRoll;
        targetResult.hit = resolution.attackRoll.hit;
        spellAttackCritical = resolution.attackRoll.critical;
        events.push(...resolution.events);
        if (!resolution.attackRoll.hit) {
          targetsHit.push(targetResult);
          if (isChromaticOrb) chromaticCanContinue = false;
          continue;
        }
      }


      let damageThisHit = 0;
      let damageType = spellResult.damage?.type ?? "force";
      if (perHitBase) {
        const rolled = this.diceService.rollExpression(perHitBase.expression);
        damageThisHit = rolled.total;
        damageType = isChromaticOrb ? dto.damageType! : perHitBase.type;
        if (isChromaticOrb) {
          targetResult.damageRolls = rolled.rolls;
          chromaticCanContinue = chromaticOrbRollCanLeap(rolled.rolls);
          targetResult.triggeredLeap =
            chromaticCanContinue &&
            targetIndex < effectiveTargetIds.length - 1 &&
            targetIndex < dto.slotLevel;
        }
      } else if (
        !delegatesInitialDamageToTileEffect &&
        spellResult.damage &&
        spellResult.damage.total > 0
      ) {
        damageThisHit = spellResult.damage.total;
        damageType = spellResult.damage.type;
      }
      const damageExpression =
        perHitBase?.expression ?? spellResult.damage?.expression;
      const blightRules =
        normalizedSpellSlug === "blight"
          ? getBlightCreatureRules(target)
          : null;
      if (blightRules?.hasNoEffect) {
        targetResult.damageRolled = damageThisHit;
        targetResult.damageDealt = 0;
        targetResult.immune = true;
        events.push({
          event_type: "spell_no_effect",
          actor_participant_id: participant.id,
          target_participant_id: target.id,
          data: {
            spellSlug: normalizedSpellSlug,
            reason: "creature_type",
            creatureType: blightRules.creatureType,
          },
        });
        targetsHit.push(targetResult);
        continue;
      }
      if (blightRules?.dealsMaximumDamage) {
        const maximumDamage = maximumDiceExpression(damageExpression);
        if (maximumDamage > 0) damageThisHit = maximumDamage;
      }
      if (spellAttackCritical && damageExpression) {
        damageThisHit +=
          this.diceService.rollExpression(damageExpression).total;
      }

      if (damageThisHit > 0) {
        let finalDamage = damageThisHit;
        targetResult.damageRolled = damageThisHit;



        if (spellData.dc && !perHitBase) {
          const dcInfo = spellData.dc as Record<string, any>;
          const rawAbility = Array.isArray(dcInfo.dc_type)
            ? dcInfo.dc_type[0]
            : (dcInfo.dc_type?.name ?? dcInfo.dc_type ?? "dexterity");
          const saveAbility = String(rawAbility).toLowerCase().substring(0, 3);
          const casterSheet = await this.sheetService.computeSheet(
            dto.ownerUserId,
            participant.characterId,
          );
          const casterClass = casterSheet.classes?.find(
            (c: any) => c.spellSaveDc != null,
          );
          const spellSaveDc = casterClass?.spellSaveDc ?? 13;


          const heightenedDisadvantage =
            metamagicAppliedType === "heightened" &&
            heightenedTargetIdForSave === targetId;
          const forcedDisadvantage =
            heightenedDisadvantage ||
            blightRules?.saveHasDisadvantage === true;
          const saveResult = await this.rollMonsterOrPcSave(
            target,
            saveAbility,
            spellSaveDc,
            dto.ownerUserId,
            forcedDisadvantage,
          );
          damageSaveResult = saveResult;
          events.push({
            event_type: "save_rolled",
            actor_participant_id: participant.id,
            target_participant_id: target.id,
            data: {
              spellSlug: normalizedSpellSlug,
              ability: saveAbility,
              dc: spellSaveDc,
              roll: saveResult.roll,
              modifier: saveResult.total - saveResult.roll,
              total: saveResult.total,
              success: saveResult.success,
              advantage: saveResult.advantage,
              hasAdvantage: saveResult.hasAdvantage,
              hasDisadvantage: saveResult.hasDisadvantage,
              advantageCancelled: saveResult.advantageCancelled,
            },
          });
          const dcSuccess = dcInfo.dc_success ?? "half";
          damageSavingThrow = {
            ability: saveAbility,
            success: saveResult.success,
            halfDamageOnSuccess: dcSuccess === "half",
          };
          if (saveResult.success) {
            if (dcSuccess === "half") {
              finalDamage = Math.floor(finalDamage / 2);
            } else if (dcSuccess === "none") {
              finalDamage = 0;
            }
            targetResult.savedSuccessfully = true;
          }
        }

        const dmgResult = await this.combatService.applyDamage(
          dto.encounterId,
          {
            targetParticipantId: targetId,
            amount: finalDamage,
            damageType,
            ownerUserId: dto.ownerUserId,
            savingThrow: damageSavingThrow,
          },
          { emitEvents: false },
        );

        if (dmgResult.ok) {
          events.push(...(dmgResult.events ?? []));
          targetResult.damageDealt = dmgResult.value.damageApplied;
          targetResult.resisted = dmgResult.value.resisted;
          targetResult.immune = dmgResult.value.immune;
          targetResult.vulnerable = dmgResult.value.vulnerable;
          targetResult.defeated = dmgResult.value.defeated;

          if (
            shouldDisintegrateTarget({
              spellSlug: normalizedSpellSlug,
              hpBefore: target.currentHp ?? 0,
              hpAfter: dmgResult.value.hpAfter,
              damageApplied: dmgResult.value.damageApplied,
            })
          ) {
            const freshTarget =
              await this.encounterService.getParticipant(targetId);

            if (freshTarget.type === "pc" && freshTarget.characterId) {
              await this.characterStateService.updateDeathSaves(
                dto.ownerUserId,
                freshTarget.characterId,
                { failuresDelta: 3 },
              );
            }

            freshTarget.currentHp = 0;
            freshTarget.dyingState = "dead";
            freshTarget.isDefeated = true;
            freshTarget.effectInstances = [
              ...(freshTarget.effectInstances ?? []).filter(
                (effect) => effect.kind !== "disintegrated",
              ),
              {
                id: require("crypto").randomUUID(),
                sourceSpellSlug: normalizedSpellSlug,
                sourceCasterParticipantId: participant.id,
                kind: "disintegrated",
                payload: {},
                expiresAt: { kind: "end_of_encounter" },
                requiresConcentration: false,
                appliedAt: new Date().toISOString(),
              },
            ];
            await this.participantRepo.save(freshTarget);

            targetResult.defeated = true;
            events.push({
              event_type: "target_disintegrated",
              actor_participant_id: participant.id,
              target_participant_id: target.id,
              data: {
                spell: spellData.name,
                nonmagicalEquipmentDisintegrated: true,
                revivalRequires: ["true-resurrection", "wish"],
              },
            });
          }

          // applyDamage persists the participant independently. Any later
          // condition or forced-movement mutation must start from that fresh
          // row, otherwise saving the pre-damage entity restores stale HP.
          target = await this.encounterService.getParticipant(targetId);
        }
        if (normalizedSpellSlug === "blight") {
          events.push({
            event_type: "spell_damage",
            actor_participant_id: participant.id,
            target_participant_id: target.id,
            data: {
              spell: spellData.name,
              expression: damageExpression,
              total: damageThisHit,
              type: damageType,
              slot_level: dto.slotLevel,
              maximized: blightRules?.dealsMaximumDamage === true,
              source: "spell-save",
            },
          });
        }
        if (spellData.attack_type) {
          events.push({
            event_type: "spell_damage",
            actor_participant_id: participant.id,
            target_participant_id: target.id,
            data: {
              spell: spellData.name,
              expression: damageExpression,
              total: damageThisHit,
              type: damageType,
              slot_level: dto.slotLevel,
              critical: spellAttackCritical,
              ...(isChromaticOrb
                ? {
                    rolls: targetResult.damageRolls,
                    triggeredLeap: targetResult.triggeredLeap,
                  }
                : {}),
              source: "spell-attack",
            },
          });
        }
      }


      if (spellResult.healing && spellResult.healing.total > 0) {
        const healingResult = await this.combatService.applyHealing(dto.encounterId, {
          targetParticipantId: targetId,
          amount: spellResult.healing.total,
          maximumAmount: maximumDiceExpression(spellResult.healing.expression),
          sourceSpellSlug: normalizedSpellSlug,
          ownerUserId: dto.ownerUserId,
        });
        if (healingResult.ok) {
          targetResult.healingApplied = healingResult.value.healingApplied;
          targetResult.healingPrevented =
            healingResult.value.healingPrevented;
          targetResult.healingMaximized =
            healingResult.value.healingMaximized;

          await this.combatService.resolveFaithfulSteedLifeBond(
            dto.encounterId,
            {
              casterParticipantId: targetId,
              healingFromSpell: healingResult.value.healingApplied,
              spellLevel: spellData.level,
              spellSlug: normalizedSpellSlug,
              ownerUserId: dto.ownerUserId,
            },
          );

          // Keep subsequent condition removal (notably Heal) from saving the
          // participant snapshot captured before healing.
          target = await this.encounterService.getParticipant(targetId);
        }

        if (normalizedSpellSlug === "heal") {
          for (const conditionSlug of ["blinded", "deafened"] as const) {
            const matchingInstances = (target.conditionInstances ?? []).filter(
              (instance) => instance.slug === conditionSlug,
            );
            for (const instance of matchingInstances) {
              const removed =
                await this.conditionLifecycle.removeConditionInstance(
                  target,
                  instance.id,
                  "manual",
                );
              events.push(...removed.events);
            }
            if (
              matchingInstances.length === 0 &&
              (target.conditions ?? []).includes(conditionSlug)
            ) {
              target.conditions = (target.conditions ?? []).filter(
                (condition) => condition !== conditionSlug,
              );
              await this.participantRepo.save(target);
              events.push({
                event_type: "condition_removed",
                actor_participant_id: participant.id,
                target_participant_id: target.id,
                data: {
                  condition: conditionSlug,
                  reason: "spell:heal",
                },
              });
            }
          }
        }
      }


      const condEntry = getSpellCondition(normalizedSpellSlug);
      if (condEntry && normalizedSpellSlug !== "web") {
        const sheet = await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        );
        const casterClass = (sheet as any).classes?.find(
          (c: any) => c.spellSaveDc != null,
        );
        const spellSaveDc: number = casterClass?.spellSaveDc ?? 13;

        let saveResult = damageSaveResult;
        if (!saveResult) {
          const conditionSaveResult = await this.rollMonsterOrPcSave(
            target,
            condEntry.saveAbility,
            spellSaveDc,
            dto.ownerUserId,
          );
          saveResult = conditionSaveResult;
          events.push({
            event_type: "save_rolled",
            actor_participant_id: participant.id,
            target_participant_id: target.id,
            data: {
              spellSlug: normalizedSpellSlug,
              ability: condEntry.saveAbility,
              dc: spellSaveDc,
              roll: conditionSaveResult.roll,
              modifier:
                conditionSaveResult.total - conditionSaveResult.roll,
              total: conditionSaveResult.total,
              success: conditionSaveResult.success,
              advantage: conditionSaveResult.advantage,
              hasAdvantage: conditionSaveResult.hasAdvantage,
              hasDisadvantage: conditionSaveResult.hasDisadvantage,
              advantageCancelled:
                conditionSaveResult.advantageCancelled,
              ...(normalizedSpellSlug === "blindness-deafness"
                ? { conditionChoice: dto.conditionChoice }
                : {}),
            },
          });
        }
        if (!saveResult.success) {
          const conditionSlug = resolveSpellConditionSlug(
            normalizedSpellSlug,
            condEntry.conditionSlug,
            dto.conditionChoice,
          )!;
          const condResult = await this.conditionLifecycle.applyCondition(
            target,
            {
              slug: conditionSlug,
              appliedBy: participant.id,
              sourceSpell: dto.spellSlug,
              sourceConcentration: condEntry.requiresConcentration,
              saveAbility: condEntry.saveAbility,
              saveDc: spellSaveDc,
              repeatSaveTiming: condEntry.repeatSaveTiming,
              durationRoundsRemaining: condEntry.durationRounds,
              level: dto.slotLevel,
            },
          );
          events.push(...condResult.events);
          targetResult.conditionApplied = {
            instanceId: condResult.instance.id,
            slug: condResult.instance.slug,
            durationRoundsRemaining: condEntry.durationRounds,
          };
        } else {
          targetResult.savedSuccessfully = true;
        }
      }

      if (
        normalizedSpellSlug === "thunderwave" &&
        damageSaveResult &&
        !damageSaveResult.success &&
        !targetResult.defeated
      ) {
        const forcedMovement = await this.pushTargetAwayFromCaster(
          encounter,
          participant,
          target,
          10,
          events,
        );
        if (forcedMovement) {
          targetResult.forcedMovement = forcedMovement;
          events.push({
            event_type: "movement_forced",
            actor_participant_id: participant.id,
            target_participant_id: target.id,
            data: {
              sourceSpell: normalizedSpellSlug,
              from: forcedMovement.from,
              to: forcedMovement.to,
              distanceFt: forcedMovement.distanceFt,
            },
          });
        }
      }

      targetsHit.push(targetResult);
    }

    if (normalizedSpellSlug === "witch-bolt" && effectiveTargetIds[0]) {
      const tetherTarget = await this.encounterService
        .getParticipant(effectiveTargetIds[0])
        .catch(() => null);
      const targetResult = targetsHit.find(
        (candidate) => candidate.participantId === effectiveTargetIds[0],
      );
      if (tetherTarget && !targetResult?.defeated) {
        const tether = createWitchBoltTether(
          tetherTarget.id,
          tetherTarget.displayName,
          encounter.currentRound,
        );
        participant.appliedEffects = [
          ...(participant.appliedEffects ?? []).filter(
            (effect) => effect.metadata?.type !== "witch-bolt-tether",
          ),
          tether,
        ];
        await this.participantRepo.update(participant.id, {
          appliedEffects: participant.appliedEffects as never,
        });
        events.push({
          event_type: "witch_bolt_tethered",
          actor_participant_id: participant.id,
          target_participant_id: tetherTarget.id,
          data: {
            spellSlug: "witch-bolt",
            targetName: tetherTarget.displayName,
            initialAttackHit: targetResult?.hit === true,
            rangeFt: 60,
          },
        });
      } else if (targetResult?.defeated) {
        const freshCaster = await this.encounterService.getParticipant(
          participant.id,
        );
        const breakResult = await this.concentration.break(
          freshCaster,
          "expired",
        );
        events.push(...breakResult.events);
      }
    }


    const casterDex =
      spellResult && (spellResult as any).casterDex != null
        ? (spellResult as any).casterDex
        : await this.getCasterDexModifier(participant, dto.ownerUserId);
    const effectEligibleTargetIds = spellData.attack_type
      ? Array.from(
          new Set(
            targetsHit
              .filter((target) => target.hit)
              .map((target) => target.participantId),
          ),
        )
      : effectiveTargetIds;
    const targetDexModifiers: Record<string, number> = {};
    for (const targetId of effectEligibleTargetIds) {
      const targetParticipant =
        targetMeta.find((target) => target.id === targetId)?.participant ??
        (targetId === participant.id ? participant : null);
      if (!targetParticipant) continue;
      targetDexModifiers[targetId] = await this.getParticipantDexModifier(
        targetParticipant,
        dto.ownerUserId,
      );
    }
    const materializations = materializeSpellEffects(dto.spellSlug, {
      casterParticipantId: participant.id,
      targetParticipantIds: effectEligibleTargetIds,
      slotLevel: dto.slotLevel,
      casterDexModifier: casterDex,
      targetDexModifiers,
    });
    const appliedEffectIds: string[] = [];
    const cleanedSpellEffectTargets = new Set<string>();
    for (const m of materializations) {
      const targetP = await this.encounterService
        .getParticipant(m.targetParticipantId)
        .catch(() => null);
      if (!targetP) continue;
      const movementSpeedBefore = await this.movementService.getBaseSpeed(
        targetP,
        dto.ownerUserId,
      );
      const cleanupKey = [
        m.targetParticipantId,
        m.input.sourceSpellSlug ?? "",
      ].join(":");
      if (!cleanedSpellEffectTargets.has(cleanupKey)) {
        const previousSameCast = (targetP.effectInstances ?? []).filter(
          (effect) =>
            effect.sourceSpellSlug === m.input.sourceSpellSlug,
        );
        for (const previous of previousSameCast) {
          const removed = await this.effectInstanceService.removeEffect(
            targetP,
            previous.id,
            "manual",
          );
          events.push(...removed.events);
        }
        cleanedSpellEffectTargets.add(cleanupKey);
      }
      const { effect, events: effectEvents, applied } =
        await this.effectInstanceService.addEffect(targetP, {
          ...m.input,
          payload: {
            ...m.input.payload,
            slotLevel: m.input.payload.slotLevel ?? dto.slotLevel,
          },
        });
      if (applied) appliedEffectIds.push(effect.id);
      events.push(...effectEvents);
      if (m.input.kind === "freedom_of_movement") {
        let releasedConditionCount = 0;
        for (const condition of (targetP.conditionInstances ?? []).filter(
          isMagicalMobilityCondition,
        )) {
          const removed =
            await this.conditionLifecycle.removeConditionInstance(
              targetP,
              condition.id,
              "freedom_of_movement",
            );
          if (removed.removed) releasedConditionCount += 1;
          events.push(...removed.events);
        }
        let blockedSpeedReductionCount = 0;
        for (const reduction of (targetP.effectInstances ?? []).filter(
          isMagicalSpeedReduction,
        )) {
          const removed = await this.effectInstanceService.removeEffect(
            targetP,
            reduction.id,
            "manual",
          );
          if (removed.removed) blockedSpeedReductionCount += 1;
          events.push(...removed.events);
        }
        events.push({
          event_type: "freedom_of_movement_applied",
          actor_participant_id: participant.id,
          target_participant_id: targetP.id,
          data: {
            spellSlug: "freedom-of-movement",
            slotLevel: dto.slotLevel,
            durationRounds: 600,
            swimSpeedEqualsSpeed: true,
            releasedConditionCount,
            blockedSpeedReductionCount,
          },
        });
      }
      if (
        m.input.kind === "flight_speed" ||
        m.input.kind === "speed_multiplier" ||
        m.input.kind === "freedom_of_movement"
      ) {
        const movementSpeedAfter = await this.movementService.getBaseSpeed(
          targetP,
          dto.ownerUserId,
        );
        const speedDelta = movementSpeedAfter - movementSpeedBefore;
        if (speedDelta !== 0) {
          targetP.movementRemaining = reconcileRemainingMovement(
            targetP.movementRemaining,
            movementSpeedBefore,
            movementSpeedAfter,
          );
          await this.participantRepo.save(targetP);
          events.push({
            event_type: "movement_speed_changed",
            actor_participant_id: participant.id,
            target_participant_id: targetP.id,
            data: {
              sourceSpell: dto.spellSlug,
              previousSpeed: movementSpeedBefore,
              newSpeed: movementSpeedAfter,
              movementRemaining: targetP.movementRemaining,
            },
          });
        }
      }
    }







    const slugNorm = normalizedSpellSlug;
    const tileDef = tileEffectDefinition;
    const casterAfterTargetEffects = tileDef?.sourceConcentration
      ? await this.encounterService.getParticipant(participant.id)
      : participant;
    const concentrationAreaCanPersist =
      !tileDef?.sourceConcentration ||
      concentrationSupportsSpell(
        casterAfterTargetEffects,
        normalizedSpellSlug,
      );
    if (tileDef?.sourceConcentration && !concentrationAreaCanPersist) {
      spellResult.concentration = false;
    }
    if (
      tileDef &&
      concentrationAreaCanPersist &&
      participant.positionX != null &&
      participant.positionY != null
    ) {


      const originCell = tileDef.auraFollowsCaster
        ? { x: participant.positionX, y: participant.positionY }
        : (effectiveOriginCell ?? dto.aoeOriginCell ?? {
            x: participant.positionX,
            y: participant.positionY,
          });


      let saveDc = 13;
      if (participant.type === "pc" && participant.characterId) {
        try {
          const s = await this.sheetService.computeSheet(
            dto.ownerUserId,
            participant.characterId,
          );
          const casterClass = (
            s as { classes?: Array<{ spellSaveDc?: number }> }
          ).classes?.find((c) => c.spellSaveDc != null);
          if (casterClass?.spellSaveDc != null)
            saveDc = casterClass.spellSaveDc;
        } catch {

        }
      }

      const tileEffectKind = tileDef.spellSlug as TileEffectKind;
      if (tileDef.sourceConcentration) {
        const staleAreaCleanup =
          await this.persistentArea.removeByCasterConcentrationBreak(
            participant.id,
            "concentration_replaced",
          );
        events.push(...staleAreaCleanup.events);
      }
      if (normalizedSpellSlug === "spiritual-weapon") {
        const recastCleanup = await this.persistentArea.removeByCasterAndSpell(
          participant.id,
          "spiritual-weapon",
          "recast",
        );
        events.push(...recastCleanup.events);
      }
      const area = await this.persistentArea.createFromCatalog({
        encounterId: dto.encounterId,
        casterParticipantId: participant.id,
        spellSlug: tileEffectKind,
        slotLevel: dto.slotLevel ?? 1,
        originCell,
        saveDc,
        casterFaction: participant.faction,
        currentRound: encounter.currentRound,
        ...(normalizedSpellSlug === "spiritual-weapon"
          ? {
              damageDiceOverride: spellResult.damage?.expression ?? "",
              damageTypeOverride: "force",
            }
          : {}),
        ...(normalizedSpellSlug === "conjure-elemental" && dto.damageType
          ? {
              damageTypeOverride: dto.damageType as
                | "cold"
                | "fire"
                | "lightning"
                | "thunder",
            }
          : {}),
      });

      events.push({
        event_type: "tile_effect_created",
        actor_participant_id: participant.id,
        data: {
          areaId: area.id,
          sourceSpell: slugNorm,
          effectKind: area.effectKind,
          originCell: area.originCell,
          shapeKind: area.shapeKind,
          radiusCells: area.radiusCells,
          durationRoundsRemaining: area.durationRoundsRemaining,
          isDifficultTerrain: area.isDifficultTerrain,
          speedMultiplier: area.speedMultiplier,
          saveDc: area.saveDc,
          saveAbility: area.saveAbility,
          narrativeDescriptor: area.narrativeDescriptor,
          tactical: area.tacticalMetadata,
          damageDice: area.damageDice,
          damageType: area.damageType,
        },
      });




      const allParticipants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      const inArea = allParticipants.filter(
        (p) =>
          p.id !== participant.id &&
          p.positionX != null &&
          p.positionY != null &&
          this.persistentArea.cellInArea(p.positionX, p.positionY, area),
      );
      const onCastRes = await this.persistentArea.resolveOnCast(
        area,
        inArea,
        async (ability, target) => ({
          modifier: target
            ? await this.getTargetSaveModifier(
                target,
                ability,
                dto.ownerUserId,
              )
            : 0,
        }),
        `${encounter.currentRound}:${encounter.currentTurnIndex}`,
      );
      if (
        tileDef.triggers.some(
          (trigger) => trigger.kind === "on-cast" && trigger.oncePerTurn,
        )
      ) {
        await Promise.all(
          inArea.map((target) =>
            this.participantRepo.update(target.id, {
              effectInstances: target.effectInstances,
            }),
          ),
        );
      }
      if (inArea.length > 0) {
        await this.participantRepo.save(inArea);
      }
      events.push(...onCastRes.events);
      events.push(
        ...(await this.combatService.applyPersistentAreaDamageEvents(
          dto.encounterId,
          onCastRes.events,
          dto.ownerUserId,
        )),
      );






    }





    if (slugNorm === "polymorph") {
      const encounterRound =
        (await this.encounterRepo.findOne({ where: { id: dto.encounterId } }))
          ?.currentRound ?? 0;
      const beastSlug = dto.polymorphBeastSlug ?? "brown-bear";


      const casterSheet = await this.sheetService
        .computeSheet(dto.ownerUserId, participant.characterId)
        .catch(() => null as any);
      const casterClass = casterSheet?.classes?.find(
        (c: any) => c.spellSaveDc != null,
      );
      const spellSaveDc: number = casterClass?.spellSaveDc ?? 13;

      for (const targetId of effectiveTargetIds) {

        const isSelf = targetId === participant.id;
        const target = await this.encounterService
          .getParticipant(targetId)
          .catch(() => null);
        if (!target) continue;


        if (target.transformationState) {
          events.push({
            event_type: "polymorph_rejected",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { reason: "already_transformed" },
          });
          continue;
        }

        let savedSuccessfully = false;
        if (!isSelf) {
          const saveResult = await this.rollMonsterOrPcSave(
            target,
            "wis",
            spellSaveDc,
            dto.ownerUserId,
          );
          savedSuccessfully = saveResult.success;
          events.push({
            event_type: "polymorph_save",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: {
              ability: "wis",
              dc: spellSaveDc,
              success: savedSuccessfully,
              total: saveResult.total,
            },
          });
          const hit = targetsHit.find((th) => th.participantId === targetId);
          if (hit) hit.savedSuccessfully = savedSuccessfully;
        }

        if (savedSuccessfully) continue;

        try {
          await this.transformation.enterForm(targetId, {
            source: "polymorph-spell",
            monsterSlug: beastSlug,
            durationRoundsTotal: 600,
            revertTriggers: {
              hpZero: true,
              concentrationBroken: true,
              durationEnd: true,
              playerDismiss: true,
            },
            currentEncounterRound: encounterRound,
            sourceCasterParticipantId: participant.id,
          });
          events.push({
            event_type: "polymorph_applied",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { beastSlug, durationRounds: 600, source: "polymorph-spell" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          events.push({
            event_type: "polymorph_failed",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { beastSlug, reason: msg },
          });
        }
      }
    }



    let retroactiveReview: any = undefined;
    if (
      dto.asReaction &&
      dto.triggerEventId &&
      dto.spellSlug.toLowerCase().replace(/-(phb|xphb)$/, "") === "shield"
    ) {
      retroactiveReview = await this.recomputeShieldTrigger(
        dto.encounterId,
        dto.triggerEventId,
        participant.id,
        dto.ownerUserId,
      );
      if (retroactiveReview?.events) {
        events.push(...retroactiveReview.events);
      }
    }

    if (touchDeliveryFamiliar) {
      touchDeliveryFamiliar.reactionsUsed =
        (touchDeliveryFamiliar.reactionsUsed ?? 0) + 1;
      await this.participantRepo.save(touchDeliveryFamiliar);
      events.push({
        event_type: "familiar_touch_spell_delivered",
        actor_participant_id: participant.id,
        target_participant_id: effectiveTargetIds[0],
        data: {
          familiarParticipantId: touchDeliveryFamiliar.id,
          familiarName: touchDeliveryFamiliar.displayName,
          spellSlug: dto.spellSlug,
          reactionUsed: true,
        },
      });
    }

    if (spellMasteryApplied) {
      events.push({
        event_type: "spell_mastery_free_cast",
        actor_participant_id: participant.id,
        data: {
          featureSlug: "spell-mastery",
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
        },
      });
    }
    if (signatureSpellApplied) {
      events.push({
        event_type: "signature_spell_free_cast",
        actor_participant_id: participant.id,
        data: {
          featureSlug: "signature-spells",
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
        },
      });
    }

    return success(
      {
        ...spellResult,
        targetsHit,
        appliedEffectIds,
        retroactiveReview,
      } as any,
      events,
    );
  }


  private async rollbackAttackBoundEffects(
    encounterId: string,
    trigger: GameEventEntity,
  ): Promise<{ removedEffectIds: string[]; events: GameEventData[] }> {
    const data = trigger.data as {
      attackBoundEffectRefs?: Array<{
        participantId?: unknown;
        effectId?: unknown;
        sourceFeatureSlug?: unknown;
      }>;
    };
    const refs = Array.isArray(data.attackBoundEffectRefs)
      ? data.attackBoundEffectRefs
      : [];
    const removedEffectIds: string[] = [];
    const events: GameEventData[] = [];

    for (const ref of refs) {
      const participantId =
        typeof ref.participantId === "string" ? ref.participantId : null;
      const effectId = typeof ref.effectId === "string" ? ref.effectId : null;
      const sourceFeatureSlug =
        ref.sourceFeatureSlug === "colossus-slayer" ||
        ref.sourceFeatureSlug === "multiattack-defense"
          ? ref.sourceFeatureSlug
          : null;
      if (!participantId || !effectId || !sourceFeatureSlug) continue;

      const expectedParticipantId =
        sourceFeatureSlug === "colossus-slayer"
          ? trigger.actorParticipantId
          : trigger.targetParticipantId;
      if (!expectedParticipantId || participantId !== expectedParticipantId) {
        continue;
      }

      const participant = await this.participantRepo.findOne({
        where: { id: participantId, encounterId },
      });
      if (!participant) continue;
      const effect = (participant.effectInstances ?? []).find(
        (candidate) => candidate.id === effectId,
      );
      const matchesFeature =
        sourceFeatureSlug === "colossus-slayer"
          ? effect?.kind === "colossus_slayer_used_this_turn" &&
            effect.sourceFeatureSlug === "colossus-slayer"
          : effect?.kind === "ac_bonus" &&
            effect.sourceFeatureSlug === "multiattack-defense" &&
            effect.payload?.attackerParticipantId ===
              trigger.actorParticipantId;
      if (!effect || !matchesFeature) continue;

      const removed = await this.effectInstanceService.removeEffect(
        participant,
        effect.id,
        "trigger_invalidated",
      );
      if (!removed.removed) continue;
      removedEffectIds.push(effect.id);
      events.push(...removed.events);
    }

    return { removedEffectIds, events };
  }

  private async recomputeShieldTrigger(
    encounterId: string,
    triggerEventId: string,
    casterParticipantId: string,
    ownerUserId: string,
  ): Promise<{
    newHit: boolean;
    previousHit: boolean;
    damageReverted: number;
    attackBoundEffectsReverted: string[];
    events: any[];
  } | null> {
    const trigger = await this.gameEventRepo.findOne({
      where: { id: triggerEventId },
    });
    if (
      !trigger ||
      trigger.eventType !== "attack_roll" ||
      trigger.encounterId !== encounterId ||
      trigger.targetParticipantId !== casterParticipantId
    ) {
      return null;
    }
    const data = trigger.data as any;
    const prevHit: boolean = data.hit ?? false;
    const prevTotal: number = data.total ?? 0;
    const prevAc: number = data.targetAc ?? 10;
    const newAc = prevAc + 5;
    const newHit =
      prevHit &&
      (data.roll === 20 ||
        (prevTotal >= newAc && !data.criticalMiss));
    const events: any[] = [
      {
        event_type: "shield_retroactive_review",
        actor_participant_id: casterParticipantId,
        target_participant_id: trigger.targetParticipantId,
        data: {
          triggerEventId,
          previousHit: prevHit,
          previousAc: prevAc,
          newAc,
          newHit,
          attackRollTotal: prevTotal,
        },
      },
    ];

    let damageReverted = 0;
    let attackBoundEffectsReverted: string[] = [];
    if (prevHit && !newHit) {
      const rolledBackEffects = await this.rollbackAttackBoundEffects(
        encounterId,
        trigger,
      );
      attackBoundEffectsReverted =
        rolledBackEffects.removedEffectIds;
      events.push(...rolledBackEffects.events);



      const hpChange = await this.gameEventRepo
        .createQueryBuilder("e")
        .where("e.encounterId = :encId", { encId: encounterId })
        .andWhere("e.eventType IN ('damage_applied', 'hp_change')")
        .andWhere("e.targetParticipantId = :tid", {
          tid: trigger.targetParticipantId,
        })
        .andWhere("e.sequence >= :seq", { seq: trigger.sequence })
        .orderBy("e.sequence", "ASC")
        .limit(1)
        .getOne();
      if (hpChange) {
        const d = hpChange.data as any;
        const dmg =
          d?.damage?.finalDamage ??
          d?.damage?.total ??
          (typeof d?.damage === "number" ? d.damage : undefined) ??
          d?.finalDamage ??
          d?.total ??
          d?.amount ??
          0;
        if (dmg > 0) {

          await this.combatService.applyHealing(encounterId, {
            targetParticipantId: trigger.targetParticipantId!,
            amount: dmg,
            ownerUserId,
          });
          damageReverted = dmg;
          events.push({
            event_type: "shield_damage_reverted",
            target_participant_id: trigger.targetParticipantId,
            data: { amount: dmg, triggerEventId },
          });
        }
      }
    }
    return {
      newHit,
      previousHit: prevHit,
      damageReverted,
      attackBoundEffectsReverted,
      events,
    };
  }


  private async isTargetWearingArmor(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<boolean> {
    if (participant.type === "pc" && participant.characterId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        const equip = (sheet as any)?.equipment ?? [];
        for (const eq of equip) {
          if (!eq.equipped || !eq.armorClass) continue;
          const slug = (eq.slug ?? "").toLowerCase();
          const name = (eq.name ?? "").toLowerCase();
          if (slug === "shield" || name === "shield") continue;
          const base = eq.armorClass?.base ?? 0;
          if (base > 0) return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    return participant.type === "monster";
  }


  private async getCasterDexModifier(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<number> {
    return this.getParticipantDexModifier(participant, ownerUserId);
  }

  private async getParticipantDexModifier(
    participant: EncounterParticipantEntity,
    fallbackUserId: string,
  ): Promise<number> {
    if (participant.type === "pc" && participant.characterId) {
      const ownerUserId = await this.encounterService.resolveCharacterOwner(
        participant.characterId,
        fallbackUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        ownerUserId,
        participant.characterId,
      );
      const dexBlock = (sheet?.abilityScores ?? []).find(
        (a) => a.slug === "dex" || a.slug === "dexterity",
      );
      if (dexBlock) return dexBlock.modifier;
      return 0;
    }
    const dex = (participant.monster as any)?.stats?.dex ?? 10;
    return getAbilityModifier(dex);
  }


  private async castMonsterSpellInCombat(
    dto: CastSpellInCombatDto,
    participant: EncounterParticipantEntity,
    encounter: EncounterEntity,
  ): Promise<GameResult<CombatSpellResult>> {
    const sc = (participant.monster as any)?.spellcasting;
    if (!sc) return failure("Este monstro não possui magia.", "INVALID_SPELL");

    const check = this.monsterSpellcasting.canCast(
      participant,
      dto.spellSlug,
      dto.slotLevel,
    );
    if (!check.allowed) {
      return failure(
        check.message ?? "Não pode lançar esta magia.",
        check.code ?? "INVALID_SPELL",
      );
    }

    let spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {
      spell = await this.spellRepo.findOne({ where: { name: dto.spellSlug } });
    }
    if (!spell) {
      return failure(
        `Magia '${dto.spellSlug}' nao encontrada.`,
        "INVALID_SPELL",
      );
    }

    const castingTime = (spell.casting_time ?? "action").toLowerCase();
    const isBonusAction = castingTime.includes("bonus");
    if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure(
          "Bonus action ja utilizada neste turno.",
          "NO_BONUS_ACTION_AVAILABLE",
        );
    } else {
      if (participant.actionUsed)
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      participant,
      isBonusAction ? "bonus" : "action",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }


    const damageInfo: any = (spell as any).damage ?? {};
    const rawDt = damageInfo?.damage_type as unknown;
    const damageType: string =
      (typeof rawDt === "object" && rawDt !== null && "name" in rawDt
        ? String((rawDt as { name: string }).name).toLowerCase()
        : Array.isArray(rawDt)
          ? String(rawDt[0] ?? "").toLowerCase()
          : typeof rawDt === "string"
            ? rawDt.toLowerCase()
            : null) ?? "force";

    let damageExpression: string | undefined;
    if (damageInfo.damage_at_slot_level) {
      damageExpression = damageInfo.damage_at_slot_level[String(dto.slotLevel)];
    } else if (damageInfo.damage_at_character_level) {
      damageExpression =
        damageInfo.damage_at_character_level[String(sc.casterLevel ?? 1)];
    }

    const concentration = Boolean((spell as any).concentration);
    const saveAbility = this.resolveSaveAbility(spell);

    const baseRoll = damageExpression
      ? this.diceService.rollExpression(damageExpression)
      : null;

    const events: GameEventData[] = [];
    events.push({
      event_type: "spell_cast",
      actor_participant_id: participant.id,
      data: {
        spellSlug: dto.spellSlug,
        spellName: spell.name,
        slotLevel: dto.slotLevel,
        casterType: "monster",
        saveDc: sc.saveDc,
      },
    });

    const targetsHit: CombatSpellResult["targetsHit"] = [];

    for (const targetId of dto.targetParticipantIds) {
      const target = await this.encounterService.getParticipant(targetId);
      const entry: CombatSpellResult["targetsHit"][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };

      if (baseRoll) {
        let finalDamage = baseRoll.total;
        let savingThrow: SavingThrowDamageContext | undefined;
        if (saveAbility) {
          if (target.type === "pc" && target.characterId) {
            const saveRes = await this.savingThrowService.rollSavingThrow({
              characterId: target.characterId,
              ability: saveAbility,
              dc: sc.saveDc,
              userId: dto.ownerUserId,
              participantId: target.id,
            });
            if (saveRes.ok && saveRes.value?.success) {
              finalDamage = Math.floor(finalDamage / 2);
              entry.savedSuccessfully = true;
            }
            if (saveRes.ok && saveRes.value) {
              savingThrow = {
                ability: saveAbility,
                success: saveRes.value.success,
                halfDamageOnSuccess: true,
              };
            }
          }
        }

        const dmg = await this.combatService.applyDamage(dto.encounterId, {
          targetParticipantId: targetId,
          amount: finalDamage,
          damageType,
          ownerUserId: dto.ownerUserId,
          savingThrow,
        });
        entry.damageDealt = finalDamage;
        if (dmg.ok) entry.defeated = dmg.value.defeated;
      }

      targetsHit.push(entry);
    }

    this.monsterSpellcasting.debit(participant, dto.spellSlug, dto.slotLevel);

    if (isBonusAction) participant.bonusActionUsed = true;
    else participant.actionUsed = true;

    if (concentration) {

      participant.isConcentrating = true;
      participant.concentratingOn = spell.slug;
    }

    await this.participantRepo.save(participant);

    const result: CombatSpellResult = {
      spellName: spell.name,
      spellLevel: dto.slotLevel,
      slotUsed: sc.type === "standard" ? dto.slotLevel : 0,
      concentration,
      damage: baseRoll
        ? {
            expression: damageExpression ?? "",
            total: baseRoll.total,
            type: damageType,
          }
        : undefined,
      targetsHit,
    };

    return success(result, events);
  }

  private resolveSaveAbility(spell: SpellEntity): string | null {
    const dc = (spell as any).dc;
    if (!dc) return null;
    const ability = dc.dc_type?.name ?? dc.dc_type ?? null;
    if (typeof ability !== "string") return null;
    return ability.toLowerCase().substring(0, 3);
  }

  private async pushTargetAwayFromCaster(
    encounter: EncounterEntity,
    caster: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    distanceFt: number,
    events: GameEventData[],
  ): Promise<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    distanceFt: number;
  } | null> {
    if (
      caster.positionX == null ||
      caster.positionY == null ||
      target.positionX == null ||
      target.positionY == null
    ) {
      return null;
    }
    const from = { x: target.positionX, y: target.positionY };
    const participants = await this.participantRepo.find({
      where: { encounterId: encounter.id, isDefeated: false },
    });
    const occupied = new Set(
      participants
        .filter(
          (participant) =>
            participant.id !== target.id &&
            participant.positionX != null &&
            participant.positionY != null,
        )
        .map(
          (participant) =>
            `${participant.positionX as number},${participant.positionY as number}`,
        ),
    );
    const destination = getForcedPushDestination({
      caster: { x: caster.positionX, y: caster.positionY },
      target: from,
      distanceCells: Math.max(1, Math.floor(distanceFt / 5)),
      bounds: {
        cols:
          encounter.mapData?.gridColumns ??
          encounter.mapData?.gridSize ??
          20,
        rows:
          encounter.mapData?.gridRows ??
          encounter.mapData?.gridSize ??
          20,
      },
      occupied,
    });
    if (destination.x === from.x && destination.y === from.y) return null;

    target.positionX = destination.x;
    target.positionY = destination.y;
    // Damage is persisted before forced movement. Saving the participant entity
    // loaded at the start of the cast would write its stale HP back to the row.
    // Restrict this write to the coordinates so movement cannot undo damage.
    await this.participantRepo.update(target.id, {
      positionX: destination.x,
      positionY: destination.y,
    });
    const persistedTarget =
      (await this.participantRepo.findOne({ where: { id: target.id } })) ??
      target;
    persistedTarget.positionX = destination.x;
    persistedTarget.positionY = destination.y;
    const locationBoundConditionEvents =
      await this.persistentArea.removeLocationBoundConditionsOutsideAreas(
        persistedTarget,
        destination,
      );
    target.conditions = persistedTarget.conditions;
    target.conditionInstances = persistedTarget.conditionInstances;
    events.push(...locationBoundConditionEvents);
    await this.persistentArea.relocateAurasByCaster(target.id, destination);
    return {
      from,
      to: destination,
      distanceFt:
        Math.max(
          Math.abs(destination.x - from.x),
          Math.abs(destination.y - from.y),
        ) * 5,
    };
  }


  private async rollMonsterOrPcSave(
    target: EncounterParticipantEntity,
    ability: string,
    dc: number,
    ownerUserId: string,

    withDisadvantage: boolean = false,
  ): Promise<{
    success: boolean;
    roll: number;
    total: number;
    dc: number;
    advantage?: {
      roll1: number;
      roll2: number;
      chosen: number;
      discarded: number;
    };
    hasAdvantage?: boolean;
    hasDisadvantage?: boolean;
    advantageCancelled?: boolean;
  }> {
    const withAdvantage =
      hasHasteDexSaveAdvantage(target, ability) ||
      hasDodgeDexSaveAdvantage(target, ability) ||
      hasBeaconWisdomSaveAdvantage(target, ability);
    if (target.type === "pc" && target.characterId) {
      const saveResult = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        ability,
        dc,
        userId: ownerUserId,
        participantId: target.id,
        disadvantage: withDisadvantage || undefined,
      });
      if (saveResult.ok && saveResult.value) {
        return {
          success: saveResult.value.success,
          roll: saveResult.value.roll,
          total: saveResult.value.total,
          dc,
          advantage: saveResult.value.advantage,
          hasAdvantage: withAdvantage && !withDisadvantage,
          hasDisadvantage: withDisadvantage && !withAdvantage,
          advantageCancelled: withAdvantage && withDisadvantage,
        };
      }
    }


    const monster =
      target.monster ??
      (target.monsterId
        ? await this.encounterService
            .getParticipant(target.id)
            .then((p) => p.monster)
        : null);

    if (!monster) {
      const rollA = this.diceService.roll(20);
      const rollsTwice = withDisadvantage !== withAdvantage;
      const rollB = rollsTwice ? this.diceService.roll(20) : rollA;
      const chosen =
        withDisadvantage && !withAdvantage
          ? Math.min(rollA, rollB)
          : withAdvantage && !withDisadvantage
            ? Math.max(rollA, rollB)
            : rollA;
      return {
        success: chosen >= dc,
        roll: chosen,
        total: chosen,
        dc,
        ...(rollsTwice
          ? {
              advantage: {
                roll1: rollA,
                roll2: rollB,
                chosen,
                discarded: chosen === rollA ? rollB : rollA,
              },
            }
          : {}),
        hasAdvantage: withAdvantage && !withDisadvantage,
        hasDisadvantage: withDisadvantage && !withAdvantage,
        advantageCancelled: withAdvantage && withDisadvantage,
      };
    }

    const bonus = getMonsterSavingThrowBonus(
      monster as unknown as Record<string, unknown>,
      ability,
    );

    const rollA = this.diceService.roll(20);
    const rollsTwice = withDisadvantage !== withAdvantage;
    const rollB = rollsTwice ? this.diceService.roll(20) : rollA;
    const chosen =
      withDisadvantage && !withAdvantage
        ? Math.min(rollA, rollB)
        : withAdvantage && !withDisadvantage
          ? Math.max(rollA, rollB)
          : rollA;
    return {
      success: chosen + bonus >= dc,
      roll: chosen,
      total: chosen + bonus,
      dc,
      ...(rollsTwice
        ? {
            advantage: {
              roll1: rollA,
              roll2: rollB,
              chosen,
              discarded: chosen === rollA ? rollB : rollA,
            },
          }
        : {}),
      hasAdvantage: withAdvantage && !withDisadvantage,
      hasDisadvantage: withDisadvantage && !withAdvantage,
      advantageCancelled: withAdvantage && withDisadvantage,
    };
  }

  private async getTargetSaveModifier(
    target: EncounterParticipantEntity,
    ability: string,
    ownerUserId: string,
  ): Promise<number> {
    if (target.type === "pc" && target.characterId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          target.characterId,
        );
        return (
          sheet.savingThrows.find(
            (savingThrow) => savingThrow.slug === ability,
          )?.bonus ?? 0
        );
      } catch {
        return 0;
      }
    }

    const monster =
      target.monster ??
      (target.monsterId
        ? await this.encounterService
            .getParticipant(target.id)
            .then((participant) => participant.monster)
            .catch(() => null)
        : null);
    return monster
      ? getMonsterSavingThrowBonus(
          monster as unknown as Record<string, unknown>,
          ability,
        )
      : 0;
  }
}
