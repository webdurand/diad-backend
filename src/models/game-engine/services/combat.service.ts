import { Injectable, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { InspirationService } from "./inspiration.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { ActionsService } from "src/models/characters/services/actions.service";
import { DiceService } from "./dice.service";
import {
  canTakeReactionFromConditions,
  canMoveFromConditions,
  ConditionEffectsService,
  hasDodgeDexSaveAdvantage,
  isTargetingCharmer,
} from "./condition-effects.service";
import { EventService } from "./event.service";
import { EncounterService } from "./encounter.service";
import { EncounterEndDetectorService } from "./encounter-end-detector.service";
import { LairActionsCoordinator } from "./lair-actions-coordinator.service";
import { LegendaryActionsCoordinator } from "./legendary-actions-coordinator.service";
import { MonsterReactionService } from "./monster-reaction.service";
import { MovementService } from "./movement.service";
import { SessionService } from "./session.service";
import { PaladinAuraService } from "./paladin-aura.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";
import {
  AttackResult,
  TurnInfo,
  RoundInfo,
  ConcentrationCheckResult,
  DeathSaveResult,
  TurnActionsResult,
  TurnActionBlock,
  AoEResolveResult,
  SavingThrowResult,
} from "../interfaces/combat.interfaces";
import { SavingThrowService } from "./saving-throw.service";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  MonsterActionResolver,
  type ResolvedMonsterAction,
} from "./monster-action-resolver.service";
import { CombatActionRegistry } from "./combat-action-registry.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { EffectInstanceService } from "./effect-instance.service";
import { ConcentrationService } from "./concentration.service";
import { ClassFeatureResolverService } from "./class-feature-resolver.service";
import { WeaponMasteryService } from "./weapon-mastery.service";
import { FightingStyleService } from "./fighting-style.service";
import { TransformationService } from "./transformation.service";
import { BardFeaturesService } from "./bard-features.service";
import { ExhaustionService } from "./exhaustion.service";
import { CapstonesService } from "./capstones.service";
import { ReactionOpportunityService } from "./reaction-opportunity.service";
import { StartTurnOrchestratorService } from "./start-turn-orchestrator.service";
import { PersistentAreaService } from "./persistent-area.service";
import { getMonsterSavingThrowBonus } from "./monster-saving-throw";
import type {
  ConditionSlug,
  EffectInstance,
  SaveAbility,
} from "../interfaces/combat.interfaces";
import {
  parseRangeString,
  checkAttackRange,
  chebyshevDistanceFt,
  type Position as GridPosition,
} from "./combat-range";
import { findWitchBoltTether } from "./witch-bolt";
import { findFearCompulsion } from "./fear-compulsion";
import {
  consumeHasteAction,
  hasAvailableHasteAction,
  hasHasteDexSaveAdvantage,
} from "./haste-action";
import {
  getMonsterRechargeRange,
  monsterActionDisplayName,
} from "./monster-recharge";
import { isWebRestraint } from "./web-restraint";
import {
  getSummonMetadata,
  getSummonStatBlock,
  isFindFamiliarSummon,
  isFindSteedSummon,
} from "./summon-stat-block";
import { resolveUndeadFortitude } from "./monster-survival";
import { protectionDisadvantagesAttack } from "./protection-from-evil-good";
import { getCharacterDamageResistances } from "./character-damage-resistance";
import {
  hasHalflingLuck,
  rollD20TestWithHalflingLuck,
} from "./halfling-luck";
import {
  findGiantAncestryChoice,
  GIANT_ANCESTRY_DISPLAY_NAMES,
  type GiantAncestryChoice,
} from "src/shared/goliath-rules";
import {
  abjureFoesChoiceError,
  chooseAbjureFoesTurnOption,
} from "./abjure-foes";
import {
  beaconHealingAmount,
  hasBeaconOfHope,
  hasBeaconWisdomSaveAdvantage,
} from "./beacon-of-hope";
import {
  FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT,
  hasFreedomOfMovement,
  isNonmagicalFreedomRestraint,
} from "./freedom-of-movement";



export interface AttackDto {
  attackerParticipantId: string;

  targetParticipantId: string;

  targetParticipantIds?: string[];

  actionName: string;

  actionSlug?: string;

  options?: Record<string, unknown>;

  forceAdvantage?: boolean;
  forceDisadvantage?: boolean;

  ownerUserId: string;

  _isSubAttack?: boolean;

  _bypassRangeCheck?: boolean;
}

export interface SubAttackResult {
  subActionName: string;
  targetParticipantId: string;
  attackRoll: AttackResult["attackRoll"];
  damageRoll?: AttackResult["damageRoll"];
  targetHpBefore?: number;
  targetHpAfter?: number;
  targetDefeated: boolean;
  targetDyingState?: "none" | "dying" | "stable" | "dead";
  concentrationBroken?: boolean;
}

export interface MultiattackResult {
  kind: "multiattack";
  actionConsumed: boolean;
  subAttacks: SubAttackResult[];
  interruptedAt: {
    index: number;
    reason: "target_defeated" | "action_cancelled";
  } | null;
}

export interface DamageDto {
  targetParticipantId: string;
  amount: number;
  damageType: string;
  ownerUserId: string;

  fromCriticalHit?: boolean;
}

export interface SpellAttackRollResolution {
  attackRoll: AttackResult["attackRoll"];
  events: GameEventData[];
}

export interface HealDto {
  targetParticipantId: string;
  amount: number;
  maximumAmount?: number;
  sourceSpellSlug?: string;
  ownerUserId: string;
}

export interface OtherworldlySteedGiftDto {
  steedParticipantId: string;
  ownerUserId: string;
  targetParticipantId?: string;
  destinationX?: number;
  destinationY?: number;
}

export interface OtherworldlySteedGiftResult {
  gift: "healing-touch" | "fey-step" | "fell-glare";
  steedParticipantId: string;
  targetParticipantId?: string;
  healingRoll?: { rolls: number[]; bonus: number; total: number };
  healingApplied?: number;
  hpAfter?: number;
  save?: {
    ability: string;
    dc: number;
    roll: number;
    modifier: number;
    total: number;
    success: boolean;
  };
  conditionApplied?: "frightened";
  destination?: { x: number; y: number };
  rider?: {
    participantId: string;
    name: string;
    destination: { x: number; y: number };
  };
}

export interface FaithfulSteedLifeBondDto {
  casterParticipantId: string;
  healingFromSpell: number;
  spellLevel: number;
  spellSlug: string;
  ownerUserId: string;
}

export interface FaithfulSteedLifeBondResult {
  casterParticipantId: string;
  steedParticipantId: string;
  mirroredHealing: number;
  healingApplied: number;
  hpAfter: number;
  spellSlug: string;
}

export interface ConditionDto {
  participantId: string;
  condition: string;
  apply: boolean;
  ownerUserId: string;
  durationRoundsRemaining?: number;
}

@Injectable()
export class CombatService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly encounterService: EncounterService,
    private readonly eventService: EventService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly actionsService: ActionsService,
    private readonly movementService: MovementService,
    private readonly sessionService: SessionService,
    private readonly savingThrowService: SavingThrowService,
    private readonly monsterActionResolver: MonsterActionResolver,
    private readonly combatActionRegistry: CombatActionRegistry,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly effectInstances: EffectInstanceService,
    private readonly concentration: ConcentrationService,
    private readonly classFeatureResolver: ClassFeatureResolverService,
    private readonly inspirationService: InspirationService,
    private readonly weaponMastery: WeaponMasteryService,
    private readonly fightingStyle: FightingStyleService,
    private readonly transformation: TransformationService,
    private readonly bard: BardFeaturesService,
    private readonly exhaustion: ExhaustionService,
    private readonly capstones: CapstonesService,
    private readonly reactionOpportunity: ReactionOpportunityService,


    private readonly encounterEndDetector: EncounterEndDetectorService,
    private readonly lairActionsCoordinator: LairActionsCoordinator,
    private readonly legendaryActionsCoordinator: LegendaryActionsCoordinator,
    private readonly monsterReactions: MonsterReactionService,
    private readonly startTurnOrchestrator: StartTurnOrchestratorService,
    private readonly persistentArea: PersistentAreaService,
    @Optional()
    private readonly paladinAuras?: PaladinAuraService,
  ) {}


  private async applyDamageToPcFormAware(
    target: EncounterParticipantEntity,
    damage: number,
    ownerUserId: string,
  ): Promise<{ currentHp: number; isDown: boolean; instantDeath: boolean }> {
    if (damage <= 0) {
      const st = await this.stateService.updateHp(
        ownerUserId,
        target.characterId!,
        { damage: 0 },
      );
      return {
        currentHp: st.currentHp,
        isDown: st.isDown,
        instantDeath: st.instantDeath ?? false,
      };
    }
    if (target.transformationState) {
      const res = await this.transformation.applyDamageToForm(
        target.id,
        damage,
      );
      if (res.usesOriginalHp) {
        const st = await this.stateService.updateHp(
          ownerUserId,
          target.characterId!,
          { damage },
        );
        return {
          currentHp: st.currentHp,
          isDown: st.isDown,
          instantDeath: st.instantDeath ?? false,
        };
      }
      if (!res.reverted) {


        const formHp =
          target.transformationState.form.currentHp - res.absorbedByForm;
        return {
          currentHp: Math.max(0, formHp),
          isDown: false,
          instantDeath: false,
        };
      }


      if (res.overflowToOriginal > 0) {
        const st = await this.stateService.updateHp(
          ownerUserId,
          target.characterId!,
          { damage: 0 },
        );
        return {
          currentHp: st.currentHp,
          isDown: st.isDown,
          instantDeath: st.instantDeath ?? false,
        };
      }
      return { currentHp: 0, isDown: false, instantDeath: false };
    }
    const st = await this.stateService.updateHp(
      ownerUserId,
      target.characterId!,
      { damage },
    );
    return {
      currentHp: st.currentHp,
      isDown: st.isDown,
      instantDeath: st.instantDeath ?? false,
    };
  }


  // Auto-end no fluxo solo: o tryAutoEnd antes só rodava em endTurn, então o
  // golpe que derrubava o último hostil deixava o encounter `active` para
  // sempre (sem DM humano para encerrar). Agora toda ação de dano/ataque que
  // derrota alguém reavalia o fim do combate. Melhor-esforço: nunca derruba a
  // ação que o disparou (tryAutoEnd também já engole erros internamente).
  private async maybeAutoEndAfterDefeat(
    encounterId: string,
    somebodyDefeated: boolean,
  ): Promise<void> {
    if (!somebodyDefeated) return;
    try {
      await this.encounterEndDetector.tryAutoEnd(encounterId);
    } catch {
      // best-effort
    }
  }


  async translateSlugToActionName(
    encounterId: string,
    attackerParticipantId: string,
    slug: string,
    ownerUserId: string,
  ): Promise<GameResult<string>> {
    const attacker = await this.encounterService
      .getParticipant(attackerParticipantId)
      .catch(() => null);
    if (!attacker) {
      return failure("Participante nao encontrado.", "PARTICIPANT_NOT_FOUND");
    }

    if (
      slug === "unarmed-strike" ||
      slug === "unarmed-grapple" ||
      slug === "unarmed-shove"
    ) {
      return success("Unarmed Strike" as string, []);
    }


    if (
      attacker.type === "pc" &&
      attacker.characterId &&
      slug.endsWith("-attack")
    ) {
      const equipSlug = slug.slice(0, -"-attack".length);
      const pcOwnerId = await this.resolveParticipantOwner(
        attacker,
        ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        pcOwnerId,
        attacker.characterId,
      );
      const eq = sheet.equipment.find(
        (e) => e.slug === equipSlug && (e.mainHand || e.offHand) && !!e.damage,
      );
      if (!eq) {
        return failure(
          `Arma '${equipSlug}' nao esta equipada.`,
          "NOT_EQUIPPED",
        );
      }
      return success(eq.name, []);
    }




    if (
      attacker.type === "pc" &&
      attacker.characterId &&
      slug.startsWith("weapon-")
    ) {
      const rest = slug.startsWith("weapon-thrown-")
        ? slug.slice("weapon-thrown-".length)
        : slug.slice("weapon-".length);
      const pcOwnerId = await this.resolveParticipantOwner(
        attacker,
        ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        pcOwnerId,
        attacker.characterId,
      );
      const eq = sheet.equipment.find((e) => e.id === rest && !!e.damage);
      if (!eq) {
        return failure(
          `Arma '${slug}' nao encontrada no inventário.`,
          "INVALID_ACTION_SLUG",
        );
      }
      return success(eq.name, []);
    }




    if (attacker.type === "pc" && attacker.transformationState) {
      const form = attacker.transformationState.form;
      const formSlug = form.monsterSlug ?? "";
      if (formSlug && slug.startsWith(formSlug + "-")) {
        const rest = slug.slice(formSlug.length + 1);
        const actions = (form.actions ?? []) as Array<{ name: string }>;
        const match = actions.find((a) => this.slugifyName(a.name) === rest);
        if (match) return success(match.name, []);
      }
    }

    if (attacker.type === "monster") {
      const summonStatBlock = getSummonStatBlock(attacker);
      if (summonStatBlock) {
        const summonAttackSlug = `${summonStatBlock.kind}-${this.slugifyName(
          summonStatBlock.attack.name,
        )}`;
        if (slug === summonAttackSlug) {
          return success(summonStatBlock.attack.name, []);
        }
        if (
          slug === `${summonStatBlock.kind}-multiattack` &&
          summonStatBlock.attack.attacksPerAction > 1
        ) {
          return success("Multiattack", []);
        }
      }
    }


    if (attacker.type === "monster" && attacker.monster) {
      const monsterSlug: string = (attacker.monster as any).slug ?? "";
      if (monsterSlug && slug.startsWith(monsterSlug + "-")) {
        const rest = slug.slice(monsterSlug.length + 1);


        if (rest === "multiattack" || rest === "multiataque") {
          const ma = (attacker.monster as any).multiattack;
          if (ma) {
            return success("Multiattack", []);
          }
        }

        const actions = ((attacker.monster as any).actions ?? []) as Array<{
          name: string;
        }>;
        const match = actions.find((a) => this.slugifyName(a.name) === rest);
        if (match) {
          return success(match.name, []);
        }
      }
    }

    return failure(
      `Slug '${slug}' nao reconhecido para este atacante.`,
      "INVALID_ACTION_SLUG",
    );
  }

  async resolveOtherworldlySteedGift(
    encounterId: string,
    dto: OtherworldlySteedGiftDto,
  ): Promise<GameResult<OtherworldlySteedGiftResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }

    const steed = await this.encounterService
      .getParticipant(dto.steedParticipantId)
      .catch(() => null);
    const statBlock = getSummonStatBlock(steed);
    if (
      !steed ||
      steed.encounterId !== encounterId ||
      steed.type !== "monster" ||
      !isFindSteedSummon(steed) ||
      statBlock?.kind !== "otherworldly-steed" ||
      !statBlock.steed
    ) {
      return failure(
        "Este participante nao e um Corcel Extraplanar ativo.",
        "INVALID_STEED",
      );
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== steed.id) {
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    }
    if (steed.bonusActionUsed) {
      return failure("Acao bonus ja utilizada neste turno.", "NO_BONUS_ACTION");
    }
    if (!this.conditionEffects.canTakeAction(steed.conditions ?? [])) {
      return failure(
        "O corcel nao pode agir devido a condicoes.",
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const summonEffect = (steed.appliedEffects ?? []).find(
      (effect) =>
        effect.kind === "summon" &&
        (effect.metadata?.source ?? effect.refId) === "find-steed-spell",
    );
    if (!summonEffect) {
      return failure("Vinculo de Find Steed ausente.", "INVALID_STEED");
    }
    if (summonEffect.metadata?.giftUsed === true) {
      return failure(
        "O dom extraplanar ja foi usado por este corcel.",
        "NO_USES_REMAINING",
      );
    }

    const gift = statBlock.steed.bonusAction;
    const giftEvents: GameEventData[] = [];
    const returnedEvents: GameEventData[] = [];
    let value: OtherworldlySteedGiftResult = {
      gift,
      steedParticipantId: steed.id,
    };

    if (gift === "healing-touch") {
      if (!dto.targetParticipantId) {
        return failure(
          "Toque Curativo exige um alvo.",
          "TARGET_REQUIRED",
        );
      }
      const target = await this.encounterService
        .getParticipant(dto.targetParticipantId)
        .catch(() => null);
      if (
        !target ||
        target.encounterId !== encounterId ||
        target.isDefeated ||
        target.faction !== steed.faction
      ) {
        return failure("Alvo de cura invalido.", "INVALID_TARGET");
      }
      if (
        steed.positionX == null ||
        steed.positionY == null ||
        target.positionX == null ||
        target.positionY == null ||
        chebyshevDistanceFt(
          { x: steed.positionX, y: steed.positionY },
          { x: target.positionX, y: target.positionY },
        ) > 5
      ) {
        return failure(
          "Toque Curativo exige um aliado a ate 5 pes.",
          "OUT_OF_RANGE",
        );
      }
      const rolls = [this.diceService.roll(8), this.diceService.roll(8)];
      const healing = rolls[0] + rolls[1] + statBlock.slotLevel;
      const ownerUserId = await this.resolveParticipantOwner(
        target,
        dto.ownerUserId,
      );
      const healed = await this.applyHealing(encounterId, {
        targetParticipantId: target.id,
        amount: healing,
        ownerUserId,
      });
      if (!healed.ok) return healed;
      if (target.id === steed.id) {
        steed.currentHp = healed.value.hpAfter;
        steed.isDefeated = healed.value.defeated;
      }
      returnedEvents.push(...healed.events);
      value = {
        ...value,
        targetParticipantId: target.id,
        healingRoll: {
          rolls,
          bonus: statBlock.slotLevel,
          total: healing,
        },
        healingApplied: healed.value.healingApplied,
        hpAfter: healed.value.hpAfter,
      };
    } else if (gift === "fey-step") {
      const destinationX = dto.destinationX;
      const destinationY = dto.destinationY;
      if (
        !Number.isInteger(destinationX) ||
        !Number.isInteger(destinationY) ||
        steed.positionX == null ||
        steed.positionY == null
      ) {
        return failure(
          "Passo Feerico exige uma celula de destino.",
          "DESTINATION_REQUIRED",
        );
      }
      const columns = encounter.mapData?.gridColumns ?? 20;
      const rows = encounter.mapData?.gridRows ?? 20;
      if (
        destinationX! < 0 ||
        destinationY! < 0 ||
        destinationX! >= columns ||
        destinationY! >= rows
      ) {
        return failure("Destino fora do mapa.", "INVALID_DESTINATION");
      }
      const distanceFt = chebyshevDistanceFt(
        { x: steed.positionX, y: steed.positionY },
        { x: destinationX!, y: destinationY! },
      );
      if (distanceFt > 60) {
        return failure(
          "Passo Feerico alcanca no maximo 60 pes.",
          "OUT_OF_RANGE",
        );
      }
      const participants = await this.participantRepo.find({
        where: { encounterId },
      });
      const destinationOccupied = participants.some(
        (participant) =>
          participant.id !== steed.id &&
          !participant.isDefeated &&
          participant.positionX === destinationX &&
          participant.positionY === destinationY,
      );
      if (destinationOccupied) {
        return failure(
          "A celula de destino esta ocupada.",
          "DESTINATION_OCCUPIED",
        );
      }

      const linkedCaster = steed.linkedCasterParticipantId
        ? participants.find(
            (participant) =>
              participant.id === steed.linkedCasterParticipantId &&
              !participant.isDefeated &&
              participant.faction === steed.faction &&
              participant.positionX != null &&
              participant.positionY != null &&
              chebyshevDistanceFt(
                { x: steed.positionX!, y: steed.positionY! },
                {
                  x: participant.positionX!,
                  y: participant.positionY!,
                },
              ) <= 5,
          )
        : undefined;
      const occupied = new Set(
        participants
          .filter(
            (participant) =>
              participant.id !== steed.id &&
              participant.id !== linkedCaster?.id &&
              !participant.isDefeated &&
              participant.positionX != null &&
              participant.positionY != null,
          )
          .map(
            (participant) =>
              `${participant.positionX},${participant.positionY}`,
          ),
      );
      const riderOffsets = linkedCaster
        ? [
            {
              x: linkedCaster.positionX! - steed.positionX,
              y: linkedCaster.positionY! - steed.positionY,
            },
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: -1, y: 1 },
            { x: 1, y: -1 },
            { x: -1, y: -1 },
          ]
        : [];
      const riderDestination = riderOffsets
        .map((offset) => ({
          x: destinationX! + offset.x,
          y: destinationY! + offset.y,
        }))
        .find(
          (candidate) =>
            candidate.x >= 0 &&
            candidate.y >= 0 &&
            candidate.x < columns &&
            candidate.y < rows &&
            !(candidate.x === destinationX && candidate.y === destinationY) &&
            !occupied.has(`${candidate.x},${candidate.y}`),
        );

      steed.positionX = destinationX!;
      steed.positionY = destinationY!;
      if (linkedCaster && riderDestination) {
        linkedCaster.positionX = riderDestination.x;
        linkedCaster.positionY = riderDestination.y;
        await this.participantRepo.save(linkedCaster);
      }
      value = {
        ...value,
        destination: { x: destinationX!, y: destinationY! },
        rider:
          linkedCaster && riderDestination
            ? {
                participantId: linkedCaster.id,
                name: linkedCaster.displayName,
                destination: riderDestination,
              }
            : undefined,
      };
    } else {
      if (!dto.targetParticipantId) {
        return failure("Olhar Terrivel exige um alvo.", "TARGET_REQUIRED");
      }
      const target = await this.encounterService
        .getParticipant(dto.targetParticipantId)
        .catch(() => null);
      if (
        !target ||
        target.encounterId !== encounterId ||
        target.id === steed.id ||
        target.isDefeated
      ) {
        return failure("Alvo do olhar invalido.", "INVALID_TARGET");
      }
      if (
        steed.positionX == null ||
        steed.positionY == null ||
        target.positionX == null ||
        target.positionY == null ||
        chebyshevDistanceFt(
          { x: steed.positionX, y: steed.positionY },
          { x: target.positionX, y: target.positionY },
        ) > 60
      ) {
        return failure(
          "Olhar Terrivel alcanca no maximo 60 pes.",
          "OUT_OF_RANGE",
        );
      }
      const saveEvents = await this.resolveMonsterOnHitSaveCondition({
        encounter,
        attacker: steed,
        target,
        actionName: "Fell Glare",
        ownerUserId: dto.ownerUserId,
        effect: {
          slug: "frightened",
          saveAbility: "wis",
          saveDc: statBlock.steed.spellSaveDc,
          durationRounds: null,
          expiresAtTurnEndParticipantId:
            steed.linkedCasterParticipantId ?? steed.id,
          repeatSaveTiming: "never",
          excludedCreatureTypes: [],
          excludedRaceTerms: [],
        },
      });
      returnedEvents.push(...saveEvents);
      giftEvents.push(...saveEvents);
      const saveEvent = saveEvents.find(
        (event) => event.event_type === "save_rolled",
      );
      const save = saveEvent?.data as
        | OtherworldlySteedGiftResult["save"]
        | undefined;
      value = {
        ...value,
        targetParticipantId: target.id,
        save,
        conditionApplied: save?.success === false ? "frightened" : undefined,
      };
    }

    summonEffect.metadata = {
      ...(summonEffect.metadata ?? {}),
      giftUsed: true,
    };
    steed.bonusActionUsed = true;
    await this.participantRepo.save(steed);

    const giftEvent: GameEventData = {
      event_type: "otherworldly_steed_gift_used",
      actor_participant_id: steed.id,
      target_participant_id: value.targetParticipantId,
      data: value as unknown as Record<string, unknown>,
    };
    giftEvents.push(giftEvent);
    returnedEvents.push(giftEvent);
    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      giftEvents.filter(
        (event, index, all) => all.indexOf(event) === index,
      ),
    );

    return success(value, returnedEvents);
  }

  async resolveFaithfulSteedLifeBond(
    encounterId: string,
    dto: FaithfulSteedLifeBondDto,
  ): Promise<GameResult<FaithfulSteedLifeBondResult | null>> {
    if (dto.spellLevel < 1 || dto.healingFromSpell <= 0) {
      return success(null, []);
    }

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return success(null, []);
    }

    const caster = await this.encounterService
      .getParticipant(dto.casterParticipantId)
      .catch(() => null);
    if (
      !caster ||
      caster.encounterId !== encounterId ||
      caster.positionX == null ||
      caster.positionY == null
    ) {
      return success(null, []);
    }

    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    const steed = participants.find((candidate) => {
      const candidateStatBlock = getSummonStatBlock(candidate);
      return (
        candidate.linkedCasterParticipantId === caster.id &&
        candidate.isVisible &&
        !candidate.isDefeated &&
        isFindSteedSummon(candidate) &&
        candidateStatBlock?.traits.lifeBond === true &&
        candidate.positionX != null &&
        candidate.positionY != null &&
        chebyshevDistanceFt(
          { x: caster.positionX!, y: caster.positionY! },
          { x: candidate.positionX, y: candidate.positionY },
        ) <= 5
      );
    });
    if (!steed) return success(null, []);

    const healed = await this.applyHealing(encounterId, {
      targetParticipantId: steed.id,
      amount: dto.healingFromSpell,
      ownerUserId: dto.ownerUserId,
    });
    if (!healed.ok) {
      return failure(
        healed.error ?? "Falha ao aplicar o Vínculo Vital.",
        healed.code ?? "LIFE_BOND_FAILED",
      );
    }

    const value: FaithfulSteedLifeBondResult = {
      casterParticipantId: caster.id,
      steedParticipantId: steed.id,
      mirroredHealing: dto.healingFromSpell,
      healingApplied: healed.value.healingApplied,
      hpAfter: healed.value.hpAfter,
      spellSlug: dto.spellSlug,
    };
    const event: GameEventData = {
      event_type: "faithful_steed_life_bond",
      actor_participant_id: caster.id,
      target_participant_id: steed.id,
      data: value as unknown as Record<string, unknown>,
    };
    await this.eventService.emit(encounter.sessionId, encounterId, [event]);

    return success(value, [...healed.events, event]);
  }

  private slugifyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private isUnarmedAttack(dto: Pick<AttackDto, "actionName" | "actionSlug">) {
    const slug = dto.actionSlug ?? this.slugifyName(dto.actionName);
    return (
      slug === "unarmed-strike" ||
      slug === "unarmed-grapple" ||
      slug === "unarmed-shove" ||
      slug === "golpe-desarmado"
    );
  }

  private canUseStandardOrBonusAttack(
    attacker: EncounterParticipantEntity,
    isUnarmedAttack: boolean,
  ): boolean {
    if (
      isUnarmedAttack &&
      (attacker.bonusUnarmedAttacksRemainingThisTurn ?? 0) > 0
    ) {
      return true;
    }
    if (!attacker.actionUsed) return true;
    return (
      attacker.attacksUsedThisTurn > 0 &&
      attacker.attacksUsedThisTurn < attacker.attacksMaxThisTurn
    );
  }

  private consumeStandardOrBonusAttack(
    attacker: EncounterParticipantEntity,
    isUnarmedAttack: boolean,
  ): void {
    if (
      isUnarmedAttack &&
      (attacker.bonusUnarmedAttacksRemainingThisTurn ?? 0) > 0
    ) {
      attacker.bonusUnarmedAttacksRemainingThisTurn -= 1;
      return;
    }

    attacker.actionUsed = true;
    attacker.attacksUsedThisTurn = Math.min(
      attacker.attacksUsedThisTurn + 1,
      attacker.attacksMaxThisTurn,
    );
  }


  private positionOf(p: EncounterParticipantEntity): GridPosition | null {
    if (p.positionX == null || p.positionY == null) return null;
    return { x: p.positionX, y: p.positionY };
  }


  async getParticipantCombatActions(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<unknown>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");

    const participant = await this.encounterService
      .getParticipant(participantId)
      .catch(() => null);
    if (!participant)
      return failure("Participante nao encontrado.", "PARTICIPANT_NOT_FOUND");

    const isOnTurn =
      encounter.turnOrder[encounter.currentTurnIndex] === participantId;

    const actionEconomy = {
      actionUsed: participant.actionUsed,
      bonusActionUsed: participant.bonusActionUsed,
      reactionUsed: participant.reactionsUsed > 0,
      movementUsed:
        (participant.movementRemaining ?? 0) < 30
          ? 30 - (participant.movementRemaining ?? 30)
          : 0,
      attacksUsedThisTurn: participant.attacksUsedThisTurn,
      attacksMaxThisTurn: participant.attacksMaxThisTurn,
      bonusUnarmedAttacksRemainingThisTurn:
        participant.bonusUnarmedAttacksRemainingThisTurn ?? 0,
      isOnTurn,
    };

    if (participant.type === "pc" && participant.characterId) {
      const pcOwnerId = await this.resolveParticipantOwner(
        participant,
        ownerUserId,
      );
      const [sheet, featureUsesUsed] = await Promise.all([
        this.sheetService.computeSheet(pcOwnerId, participant.characterId),
        this.stateService.getFeatureUsesUsed(participant.characterId),
      ]);
      const abilityMods = sheet.abilityScores.reduce<Record<string, number>>(
        (acc, a) => {
          acc[a.slug] = a.modifier;
          return acc;
        },
        {},
      );
      const descriptors = await this.combatActionRegistry.listActions({
        type: "pc",
        participantId,
        characterId: participant.characterId,
        actionEconomy,
        conditions: participant.conditions ?? [],
        featureUsesUsed,
        sheet: {
          equipment: sheet.equipment.map((e) => ({
            id: e.id,
            slug: e.slug,
            name: e.name,
            equipped: e.equipped,
            damage: e.damage,
            range: e.range,
            properties: e.properties,
          })),
          classes: sheet.classes.map((c) => ({
            slug: c.slug,
            name: c.name,
            level: c.level,
          })),
          features: sheet.features.map((f) => ({
            slug: f.slug,
            name: f.name,
            level: f.level,
            active: f.active,
          })),
          abilityMods,
          proficiencyBonus: sheet.proficiencyBonus,
          totalLevel: sheet.totalLevel,
          raceSlug: sheet.race?.slug,
        },
      });
      return success(descriptors, []);
    }

    if (participant.type === "monster" && participant.monster) {
      const monster: any = participant.monster;
      const monsterSlug: string = monster.slug ?? "";
      const summonActions = this.buildSummonActions(participant);
      const rawActions: any[] = summonActions
        ? summonActions
            .filter((action) => action.kind !== "multiattack")
            .map((action) => ({
              name: action.name,
              desc: action.description,
              attack_bonus: action.attackBonus,
              damage: action.damage
                ? [
                    {
                      damage_dice: action.damage.dice,
                      damage_bonus: action.damage.bonus,
                      damage_type: { name: action.damage.type },
                    },
                  ]
                : [],
            }))
        : Array.isArray(monster.actions)
          ? monster.actions
          : [];
      const monsterActions = rawActions.map((a) => {
        const resolved = this.monsterActionResolver.resolveByName(
          monster,
          a.name,
        );
        return {
          name: a.name,
          desc: a.desc,
          attackBonus: resolved?.attackBonus,
          damageDice: resolved?.damageDice,
          damageType: resolved?.damageType,
        };
      });
      const descriptors = await this.combatActionRegistry.listActions({
        type: "monster",
        participantId,
        monsterSlug,
        monsterActions,
        actionEconomy,
        conditions: participant.conditions ?? [],
      });
      return success(descriptors, []);
    }


    const descriptors = await this.combatActionRegistry.listActions({
      type: "npc",
      participantId,
      actionEconomy,
      conditions: participant.conditions ?? [],
    });
    return success(descriptors, []);
  }

  async resolveAoeAction(
    encounterId: string,
    dto: {
      casterParticipantId: string;
      actionName: string;
      affectedParticipantIds: string[];
      ownerUserId: string;
    },
  ): Promise<GameResult<AoEResolveResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const caster = await this.encounterService.getParticipant(
      dto.casterParticipantId,
    );
    if (caster.actionUsed)
      return failure("Acao ja utilizada.", "NO_ACTION_AVAILABLE");
    if (encounter.turnOrder[encounter.currentTurnIndex] !== caster.id)
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");


    let actionBlock: TurnActionBlock | undefined;
    if (caster.type === "monster" && caster.monster) {
      const all = [
        ...this.parseMonsterActions(caster.monster),
        ...((caster.monster as any).legendary_actions ?? []).map(
          (a: any, i: number) => {
            const b = this.buildMonsterActionBlock(
              caster.monster,
              a,
              i,
              "monster-legendary",
            );
            return { ...b, name: `⭐ ${b.name}` };
          },
        ),
      ];
      actionBlock = all.find(
        (a) => a.name.toLowerCase() === dto.actionName.toLowerCase(),
      );
    } else if (caster.type === "pc" && caster.characterId) {
      const ownerId = await this.resolveParticipantOwner(
        caster,
        dto.ownerUserId,
      );
      const pc = await this.actionsService.getActions(
        ownerId,
        caster.characterId,
      );
      const all = [...pc.actions, ...pc.bonusActions];
      actionBlock = all
        .map(this.toTurnActionBlock)
        .find((a) => a.name.toLowerCase() === dto.actionName.toLowerCase());
    }

    if (!actionBlock || !actionBlock.aoe || !actionBlock.damage) {
      return failure("Acao em area invalida.", "INVALID_ACTION");
    }
    if (
      actionBlock.rechargeRequired &&
      (caster.rechargeState ?? {})[actionBlock.name] === "used"
    ) {
      return failure(
        `${actionBlock.name} ainda nao recarregou.`,
        "ACTION_RECHARGING",
      );
    }

    const isAirElementalWhirlwind =
      caster.type === "monster" &&
      String(caster.monster?.slug ?? "")
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/i, "") === "air-elemental" &&
      actionBlock.name.toLowerCase().startsWith("whirlwind");

    if (
      caster.type === "pc" &&
      caster.characterId &&
      actionBlock.featureSlug &&
      actionBlock.usesMax != null
    ) {
      const used =
        (
          await this.stateService.getFeatureUsesUsed(caster.characterId)
        )[actionBlock.featureSlug] ?? 0;
      if (used >= actionBlock.usesMax) {
        return failure(
          "Sem usos restantes para esta habilidade.",
          "NO_USES_REMAINING",
        );
      }
    }

    const events: GameEventData[] = [];
    const results: AoEResolveResult["results"] = [];
    // D&D resolves one damage roll for a single area effect. Each target still
    // makes its own save and applies its own resistance/immunity afterward.
    const areaDamageRoll = this.diceService.rollExpression(
      actionBlock.damage.dice,
    );

    for (const targetId of dto.affectedParticipantIds) {
      if (targetId === caster.id) continue;
      const target = await this.encounterService
        .getParticipant(targetId)
        .catch(() => null);
      if (!target || target.isDefeated) continue;


      let saveResult: SavingThrowResult | undefined;
      let saved = false;
      if (actionBlock.save) {
        if (target.type === "pc" && target.characterId) {
          const targetOwnerId = await this.resolveParticipantOwner(
            target,
            dto.ownerUserId,
          );
          const sr = await this.savingThrowService.rollSavingThrow({
            characterId: target.characterId,
            userId: targetOwnerId,
            ability: actionBlock.save.ability,
            dc: actionBlock.save.dc,
            encounterId,
            sessionId: encounter.sessionId,
            participantId: target.id,
          });
          if (sr.ok && sr.value) {
            saveResult = sr.value;
            saved = sr.value.success;
            events.push(...(sr.events ?? []));
          }
        } else if (target.type === "monster" && target.monster) {
          const m: any = target.monster;
          const saveBonus = getMonsterSavingThrowBonus(
            m,
            actionBlock.save.ability,
          );
          const dodgeAdvantage = hasDodgeDexSaveAdvantage(
            target,
            actionBlock.save.ability,
          );
          const advantageRoll = dodgeAdvantage
            ? this.diceService.rollWithAdvantage()
            : null;
          const roll = advantageRoll?.chosen ?? this.diceService.roll(20);
          const total = roll + saveBonus;
          saved = total >= actionBlock.save.dc;
          saveResult = {
            ability: actionBlock.save.ability,
            dc: actionBlock.save.dc,
            roll,
            modifier: saveBonus,
            total,
            success: saved,
            ...(advantageRoll
              ? {
                  advantage: {
                    roll1: advantageRoll.roll1,
                    roll2: advantageRoll.roll2,
                    chosen: advantageRoll.chosen,
                    discarded:
                      advantageRoll.roll1 === advantageRoll.chosen
                        ? advantageRoll.roll2
                        : advantageRoll.roll1,
                  },
                }
              : {}),
          };
        }
      }


      const dmgResult = areaDamageRoll;
      let totalDamage = dmgResult.total;
      if (saved && actionBlock.save?.halfOnSuccess) {
        totalDamage = Math.floor(totalDamage / 2);
      } else if (saved && !actionBlock.save?.halfOnSuccess) {
        totalDamage = 0;
      }

      let finalDamage = totalDamage;
      let resisted = false;
      let immune = false;
      let vulnerable = false;
      const adjustedDamage = await this.resolveDamageAdjustments(
        target,
        totalDamage,
        actionBlock.damage.type,
        dto.ownerUserId,
      );
      finalDamage = adjustedDamage.finalDamage;
      resisted = adjustedDamage.resisted;
      immune = adjustedDamage.immune;
      vulnerable = adjustedDamage.vulnerable;


      let targetHpAfter: number | undefined;
      let targetDefeated = false;
      if (finalDamage > 0) {
        if (target.type === "pc" && target.characterId) {
          const targetOwnerId = await this.resolveParticipantOwner(
            target,
            dto.ownerUserId,
          );
          const wasDying = target.dyingState === "dying";
          const hpResult = await this.stateService.updateHp(
            targetOwnerId,
            target.characterId,
            { damage: finalDamage },
          );
          targetHpAfter = hpResult.currentHp;
          targetDefeated = hpResult.isDown;
          if (hpResult.instantDeath) {
            target.dyingState = "dead";
            target.isDefeated = true;
            await this.participantRepo.save(target);
          } else if (targetDefeated && !wasDying) {
            target.dyingState = "dying";
            target.isDefeated = false;
            await this.participantRepo.save(target);
          } else if (wasDying) {
            const ds = await this.stateService.updateDeathSaves(
              targetOwnerId,
              target.characterId,
              { failuresDelta: 1 },
            );
            if (ds.dead) {
              target.dyingState = "dead";
              target.isDefeated = true;
              await this.participantRepo.save(target);
            }
          }
        } else {
          const r = this.applyDamageToMonster(target, finalDamage);
          targetHpAfter = r.hpAfter;
          targetDefeated = r.defeated;
          await this.participantRepo.save(target);
          if (targetDefeated) {
            await this.removeDefeatedSummon(
              encounter,
              target,
              events,
              "hp-zero",
            );
          }
        }
      }

      if (finalDamage > 0) {
        events.push(
          ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
            target,
          )),
        );
      }

      const conditionsApplied: ConditionSlug[] = [];
      let forcedMovement:
        | {
            from: { x: number; y: number };
            to: { x: number; y: number };
            distanceFt: number;
          }
        | undefined;
      if (isAirElementalWhirlwind && !saved) {
        const prone = await this.conditionLifecycle.applyCondition(target, {
          slug: "prone",
          appliedBy: caster.id,
          source: "ability:air-elemental-whirlwind",
          repeatSaveTiming: "never",
          durationRoundsRemaining: null,
        });
        events.push(...prone.events);
        conditionsApplied.push("prone");
        forcedMovement = await this.throwTargetInRandomDirection(
          encounter,
          target,
          20,
          events,
        );
        if (forcedMovement) {
          events.push({
            event_type: "forced_movement",
            actor_participant_id: caster.id,
            target_participant_id: target.id,
            data: {
              source: "air-elemental-whirlwind",
              ...forcedMovement,
            },
          });
        }
      }

      const damageRoll = {
        rolls: [dmgResult],
        bonus: 0,
        total: dmgResult.total,
        type: actionBlock.damage.type,
        resisted,
        immune,
        vulnerable,
        finalDamage,
      };

      events.push({
        event_type: "aoe_target_hit",
        actor_participant_id: caster.id,
        target_participant_id: target.id,
        data: {
          actionName: dto.actionName,
          save: saveResult,
          damage: damageRoll,
          targetHpAfter,
        },
      });

      results.push({
        participantId: target.id,
        participantName: target.displayName,
        save: saveResult,
        damageRoll,
        targetHpAfter,
        targetDefeated,
        conditionsApplied,
        forcedMovement,
      });
    }


    if (
      caster.type === "pc" &&
      caster.characterId &&
      actionBlock.featureSlug &&
      actionBlock.usesMax != null
    ) {
      const usesConsumed = await this.stateService.incrementFeatureUses(
        caster.characterId,
        actionBlock.featureSlug,
      );
      events.push({
        event_type: "species_feature_used",
        actor_participant_id: caster.id,
        data: {
          featureSlug: actionBlock.featureSlug,
          actionName: dto.actionName,
          usesConsumed,
          usesMax: actionBlock.usesMax,
        },
      });
    }

    caster.actionUsed = true;
    if (actionBlock.rechargeRequired) {
      caster.rechargeState = {
        ...(caster.rechargeState ?? {}),
        [actionBlock.name]: "used",
      };
    }
    await this.participantRepo.save(caster);

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    await this.maybeAutoEndAfterDefeat(
      encounterId,
      results.some((r) => r.targetDefeated),
    );

    return success(
      {
        affectedParticipantIds: dto.affectedParticipantIds,
        results,
      },
      events,
    );
  }

  private async resolveParticipantOwner(
    participant: EncounterParticipantEntity,
    requesterUserId: string,
  ): Promise<string> {
    if (participant.type !== "pc" || !participant.characterId)
      return requesterUserId;
    const encounter = await this.encounterRepo.findOne({
      where: { id: participant.encounterId },
    });
    if (!encounter) return requesterUserId;
    const session = await this.sessionService.getById(encounter.sessionId);
    return this.encounterService.resolveCharacterOwner(
      participant.characterId,
      requesterUserId,
      session.campaignId ?? undefined,
    );
  }


  private async computeCritThreshold(
    attacker: EncounterParticipantEntity,
    requesterUserId: string,
  ): Promise<number> {
    if (attacker.type !== "pc" || !attacker.characterId) return 20;
    try {
      const ownerId = await this.resolveParticipantOwner(
        attacker,
        requesterUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        ownerId,
        attacker.characterId,
      );
      const features =
        (
          sheet as unknown as {
            features?: Array<{ slug: string; active?: boolean }>;
          }
        ).features ?? [];
      const activeSlugs = features
        .filter((f) => f.active !== false)
        .map((f) => f.slug);


      const hasSuperior = activeSlugs.some((s) =>
        s.startsWith("superior-critical"),
      );
      const hasImproved = activeSlugs.some((s) =>
        s.startsWith("improved-critical"),
      );
      if (hasSuperior) return 18;
      if (hasImproved) return 19;
      return 20;
    } catch {
      return 20;
    }
  }


  private async hasStudiedAttacks(
    attacker: EncounterParticipantEntity,
    requesterUserId: string,
  ): Promise<boolean> {
    if (attacker.type !== "pc" || !attacker.characterId) return false;
    try {
      const ownerId = await this.resolveParticipantOwner(
        attacker,
        requesterUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        ownerId,
        attacker.characterId,
      );
      const features =
        (
          sheet as unknown as {
            features?: Array<{ slug: string; active?: boolean }>;
          }
        ).features ?? [];
      return features
        .filter((f) => f.active !== false)
        .some((f) => f.slug.startsWith("studied-attacks"));
    } catch {
      return false;
    }
  }


  private async getAttackerProfBonus(
    attacker: EncounterParticipantEntity,
    requesterUserId: string,
  ): Promise<number> {
    if (attacker.type === "pc" && attacker.characterId) {
      const ownerId = await this.resolveParticipantOwner(
        attacker,
        requesterUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        ownerId,
        attacker.characterId,
      );
      return sheet?.proficiencyBonus ?? 2;
    }
    const m = attacker.monster as { proficiency_bonus?: number } | undefined;
    return m?.proficiency_bonus ?? 2;
  }


  private isMeleeAttack(actionName?: string, actionSlug?: string): boolean {
    const s = `${actionName ?? ""} ${actionSlug ?? ""}`.toLowerCase();
    if ((actionSlug ?? "").startsWith("weapon-thrown-")) return false;
    const rangedKeywords = [
      "bow",
      "crossbow",
      "dart",
      "sling",
      "ray of",
      "arrow",
      "firebolt",
      "fire bolt",
      "eldritch-blast",
      "eldritch blast",
      "scorching ray",
      "ranged",
    ];
    for (const kw of rangedKeywords) if (s.includes(kw)) return false;
    return true;
  }


  private async consumeOneShotEffects(
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
  ): Promise<void> {
    const isOneShot = (
      e: EffectInstance,
      side: "attacker" | "target",
    ): boolean => {
      const consumedByAttack =
        e.expiresAt.kind === "until_consumed" ||
        e.sourceFeatureSlug === "steady-aim" ||
        e.payload?.consumeOn === "targeted_by_attack";
      if (!consumedByAttack) return false;
      if (side === "attacker") {
        if (e.kind === "self_advantage_next_attack") {

          const requiredTargetId = (
            e.payload as { requiredTargetId?: string } | undefined
          )?.requiredTargetId;
          return !requiredTargetId || requiredTargetId === target.id;
        }

        if (e.kind === "self_disadvantage_next_attack") return true;
        return false;
      }

      return (
        e.kind === "grant_advantage_to_attackers" ||
        e.kind === "grant_disadvantage_to_attackers"
      );
    };
    const toConsumeAttacker = (attacker.effectInstances ?? []).filter((e) =>
      isOneShot(e, "attacker"),
    );
    const toConsumeTarget = (target.effectInstances ?? []).filter((e) =>
      isOneShot(e, "target"),
    );
    for (const e of toConsumeAttacker) {
      await this.effectInstances.removeEffect(attacker, e.id, "consumed");
    }
    for (const e of toConsumeTarget) {
      await this.effectInstances.removeEffect(target, e.id, "consumed");
    }
  }


  private resolveEffectInstanceDecisions(
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    isMelee: boolean,
    actionSlug?: string,
  ): {
    advantage: boolean;
    disadvantage: boolean;
    attackBonuses: Array<{ source: string; dice?: string; amount?: number }>;
    targetAcBonus: number;
    targetAcBaseOverride: number | null;
  } {
    const attackerFx = attacker.effectInstances ?? [];
    const targetFx = target.effectInstances ?? [];
    let advantage = false;
    let disadvantage = false;
    const attackBonuses: Array<{
      source: string;
      dice?: string;
      amount?: number;
    }> = [];


    for (const e of attackerFx) {
      if (e.kind === "self_advantage") {

        const scope = e.payload?.scope ?? "any";
        if (scope === "any" || (scope === "melee" && isMelee)) advantage = true;
      }
      if (e.kind === "self_disadvantage") disadvantage = true;
      if (e.kind === "self_advantage_next_attack") {


        const requiredTargetId = e.payload?.requiredTargetId;
        if (!requiredTargetId || requiredTargetId === target.id)
          advantage = true;
      }
      if (e.kind === "self_disadvantage_next_attack") disadvantage = true;
      if (e.kind === "attack_bonus") {
        const scope = e.payload?.scope ?? "any";
        const requiredWeaponSlug = e.payload?.weaponSlug;
        const applies =
          (scope === "any" || (scope === "melee" && isMelee)) &&
          (!requiredWeaponSlug || requiredWeaponSlug === actionSlug);
        if (!applies) continue;
        attackBonuses.push({
          source: e.sourceSpellSlug ?? e.sourceFeatureSlug ?? "effect",
          dice: e.payload?.diceExpression,
          amount: e.payload?.amount,
        });
      }
      if (e.kind === "attack_penalty") {
        attackBonuses.push({
          source: e.sourceSpellSlug ?? e.sourceFeatureSlug ?? "effect",
          dice: e.payload?.diceExpression
            ? `-${e.payload.diceExpression}`
            : undefined,
          amount: e.payload?.amount != null ? -e.payload.amount : undefined,
        });
      }
    }


    let targetAcBonus = 0;
    let targetAcBaseOverride: number | null = null;
    for (const e of targetFx) {
      if (e.kind === "ac_bonus") targetAcBonus += e.payload?.amount ?? 0;
      if (e.kind === "ac_base_override") {
        const override = e.payload?.amount;
        if (typeof override === "number") {
          targetAcBaseOverride = Math.max(targetAcBaseOverride ?? 0, override);
        }
      }
      if (e.kind === "grant_advantage_to_attackers") advantage = true;
      if (e.kind === "grant_disadvantage_to_attackers") disadvantage = true;
    }
    if (protectionDisadvantagesAttack(targetFx, attacker)) {
      disadvantage = true;
    }




    if ((target.conditions ?? []).includes("prone")) {
      if (isMelee) advantage = true;
      else disadvantage = true;
    }

    return {
      advantage,
      disadvantage,
      attackBonuses,
      targetAcBonus,
      targetAcBaseOverride,
    };
  }

  /**
   * Resolve the d20 portion of a spell attack without consuming the turn action
   * or applying damage. SpellCastingService owns those two responsibilities,
   * while this method keeps attack conditions, Help, Dodge, Bless/Bane and
   * one-shot advantage effects aligned with ordinary attacks.
   */
  async resolveSpellAttackRoll(
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    input: {
      attackBonus: number;
      actionName: string;
      isMelee: boolean;
      ownerUserId: string;
    },
  ): Promise<SpellAttackRollResolution> {
    const attackerMods = this.conditionEffects.getAttackModifiers(
      attacker.conditions,
    );
    const defenderMods = this.conditionEffects.getDefenseModifiers(
      target.conditions,
    );
    const activeHelper = await this.participantRepo.findOne({
      where: {
        encounterId: attacker.encounterId,
        helpingAllyParticipantId: attacker.id,
        helpingTargetParticipantId: target.id,
      },
    });
    const helpingState = activeHelper
      ? {
          allyParticipantId: attacker.id,
          targetParticipantId: target.id,
          expiresAtNextTurnOfParticipantId:
            activeHelper.helpingUntilTurnOfParticipantId ?? activeHelper.id,
        }
      : undefined;
    const reactive = this.conditionEffects.getReactiveAttackModifiers(
      {
        id: attacker.id,
        conditions: attacker.conditions ?? [],
        dodgingUntilTurnOfParticipantId:
          attacker.dodgingUntilTurnOfParticipantId,
      },
      {
        id: target.id,
        conditions: target.conditions ?? [],
        dodgingUntilTurnOfParticipantId:
          target.dodgingUntilTurnOfParticipantId,
      },
      helpingState ? { helpingAgainst: helpingState } : undefined,
    );
    const effectDec = this.resolveEffectInstanceDecisions(
      attacker,
      target,
      input.isMelee,
      undefined,
    );
    const consumeInspiration = attacker.inspirationArmed === true;

    let hasAdvantage =
      attackerMods.hasAdvantage ||
      defenderMods.attacksHaveAdvantage ||
      reactive.advantage ||
      effectDec.advantage ||
      consumeInspiration;
    let hasDisadvantage =
      attackerMods.hasDisadvantage ||
      defenderMods.attacksHaveDisadvantage ||
      reactive.disadvantage ||
      effectDec.disadvantage;
    let advantageCancelled = false;
    if (hasAdvantage && hasDisadvantage) {
      hasAdvantage = false;
      hasDisadvantage = false;
      advantageCancelled = true;
    }

    let attackRoll: number;
    let advantageResult:
      | { roll1: number; roll2: number; chosen: number; discarded: number }
      | undefined;
    if (hasAdvantage) {
      const adv = this.diceService.rollWithAdvantage();
      attackRoll = adv.chosen;
      advantageResult = adv;
    } else if (hasDisadvantage) {
      const dis = this.diceService.rollWithDisadvantage();
      attackRoll = dis.chosen;
      advantageResult = dis;
    } else {
      attackRoll = this.diceService.roll(20);
    }

    let targetAc = 10;
    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        input.ownerUserId,
      );
      const targetSheet = await this.sheetService.computeSheet(
        targetOwnerId,
        target.characterId,
      );
      targetAc =
        target.transformationState?.form.ac ?? targetSheet.armorClass;
    } else if (target.type === "monster" && target.monster) {
      const summonAc = getSummonStatBlock(target)?.armorClass;
      const ac = target.monster.armor_class as any;
      targetAc =
        summonAc ?? (Array.isArray(ac) ? ac[0]?.value : ac?.value) ?? 10;
    }
    targetAc = Math.max(targetAc, effectDec.targetAcBaseOverride ?? targetAc);
    targetAc += effectDec.targetAcBonus;
    const halfCover =
      await this.paladinAuras?.getSmiteOfProtectionHalfCover(target);
    targetAc += halfCover?.bonus ?? 0;

    const rolledEffectBonuses = effectDec.attackBonuses.map((bonus) => {
      if (bonus.dice) {
        const negated = bonus.dice.startsWith("-");
        const expression = negated ? bonus.dice.slice(1) : bonus.dice;
        const roll = this.diceService.rollExpression(expression);
        return {
          source: bonus.source,
          dice: bonus.dice,
          rolled: negated ? -roll.total : roll.total,
        };
      }
      return {
        source: bonus.source,
        amount: bonus.amount ?? 0,
        rolled: bonus.amount ?? 0,
      };
    });
    const effectBonusSum = rolledEffectBonuses.reduce(
      (sum, bonus) => sum + bonus.rolled,
      0,
    );

    let bardicBonus = 0;
    let bardicEvents: GameEventData[] = [];
    const hasBardicInspiration = (attacker.effectInstances ?? []).some(
      (effect) => effect.kind === "bardic_inspiration",
    );
    if (hasBardicInspiration) {
      const result = await this.bard.consumeBardicInspirationIfPresent(
        attacker.id,
        "attack_roll",
        (sides) => this.diceService.roll(sides),
      );
      bardicBonus = result.consumed ? result.bonus : 0;
      bardicEvents = result.events;
    }

    let exhaustionPenalty = 0;
    let exhaustionLevel = 0;
    if (attacker.type === "pc" && attacker.characterId) {
      const ownerId = await this.resolveParticipantOwner(
        attacker,
        input.ownerUserId,
      );
      const attackerSheet = await this.sheetService.computeSheet(
        ownerId,
        attacker.characterId,
      );
      exhaustionLevel =
        (attackerSheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
      if (exhaustionLevel > 0) {
        exhaustionPenalty =
          this.exhaustion.getModifiers(
            exhaustionLevel,
            "2024_ten_levels",
          ).d20Penalty ?? 0;
      }
    }

    const total =
      attackRoll +
      input.attackBonus +
      effectBonusSum +
      bardicBonus +
      exhaustionPenalty;
    const critical = attackRoll === 20;
    const criticalMiss = attackRoll === 1;
    const hit = !criticalMiss && (critical || total >= targetAc);
    const attackRollResult: AttackResult["attackRoll"] = {
      roll: attackRoll,
      modifier: input.attackBonus,
      total,
      targetAc,
      hit,
      critical,
      criticalMiss,
      advantage: advantageResult,
      hasAdvantage,
      hasDisadvantage,
      advantageCancelled,
      effectBonuses: rolledEffectBonuses,
    };
    const events: GameEventData[] = [
      ...bardicEvents,
      ...(halfCover
        ? [
            {
              event_type: "smite_of_protection_half_cover_applied",
              actor_participant_id: halfCover.sourceParticipantId,
              target_participant_id: target.id,
              data: {
                bonus: halfCover.bonus,
                sourcePaladinName: halfCover.sourceName,
                defense: "armor-class",
                finalArmorClass: targetAc,
                radiusFeet: halfCover.radiusFeet,
              },
            } satisfies GameEventData,
          ]
        : []),
      {
        event_type: "attack_roll",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          actionName: input.actionName,
          attackKind: "spell",
          ...attackRollResult,
        },
      },
    ];

    if (exhaustionPenalty !== 0) {
      events.push({
        event_type: "exhaustion_penalty_applied",
        actor_participant_id: attacker.id,
        data: {
          kind: "spell_attack_roll",
          level: exhaustionLevel,
          d20Penalty: exhaustionPenalty,
          rawRoll: attackRoll,
          modifier: input.attackBonus,
          finalTotal: total,
        },
      });
    }
    if (reactive.consumedHelp && activeHelper) {
      activeHelper.helpingAllyParticipantId = null;
      activeHelper.helpingTargetParticipantId = null;
      activeHelper.helpingUntilTurnOfParticipantId = null;
      await this.participantRepo.save(activeHelper);
      events.push({
        event_type: "help_consumed",
        actor_participant_id: activeHelper.id,
        data: {
          allyParticipantId: attacker.id,
          targetParticipantId: target.id,
        },
      });
    }
    if (consumeInspiration) {
      const result = await this.inspirationService.consumeIfArmed(
        attacker.id,
        "attack_roll",
      );
      if (result.consumed && result.eventData) {
        attacker.inspirationArmed = false;
        events.push(result.eventData);
      }
    }
    await this.consumeOneShotEffects(attacker, target);
    await this.participantRepo.save(attacker);

    return { attackRoll: attackRollResult, events };
  }



  async getCurrentTurn(encounterId: string): Promise<GameResult<TurnInfo>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");
    if (encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const participantId = encounter.turnOrder[encounter.currentTurnIndex];
    if (!participantId)
      return failure("Sem participante no turno.", "INVALID_PARTICIPANT");

    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant)
      return failure("Participante nao encontrado.", "PARTICIPANT_NOT_FOUND");

    return success({
      encounterId,
      round: encounter.currentRound,
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type,
      isDefeated: participant.isDefeated,
    });
  }

  async getTurnActions(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<TurnActionsResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const participant =
      await this.encounterService.getParticipant(participantId);
    const fearCompulsion = findFearCompulsion(participant);
    const resolvedOwnerId = await this.resolveParticipantOwner(
      participant,
      ownerUserId,
    );
    const speed = await this.movementService.getSpeed(
      participant,
      resolvedOwnerId,
    );
    const canMove = canMoveFromConditions(participant.conditions);

    let actions: TurnActionBlock[] = [];
    let bonusActions: TurnActionBlock[] = [];
    let reactions: TurnActionBlock[] = [];
    let freeActions: TurnActionBlock[] = [];

    if (participant.type === "pc" && participant.characterId) {


      if (participant.transformationState) {
        const form = participant.transformationState.form;
        const formSynthetic = {
          slug: form.monsterSlug ?? "transformed",
          name: form.formName,
          actions: form.actions,
        };
        actions = this.parseMonsterActions(formSynthetic);
        const multiattack = form.multiattack;
        if (
          multiattack &&
          Array.isArray(multiattack.sequence) &&
          multiattack.sequence.length > 0
        ) {
          const multiattackId = `${form.monsterSlug ?? "transformed"}-multiattack`;
          const multiattackRange = this.resolveMultiattackPreviewRange(
            actions,
            multiattack.sequence,
          );
          actions = [
            {
              id: multiattackId,
              name: "Multiattack",
              kind: "multiattack",
              timing: "action",
              source: "base",
              sourceLabel: "Multiattack",
              description: multiattack.description ?? "",
              sequence: multiattack.sequence,
              range: multiattackRange,
              rechargeRequired: null,
            },
            ...actions.filter(
              (action) =>
                action.id !== multiattackId &&
                action.name.trim().toLowerCase() !== "multiattack",
            ),
          ];
        }
        const retainsSpellcasting =
          participant.transformationState.retainedAbilities.includes(
            "spellcasting",
          );
        const retainsClassFeatures =
          participant.transformationState.retainedAbilities.includes(
            "class-features",
          );
        if (retainsSpellcasting || retainsClassFeatures) {
          const pcActions = await this.actionsService.getActions(
            resolvedOwnerId,
            participant.characterId,
          );
          const retainedSpells = (entries: typeof pcActions.actions) =>
            entries
              .filter((entry) => entry.source === "spell")
              .map(this.toTurnActionBlock);
          const retainedDruidFeatures = (entries: typeof pcActions.actions) =>
            entries
              .filter(
                (entry) =>
                  entry.source === "feature" &&
                  entry.sourceLabel?.startsWith("Druida"),
              )
              .map(this.toTurnActionBlock);
          if (retainsSpellcasting) {
            actions.push(...retainedSpells(pcActions.actions));
            bonusActions.push(...retainedSpells(pcActions.bonusActions));
            reactions.push(...retainedSpells(pcActions.reactions));
            freeActions.push(...retainedSpells(pcActions.freeActions ?? []));
          }
          if (retainsClassFeatures) {
            actions.push(...retainedDruidFeatures(pcActions.actions));
            bonusActions.push(
              ...retainedDruidFeatures(pcActions.bonusActions),
            );
            reactions.push(
              ...retainedDruidFeatures(pcActions.reactions),
            );
            freeActions.push(
              ...retainedDruidFeatures(pcActions.freeActions ?? []),
            );
          }
        }
      } else {
        const pcActions = await this.actionsService.getActions(
          resolvedOwnerId,
          participant.characterId,
        );
        actions = pcActions.actions.map(this.toTurnActionBlock);
        bonusActions = pcActions.bonusActions.map(this.toTurnActionBlock);
        reactions = pcActions.reactions.map(this.toTurnActionBlock);
        freeActions = (pcActions.freeActions ?? []).map(this.toTurnActionBlock);
        const wildResurgenceTurnRecoveryUsed = (
          participant.effectInstances ?? []
        ).some(
          (effect) =>
            effect.kind ===
            "wild_resurgence_slot_to_wild_shape_used_turn",
        );
        freeActions = freeActions.map((action) =>
          action.featureSlug === "wild-resurgence"
            ? { ...action, wildResurgenceTurnRecoveryUsed }
            : action,
        );
        const largeFormActive = (participant.effectInstances ?? []).some(
          (effect) => effect.sourceFeatureSlug === "large-form",
        );
        if (largeFormActive) {
          freeActions.push({
            id: "large-form-end",
            name: "Encerrar Forma Grande",
            timing: "free",
            source: "feature",
            sourceLabel: "Golias",
            description:
              "Retorna voluntariamente ao tamanho Médio e perde os benefícios da Forma Grande.",
            featureSlug: "large-form-end",
          });
        }

        const attackBonusEffects = (participant.effectInstances ?? []).filter(
          (effect) => effect.kind === "attack_bonus",
        );
        const withVisibleAttackBonuses = (
          action: TurnActionBlock,
        ): TurnActionBlock => {
          if (typeof action.attackBonus !== "number") return action;
          const matching = attackBonusEffects.filter((effect) => {
            const scope = effect.payload?.scope ?? "any";
            const weaponSlug = effect.payload?.weaponSlug;
            const isMelee = this.isMeleeAttack(action.name, action.id);
            return (
              (scope === "any" || (scope === "melee" && isMelee)) &&
              (!weaponSlug || weaponSlug === action.id)
            );
          });
          if (matching.length === 0) return action;
          const amount = matching.reduce(
            (total, effect) => total + (effect.payload?.amount ?? 0),
            0,
          );
          const sources = matching
            .map(
              (effect) =>
                effect.sourceFeatureSlug ??
                effect.sourceSpellSlug ??
                "efeito",
            )
            .join(", ");
          return {
            ...action,
            attackBonus: action.attackBonus + amount,
            description: `${action.description ?? ""} Bônus ativo: +${amount} (${sources}).`.trim(),
          };
        };
        actions = actions.map(withVisibleAttackBonuses);
        bonusActions = bonusActions.map(withVisibleAttackBonuses);
      }
    } else if (participant.type === "monster" && participant.monster) {
      const summonActions = this.buildSummonActions(participant);
      actions = summonActions ?? this.parseMonsterActions(participant.monster);
      bonusActions = this.buildOtherworldlySteedBonusActions(participant);
      const multiattack = (participant.monster as any).multiattack;
      if (
        !summonActions &&
        multiattack &&
        Array.isArray(multiattack.sequence) &&
        multiattack.sequence.length > 0
      ) {
        const multiattackId = `${(participant.monster as any).slug ?? "monster"}-multiattack`;
        const multiattackRange = this.resolveMultiattackPreviewRange(
          actions,
          multiattack.sequence,
        );
        actions = [
          {
            id: multiattackId,
            name: "Multiataque",
            kind: "multiattack",
            timing: "action",
            source: "base",
            sourceLabel: "Multiataque",
            description: multiattack.description ?? "",
            sequence: multiattack.sequence,
            range: multiattackRange,
            rechargeRequired: multiattack.recharge ?? null,
          },
          ...actions.filter(
            (action) =>
              action.id !== multiattackId &&
              action.name.trim().toLowerCase() !== "multiattack",
          ),
        ];
      }
      const spellcasting = (participant.monster as any).spellcasting;
      if (
        spellcasting &&
        Array.isArray(spellcasting.knownSpells) &&
        spellcasting.knownSpells.length > 0
      ) {
        const spellBlocks: TurnActionBlock[] = spellcasting.knownSpells.map(
          (ks: any, i: number) => ({
            id: `monster-spell-${i}`,
            name: ks.slug,
            timing: "action",
            source: "spell",
            sourceLabel: spellcasting.type === "innate" ? "Inata" : "Preparada",
            description:
              spellcasting.type === "innate"
                ? `Uso: ${spellcasting.dailyUses?.[ks.slug] ?? "at-will"}`
                : `Nível ${ks.level}${ks.level === 0 ? " (cantrip)" : ""}`,
            spellLevel: ks.level,
          }),
        );
        actions = [
          {
            id: "monster-spell-opener",
            name: "Magia",
            kind: "spell-opener",
            timing: "action",
            source: "base",
            sourceLabel: "Magia",
            description: `${spellcasting.type === "innate" ? "Magia inata" : "Conjuração"} — DC ${spellcasting.saveDc}, +${spellcasting.attackBonus} ataque mágico.`,
          },
          ...actions,
          ...spellBlocks,
        ];
      }
      const legendary = (participant.monster as any).legendary_actions as
        | any[]
        | undefined;
      if (legendary?.length) {
        actions = actions.concat(
          legendary.map((a: any, i: number) => {
            const block = this.buildMonsterActionBlock(
              participant.monster,
              a,
              i,
              "monster-legendary",
            );
            return { ...block, name: `⭐ ${block.name}` };
          }),
        );
      }
      const monsterReactions = (participant.monster as any).reactions as
        | any[]
        | undefined;
      if (monsterReactions?.length) {
        reactions = monsterReactions.map((a: any, i: number) => {
          const block = this.buildMonsterActionBlock(
            participant.monster,
            a,
            i,
            "monster-reaction",
          );
          return { ...block, timing: "reaction" };
        });
      }
    }

    const witchBoltTether = findWitchBoltTether(participant);
    if (witchBoltTether) {
      const tetherTarget = await this.participantRepo.findOne({
        where: { id: witchBoltTether.targetParticipantId },
      });
      const distanceFt =
        tetherTarget &&
        participant.positionX != null &&
        participant.positionY != null &&
        tetherTarget.positionX != null &&
        tetherTarget.positionY != null
          ? chebyshevDistanceFt(
              { x: participant.positionX, y: participant.positionY },
              { x: tetherTarget.positionX, y: tetherTarget.positionY },
            )
          : null;
      if (
        tetherTarget &&
        !tetherTarget.isDefeated &&
        encounter.currentRound > witchBoltTether.createdRound &&
        (distanceFt == null || distanceFt <= witchBoltTether.rangeFt)
      ) {
        bonusActions.unshift({
          id: "sustain-witch-bolt",
          name: `Witch Bolt — ${tetherTarget.displayName}`,
          kind: "sustained-spell",
          timing: "bonus_action",
          source: "spell-effect",
          sourceLabel: "Witch Bolt",
          description:
            "Ação bônus: causa 1d12 de dano elétrico automaticamente ao alvo conectado.",
          damage: { dice: "1d12", type: "lightning" },
          range: "60 feet",
          requiresConcentration: true,
        });
      }
    }

    const activeCallLightning = (participant.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "call_lightning_active" &&
        effect.requiresConcentration &&
        effect.sourceCasterParticipantId === participant.id,
    );
    if (
      activeCallLightning &&
      participant.isConcentrating &&
      participant.concentratingOn
        ?.trim()
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "") === "call-lightning"
    ) {
      actions.unshift({
        id: "sustain-call-lightning",
        name: "Chamar Relâmpago",
        kind: "sustained-spell",
        timing: "action",
        source: "spell-effect",
        sourceLabel: "Call Lightning",
        description:
          "Ação Mágica: escolha um ponto a até 120 pés. Criaturas a até 5 pés fazem DEX; sofrem o dano da tempestade ou metade no sucesso.",
        damage: {
          dice:
            activeCallLightning.payload.diceExpression ??
            `${Math.max(3, Number(activeCallLightning.payload.slotLevel ?? 3))}d10`,
          type: "lightning",
        },
        save: {
          ability: "dex",
          dc: Number(activeCallLightning.payload.saveDc ?? 13),
          halfOnSuccess: true,
        },
        range: "120 feet",
        requiresConcentration: true,
        aoe: {
          shape: "sphere",
          sizeFt: 5,
          rangeFt: 120,
          originType: "point",
        },
      });
    }

    const activePersistentAreas =
      await this.persistentArea.listByEncounter(encounterId);
    const activeSpiritualWeapon = activePersistentAreas.find(
      (area) =>
        area.casterParticipantId === participant.id &&
        area.sourceSpell
          .toLowerCase()
          .replace(/-(phb|xphb|srd52)$/, "") === "spiritual-weapon",
    );
    if (activeSpiritualWeapon) {
      const casterSheet =
        participant.characterId != null
          ? await this.sheetService.computeSheet(
              ownerUserId,
              participant.characterId,
            )
          : null;
      const spellAttackBonus =
        casterSheet?.classes.find(
          (classBlock) => classBlock.spellAttackBonus != null,
        )?.spellAttackBonus ?? 0;
      bonusActions.unshift({
        id: "relocate-spiritual-weapon",
        name: "Mover e atacar — Spiritual Weapon",
        kind: "relocate-area",
        timing: "bonus_action",
        source: "spell-effect",
        sourceLabel: "Spiritual Weapon",
        description:
          "Ação bônus: mova a arma espectral até 20 pés e, opcionalmente, faça um ataque mágico corpo a corpo contra uma criatura a até 5 pés dela.",
        attackBonus: spellAttackBonus,
        damage: {
          dice: activeSpiritualWeapon.damageDice,
          type: "force",
        },
        range: "20 feet",
        requiresConcentration: false,
        aoe: {
          shape: "sphere",
          sizeFt: 5,
          rangeFt: 20,
          originType: "point",
          placementOrigin: {
            col: activeSpiritualWeapon.originCell.x,
            row: activeSpiritualWeapon.originCell.y,
          },
        },
      });
    }
    const activeCloudOfDaggers = activePersistentAreas.find(
      (area) =>
        area.casterParticipantId === participant.id &&
        area.sourceSpell === "cloud-of-daggers",
    );
    if (
      activeCloudOfDaggers &&
      participant.isConcentrating &&
      participant.concentratingOn === "cloud-of-daggers"
    ) {
      actions.unshift({
        id: "relocate-cloud-of-daggers",
        name: "Mover Nuvem de Adagas",
        kind: "relocate-area",
        timing: "action",
        source: "spell-effect",
        sourceLabel: "Cloud of Daggers",
        description:
          "Ação de Magia: teleporta o cubo até 30 pés. Uma criatura no novo espaço sofre o dano, no máximo uma vez por turno.",
        range: "30 feet",
        requiresConcentration: true,
        aoe: {
          shape: "cube",
          sizeFt: 5,
          rangeFt: 30,
          originType: "point",
        },
      });
    }

    const activeConjureAnimals = activePersistentAreas.find(
      (area) =>
        area.casterParticipantId === participant.id &&
        area.sourceSpell === "conjure-animals",
    );
    const conjureAnimalsTurnKey = `${encounter.currentRound}:${encounter.currentTurnIndex}`;
    const baseMovementForConjureAnimals = activeConjureAnimals
      ? await this.movementService.getBaseSpeed(participant, ownerUserId)
      : null;
    const casterMovedThisTurn =
      baseMovementForConjureAnimals != null &&
      (participant.movementRemaining ?? baseMovementForConjureAnimals) <
        baseMovementForConjureAnimals;
    if (
      activeConjureAnimals &&
      participant.isConcentrating &&
      participant.concentratingOn
        ?.trim()
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "") === "conjure-animals" &&
      casterMovedThisTurn &&
      activeConjureAnimals.tacticalMetadata?.relocatedTurnKey !==
        conjureAnimalsTurnKey
    ) {
      actions.unshift({
        id: "relocate-conjure-animals",
        name: "Mover Matilha Espiritual",
        kind: "relocate-area",
        timing: "free",
        source: "spell-effect",
        sourceLabel: "Conjure Animals",
        description:
          "Após se mover: desloque gratuitamente a matilha Grande em até 30 pés. Criaturas que ela alcançar fazem DEX; 3d10 cortante, metade no sucesso, uma vez por turno.",
        range: "30 feet",
        requiresConcentration: true,
        aoe: {
          shape: "cube",
          sizeFt: 30,
          rangeFt: 30,
          originType: "point",
          placementOrigin: {
            col: activeConjureAnimals.originCell.x,
            row: activeConjureAnimals.originCell.y,
          },
        },
      });
    }

    if (participant.type === "pc") {
      const familiar = (
        await this.participantRepo.find({
          where: {
            encounterId,
            linkedCasterParticipantId: participant.id,
          },
        })
      ).find((candidate) => isFindFamiliarSummon(candidate));
      if (familiar) {
        const pocketed = getSummonMetadata(familiar)?.pocketed === true;
        if (pocketed) {
          actions.unshift({
            id: "familiar-pocket-reappear",
            name: `Reaparecer ${familiar.displayName}`,
            kind: "relocate-area",
            timing: "action",
            source: "feature",
            sourceLabel: "Find Familiar",
            description:
              "Faça o familiar reaparecer em um espaço desocupado a até 30 pés.",
            range: "30 feet",
            aoe: {
              shape: "cube",
              sizeFt: 5,
              rangeFt: 30,
              originType: "point",
            },
          });
        } else if (familiar.isVisible && !familiar.isDefeated) {
          actions.unshift(
            {
              id: "familiar-share-senses",
              name: `Compartilhar sentidos (${familiar.displayName})`,
              kind: "familiar-action",
              timing: "action",
              source: "feature",
              sourceLabel: "Find Familiar",
              description:
                "Veja e ouça pelos sentidos do familiar até o início do seu próximo turno. Durante esse período, você fica cego e surdo aos próprios arredores.",
            },
            {
              id: "familiar-pocket-dismiss",
              name: `Dispensar ${familiar.displayName}`,
              kind: "familiar-action",
              timing: "action",
              source: "feature",
              sourceLabel: "Find Familiar",
              description:
                "Dispensa temporariamente o familiar para um bolsão dimensional.",
            },
          );

          const familiarWithinTelepathy =
            participant.positionX != null &&
            participant.positionY != null &&
            familiar.positionX != null &&
            familiar.positionY != null &&
            chebyshevDistanceFt(
              { x: participant.positionX, y: participant.positionY },
              { x: familiar.positionX, y: familiar.positionY },
            ) <= 100;
          if (familiarWithinTelepathy && (familiar.reactionsUsed ?? 0) < 1) {
            const touchSpells = [...actions, ...bonusActions].filter(
              (action) =>
                action.source === "spell" &&
                action.range?.trim().toLowerCase() === "touch",
            );
            actions.push(
              ...touchSpells.map((action) => ({
                ...action,
                id: `familiar-deliver-${action.id}`,
                name: `${action.name} via ${familiar.displayName}`,
                sourceLabel: "Reação do Familiar",
                description: `${action.description} O alcance é medido a partir do familiar, que consome a própria reação.`,
                spellSlug: action.id.startsWith("spell-")
                  ? action.id.slice("spell-".length)
                  : action.name,
                deliverThroughFamiliar: true,
                targetingOriginParticipantId: familiar.id,
              })),
            );
          }
        }
      }
    }


    const webRestraint = (participant.conditionInstances ?? []).find(
      isWebRestraint,
    );
    const freedomRestraints = (participant.conditionInstances ?? []).filter(
      isNonmagicalFreedomRestraint,
    );
    const hasLegacyFreedomRestraint = (participant.conditions ?? []).some(
      (slug) =>
        (slug === "grappled" || slug === "restrained") &&
        !(participant.conditionInstances ?? []).some(
          (condition) => condition.slug === slug,
        ),
    );
    const canUseFreedomEscape =
      hasFreedomOfMovement(participant) &&
      (freedomRestraints.length > 0 || hasLegacyFreedomRestraint);
    const hasConjureWoodlandBeings =
      participant.isConcentrating &&
      participant.concentratingOn
        ?.trim()
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/, "") ===
        "conjure-woodland-beings";
    const nearbyHypnotized =
      participant.positionX == null || participant.positionY == null
        ? []
        : (
            await this.participantRepo.find({
              where: { encounterId },
            })
          ).filter(
            (target) =>
              target.id !== participant.id &&
              !target.isDefeated &&
              target.positionX != null &&
              target.positionY != null &&
              chebyshevDistanceFt(
                { x: participant.positionX!, y: participant.positionY! },
                { x: target.positionX, y: target.positionY },
              ) <= 5 &&
              (target.conditionInstances ?? []).some(
                (condition) =>
                  condition.slug === "hypnotized" &&
                  condition.sourceSpell
                    ?.toLowerCase()
                    .replace(/-(phb|xphb|srd52)$/, "") ===
                    "hypnotic-pattern",
              ),
          );
    const genericActions: TurnActionBlock[] = fearCompulsion
      ? [
          {
            id: "generic-flee-fear",
            name: "Fugir de Fear",
            kind: "condition-escape",
            timing: "action",
            source: "generic",
            sourceLabel: "Fear",
            description:
              "Obrigatório: usa Disparada e só permite movimento para longe do conjurador. A salvaguarda de WIS só ocorre ao terminar sem vê-lo.",
          } as TurnActionBlock,
        ]
      : [
          ...(canUseFreedomEscape
            ? [
                {
                  id: "generic-freedom-escape",
                  name: "Escapar com Freedom of Movement",
                  kind: "condition-escape",
                  timing: "movement",
                  source: "generic",
                  sourceLabel: "Freedom of Movement",
                  description:
                    "Gasta 5 pés de movimento e escapa automaticamente de Agarrado ou Restringido não mágico.",
                  movementCostFt: FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT,
                } as TurnActionBlock,
              ]
            : []),
          ...(webRestraint
            ? [
                {
                  id: "generic-escape-web",
                  name: "Escapar da Teia",
                  kind: "condition-escape",
                  timing: "action",
                  source: "generic",
                  sourceLabel: "Web",
                  description: `Teste de Força contra CD ${webRestraint.saveDc ?? 13}. Com sucesso, encerra Restrito.`,
                } as TurnActionBlock,
              ]
            : []),
          ...((participant.conditions ?? []).includes("prone")
            ? [
                {
                  id: "generic-stand-up",
                  name: "Levantar",
                  timing: "movement",
                  source: "generic",
                  sourceLabel: "Movimento PHB",
                  description: `Gasta metade da velocidade (${Math.floor(speed / 2)}ft) e encerra Caído.`,
                  movementCostFt: Math.floor(speed / 2),
                } as TurnActionBlock,
              ]
            : []),
          ...nearbyHypnotized.map(
            (target) =>
              ({
                id: `generic-wake-hypnotized-${target.id}`,
                name: `Despertar ${target.displayName}`,
                kind: "wake-hypnotized",
                timing: "action",
                source: "generic",
                sourceLabel: "Hypnotic Pattern",
                description:
                  "Sacode uma criatura adjacente e encerra o transe hipnótico.",
                targetParticipantId: target.id,
              }) as TurnActionBlock,
          ),
          this.makeGenericAction("dodge", "Esquivar"),
          this.makeGenericAction("dash", "Disparada"),
          hasConjureWoodlandBeings
            ? ({
                id: "generic-disengage",
                name: "Desengajar (Conjure Woodland Beings)",
                timing: "bonus_action",
                source: "generic",
                sourceLabel: "Conjure Woodland Beings",
                description:
                  "Durante a concentração, você pode usar Desengajar como ação bônus.",
              } as TurnActionBlock)
            : this.makeGenericAction("disengage", "Desengajar"),
          this.makeGenericAction("help", "Ajudar"),
          this.makeGenericAction("hide", "Esconder"),
          this.makeGenericAction("ready", "Preparar"),
          this.makeGenericAction("search", "Procurar"),
          this.makeGenericAction("use-object", "Usar Objeto"),
        ];




    const dyingStateBlocksAction =
      participant.type === "pc" && participant.dyingState !== "none";
    const canTakeAction =
      !dyingStateBlocksAction &&
      this.conditionEffects.canTakeAction(participant.conditions ?? []);
    const actionBlockedBy = canTakeAction
      ? undefined
      : dyingStateBlocksAction
        ? participant.dyingState
        : (participant.conditions ?? []).find((condition) =>
          [
            "incapacitated",
            "stunned",
            "paralyzed",
            "petrified",
            "unconscious",
            "haste_lethargy",
            "hypnotized",
          ].includes(condition),
        );

    const rechargeState = participant.rechargeState ?? {};
    const exposeRechargeState = (action: TurnActionBlock): TurnActionBlock =>
      action.rechargeRequired
        ? {
            ...action,
            uses: rechargeState[action.name] === "used" ? 0 : 1,
            usesMax: 1,
            usesRecharge: `roll-${action.rechargeRequired}`,
          }
        : action;
    actions = actions.map(exposeRechargeState);
    reactions = reactions.map(exposeRechargeState);

    return success({
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type,
      actions: fearCompulsion ? [] : actions,
      genericActions,
      bonusActions,
      reactions,
      freeActions,
      canMove:
        canMove &&
        !dyingStateBlocksAction &&
        (participant.movementRemaining ?? speed) > 0,
      remainingMovement: canMove && !dyingStateBlocksAction
        ? (participant.movementRemaining ?? speed)
        : 0,
      speed,
      canTakeAction,
      actionBlockedBy,
      actionUsed: participant.actionUsed,
      bonusActionUsed: participant.bonusActionUsed,
      reactionUsed: (participant.reactionsUsed ?? 0) > 0,
      attacksUsedThisTurn: participant.attacksUsedThisTurn ?? 0,
      attacksMaxThisTurn: participant.attacksMaxThisTurn ?? 1,
      bonusUnarmedAttacksRemainingThisTurn:
        participant.bonusUnarmedAttacksRemainingThisTurn ?? 0,
      freeObjectInteractionUsed:
        (participant.freeObjectInteractionsUsed ?? 0) >= 1,
      hasDisengaged: participant.hasDisengaged,
      hasDashed: participant.hasDashed,
      hasteActionAvailable: hasAvailableHasteAction(participant),
    });
  }


  private makeGenericAction(
    genericKind:
      | "dodge"
      | "dash"
      | "disengage"
      | "help"
      | "hide"
      | "ready"
      | "search"
      | "use-object",
    label: string,
  ): TurnActionBlock {



    return {
      id: `generic-${genericKind}`,
      name: label,
      timing: "action",
      source: "generic",
      sourceLabel: "Ação PHB",
      description: `Ação genérica: ${label}`,
    } as unknown as TurnActionBlock;
  }

  private toTurnActionBlock(a: any): TurnActionBlock {



    const save =
      a.save ??
      (typeof a.saveDc === "number" && a.saveAbility
        ? {
            ability: String(a.saveAbility).toLowerCase().slice(0, 3),
            dc: a.saveDc,
            halfOnSuccess: a.saveSuccess === "half" || a.halfOnSuccess === true,
          }
        : undefined);

    return {
      id: a.id,
      name: a.name,
      timing: a.timing,
      source: a.source,
      sourceLabel: a.sourceLabel,
      description: a.description,
      kind: a.kind,
      attackBonus: a.attackBonus,
      damage: a.damage,
      range: a.range,
      spellLevel: a.spellLevel,
      requiresConcentration: a.requiresConcentration,
      automationStatus: a.automationStatus,
      behaviorKind: a.behaviorKind,
      automationTags: a.automationTags,
      aoe: a.aoe,
      save,
      sequence: a.sequence,
      rechargeRequired: a.rechargeRequired,

      featureSlug: a.featureSlug,

      weaponSlug: a.weaponSlug,
      itemSlug: a.itemSlug,
      masterySlug: a.masterySlug,

      proficient: a.proficient,
      handSlot: a.handSlot,

      uses: a.uses,
      usesMax: a.usesMax,
      usesRecharge: a.usesRecharge,
      wildResurgenceSlotRecoveryUsed:
        a.wildResurgenceSlotRecoveryUsed,
      wildResurgenceTurnRecoveryUsed:
        a.wildResurgenceTurnRecoveryUsed,
      faithfulSteedFreeCastUsed:
        a.faithfulSteedFreeCastUsed,
    } as TurnActionBlock;
  }

  private parseMonsterActions(monster: any): TurnActionBlock[] {
    const monsterActions = (monster.actions as any[]) ?? [];
    const monsterSlug: string = monster.slug ?? "";
    return monsterActions.map((a: any, i: number) =>
      this.buildMonsterActionBlock(monster, a, i, monsterSlug),
    );
  }

  private buildMonsterActionBlock(
    monster: any,
    a: any,
    i: number,
    idPrefix: string,
  ): TurnActionBlock {



    const resolved = this.monsterActionResolver.resolve(a, monster?.name);
    const desc = resolved.description;
    const attackBonus = resolved.hasAttack ? resolved.attackBonus : undefined;
    const damage = resolved.damageDice
      ? {
          dice: resolved.damageDice,
          type: resolved.damageType ?? "bludgeoning",
          bonus: 0,
        }
      : undefined;






    const coneMatch = desc.match(/(\d+)[- ]?foot\s+cone/i);
    const lineMatch = desc.match(/(\d+)[- ]?foot(?:\s+long)?\s+line/i);
    const sphereMatch = desc.match(/(\d+)[- ]?foot[- ]?radius/i);
    const cubeMatch = desc.match(/(\d+)[- ]?foot\s+cube/i);
    let aoe: TurnActionBlock["aoe"];
    if (coneMatch) {
      const size = parseInt(coneMatch[1], 10);
      aoe = { originType: "self", shape: "cone", sizeFt: size, rangeFt: 0 };
    } else if (lineMatch) {
      const size = parseInt(lineMatch[1], 10);
      aoe = { originType: "self", shape: "line", sizeFt: size, rangeFt: 0 };
    } else if (sphereMatch) {
      const size = parseInt(sphereMatch[1], 10);
      aoe = { originType: "self", shape: "sphere", sizeFt: size, rangeFt: 0 };
    } else if (cubeMatch) {
      const size = parseInt(cubeMatch[1], 10);
      aoe = { originType: "self", shape: "cube", sizeFt: size, rangeFt: 0 };
    }


    const saveMatch = desc.match(
      /DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i,
    );
    const save = saveMatch
      ? {
          dc: parseInt(saveMatch[1], 10),
          ability: saveMatch[2].substring(0, 3).toLowerCase(),
          halfOnSuccess:
            /half as much damage on a successful/i.test(desc) ||
            /takes half (?:the )?.*damage/i.test(desc),
        }
      : undefined;

    const range = resolved.reach ?? resolved.range;

    const rawName = String(a.name ?? "Ataque");
    const displayName = monsterActionDisplayName(a);
    const rechargeRequired = getMonsterRechargeRange(a);
    const isAirElementalWhirlwind =
      String(monster?.slug ?? "")
        .toLowerCase()
        .replace(/-(phb|xphb|srd52)$/i, "") === "air-elemental" &&
      displayName.toLowerCase().startsWith("whirlwind");
    if (isAirElementalWhirlwind) {
      aoe = {
        originType: "self",
        shape: "sphere",
        sizeFt: 5,
        rangeFt: 0,
      };
    }

    const actionSlug = idPrefix
      ? `${idPrefix}-${rawName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}`
      : `monster-action-${i}`;

    const isAttack = resolved.hasAttack || damage != null;

    return {
      id: actionSlug,
      name: displayName,
      timing: "action",
      source: isAttack ? "base" : "special",
      sourceLabel: isAttack ? monster.name : "Habilidade Especial",
      description: desc,
      attackBonus,
      damage,
      secondarySaveDamage: resolved.secondarySaveDamage
        ? {
            save: {
              ability: resolved.secondarySaveDamage.saveAbility,
              dc: resolved.secondarySaveDamage.saveDc,
              halfOnSuccess: resolved.secondarySaveDamage.halfOnSuccess,
            },
            damage: {
              dice: resolved.secondarySaveDamage.damageDice,
              type: resolved.secondarySaveDamage.damageType,
            },
          }
        : undefined,
      range,
      aoe,
      save,
      rechargeRequired,
    };
  }

  private resolveMultiattackPreviewRange(
    actions: TurnActionBlock[],
    sequence: Array<{ actionName: string; count: number }>,
  ): string | undefined {
    const ranges = sequence.map((subAttack) => {
      const action = actions.find(
        (candidate) =>
          candidate.name.trim().toLowerCase() ===
          subAttack.actionName.trim().toLowerCase(),
      );
      if (!action?.range) return null;
      const parsed = parseRangeString(action.range);
      if (!parsed) return null;
      return {
        value: action.range,
        normal: parsed.normal,
        maximum: parsed.long ?? parsed.normal,
      };
    });
    if (ranges.some((range) => range == null)) return undefined;
    return ranges
      .filter((range): range is NonNullable<typeof range> => range != null)
      .sort(
        (left, right) =>
          left.maximum - right.maximum || left.normal - right.normal,
      )[0]?.value;
  }

  private buildSummonActions(
    participant: EncounterParticipantEntity,
  ): TurnActionBlock[] | null {
    if (isFindFamiliarSummon(participant)) return [];
    const statBlock = getSummonStatBlock(participant);
    if (!statBlock) return null;

    const attack: TurnActionBlock = {
      id: `${statBlock.kind}-${this.slugifyName(statBlock.attack.name)}`,
      name: statBlock.attack.name,
      kind: "attack",
      timing: "action",
      source: "base",
      sourceLabel:
        statBlock.kind === "bestial-spirit"
          ? "Espírito Bestial"
          : statBlock.kind === "elemental-spirit"
            ? "Espírito Elemental"
            : "Corcel Extraplanar",
      description: `Ataque mágico corpo a corpo: +${statBlock.attack.attackBonus} para atingir, alcance ${statBlock.attack.reachFt} pés. Dano: ${statBlock.attack.damageDice} + ${statBlock.attack.damageBonus} ${statBlock.attack.damageType}.`,
      attackBonus: statBlock.attack.attackBonus,
      damage: {
        dice: statBlock.attack.damageDice,
        bonus: statBlock.attack.damageBonus,
        type: statBlock.attack.damageType,
      },
      range: `${statBlock.attack.reachFt} feet`,
    };
    if (statBlock.attack.attacksPerAction <= 1) return [attack];

    return [
      {
        id: `${statBlock.kind}-multiattack`,
        name: "Multiataque",
        kind: "multiattack",
        timing: "action",
        source: "base",
        sourceLabel:
          statBlock.kind === "bestial-spirit"
            ? "Espírito Bestial"
            : statBlock.kind === "elemental-spirit"
              ? "Espírito Elemental"
              : "Corcel Extraplanar",
        description: `O espírito realiza ${statBlock.attack.attacksPerAction} ataques de ${statBlock.attack.name}.`,
        range: attack.range,
        sequence: [
          {
            actionName: statBlock.attack.name,
            count: statBlock.attack.attacksPerAction,
          },
        ],
      },
      attack,
    ];
  }

  private buildOtherworldlySteedBonusActions(
    participant: EncounterParticipantEntity,
  ): TurnActionBlock[] {
    const statBlock = getSummonStatBlock(participant);
    if (
      statBlock?.kind !== "otherworldly-steed" ||
      !statBlock.steed
    ) {
      return [];
    }
    const giftUsed = getSummonMetadata(participant)?.giftUsed === true;
    const details = {
      "healing-touch": {
        name: "Toque Curativo",
        description: `Toque um aliado e restaure 2d8 + ${statBlock.slotLevel} PV.`,
        range: "5 feet",
        behaviorKind: "healing" as const,
      },
      "fey-step": {
        name: "Passo Feérico",
        description:
          "Teleporte-se a até 60 pés; o Paladino vinculado vai junto se estiver adjacente.",
        range: "60 feet",
        behaviorKind: "buff" as const,
      },
      "fell-glare": {
        name: "Olhar Terrível",
        description: `Uma criatura a até 60 pés faz resistência de SAB CD ${statBlock.steed.spellSaveDc}; na falha, fica Amedrontada.`,
        range: "60 feet",
        behaviorKind: "condition" as const,
      },
    }[statBlock.steed.bonusAction];
    return [
      {
        id: `otherworldly-steed-${statBlock.steed.bonusAction}`,
        name: details.name,
        kind: "steed-gift",
        timing: "bonus_action",
        source: "summon",
        sourceLabel: "Dom Extraplanar",
        description: details.description,
        range: details.range,
        behaviorKind: details.behaviorKind,
        uses: giftUsed ? 0 : 1,
        usesMax: 1,
        usesRecharge: "long-rest",
        ...(statBlock.steed.bonusAction === "fell-glare"
          ? {
              save: {
                ability: "wis",
                dc: statBlock.steed.spellSaveDc,
              },
            }
          : {}),
      },
    ];
  }

  private async hasSummonPackTacticsAdvantage(
    encounterId: string,
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
  ): Promise<boolean> {
    if (getSummonStatBlock(attacker)?.traits.packTactics !== true) return false;
    if (target.positionX == null || target.positionY == null) return false;

    const participants = await this.participantRepo.find({
      where: { encounterId },
    });
    return participants.some(
      (candidate) =>
        candidate.id !== attacker.id &&
        candidate.faction === attacker.faction &&
        !candidate.isDefeated &&
        candidate.positionX != null &&
        candidate.positionY != null &&
        !(candidate.conditions ?? []).some((condition) =>
          [
            "incapacitated",
            "paralyzed",
            "petrified",
            "stunned",
            "unconscious",
          ].includes(condition),
        ) &&
        Math.max(
          Math.abs(candidate.positionX - target.positionX!),
          Math.abs(candidate.positionY - target.positionY!),
        ) <= 1,
    );
  }

  private async resolveCelestialRevelationEndTurn(
    encounterId: string,
    source: EncounterParticipantEntity,
  ): Promise<GameEventData[]> {
    const effect = (source.effectInstances ?? []).find(
      (candidate) =>
        candidate.kind === "celestial_revelation" &&
        candidate.payload?.form === "inner-radiance",
    );
    if (
      !effect ||
      source.positionX == null ||
      source.positionY == null ||
      source.isDefeated
    ) {
      return [];
    }
    const damage = Math.max(
      0,
      Number(effect.payload?.extraDamageAmount ?? 0),
    );
    if (damage <= 0) return [];

    const targets = await this.participantRepo.find({
      where: { encounterId },
      relations: ["monster"],
    });
    const events: GameEventData[] = [];
    const results: Array<{
      targetParticipantId: string;
      damageApplied: number;
      hpAfter: number;
      resisted: boolean;
      immune: boolean;
      vulnerable: boolean;
      defeated: boolean;
    }> = [];
    for (const target of targets) {
      if (
        target.id === source.id ||
        target.isDefeated ||
        target.positionX == null ||
        target.positionY == null
      ) {
        continue;
      }
      const distanceFt =
        Math.max(
          Math.abs(source.positionX - target.positionX),
          Math.abs(source.positionY - target.positionY),
        ) * 5;
      if (distanceFt > 10) continue;

      const ownerUserId = await this.resolveParticipantOwner(target, "");
      const result = await this.applyDamage(
        encounterId,
        {
          targetParticipantId: target.id,
          amount: damage,
          damageType: "radiant",
          ownerUserId,
        },
        { emitEvents: false },
      );
      if (!result.ok) continue;
      events.push(...result.events);
      results.push({
        targetParticipantId: target.id,
        damageApplied: result.value.damageApplied,
        hpAfter: result.value.hpAfter,
        resisted: result.value.resisted,
        immune: result.value.immune,
        vulnerable: result.value.vulnerable,
        defeated: result.value.defeated,
      });
    }
    events.push({
      event_type: "celestial_revelation_inner_radiance",
      actor_participant_id: source.id,
      data: {
        featureSlug: "celestial-revelation",
        form: "inner-radiance",
        radiusFt: 10,
        damage,
        targets: results,
      },
    });
    return events;
  }

  private async resolveCelestialRevelationFearEndTurn(
    encounterId: string,
    source: EncounterParticipantEntity,
  ): Promise<GameEventData[]> {
    const effect = (source.effectInstances ?? []).find(
      (candidate) =>
        candidate.kind === "celestial_revelation" &&
        candidate.payload?.form === "necrotic-shroud",
    );
    const targetIds = effect?.payload?.frightenedTargetIds ?? [];
    const sourceTurnsRemaining = Number(
      effect?.payload?.fearSourceTurnsRemaining ?? 0,
    );
    if (!effect || targetIds.length === 0 || sourceTurnsRemaining <= 0) {
      return [];
    }

    if (sourceTurnsRemaining > 1) {
      effect.payload = {
        ...(effect.payload ?? {}),
        fearSourceTurnsRemaining: sourceTurnsRemaining - 1,
      };
      await this.participantRepo.save(source);
      return [];
    }

    const targets = await this.participantRepo.find({
      where: { encounterId },
    });
    const events: GameEventData[] = [];
    for (const target of targets) {
      if (!targetIds.includes(target.id)) continue;
      const instances = (target.conditionInstances ?? []).filter(
        (condition) =>
          condition.slug === "frightened" &&
          condition.appliedBy === source.id &&
          condition.source === "feature:celestial-revelation",
      );
      for (const instance of instances) {
        const removed =
          await this.conditionLifecycle.removeConditionInstance(
            target,
            instance.id,
            "source_next_turn_ended",
          );
        events.push(...removed.events);
      }
    }
    effect.payload = {
      ...(effect.payload ?? {}),
      frightenedTargetIds: [],
      fearSourceTurnsRemaining: 0,
    };
    await this.participantRepo.save(source);
    return events;
  }

  async endTurn(encounterId: string): Promise<GameResult<TurnInfo>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");
    if (encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const currentParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex];

    const compelledParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
    });
    if (
      compelledParticipant &&
      findFearCompulsion(compelledParticipant) &&
      !compelledParticipant.actionUsed
    ) {
      return failure(
        "Fear obriga esta criatura a usar Disparada antes de encerrar o turno.",
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const events: GameEventData[] = [
      {
        event_type: "turn_end",
        actor_participant_id: currentParticipantId,
        data: { round: encounter.currentRound },
      },
    ];




    const tickParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
      relations: ["monster"],
    });
    if (tickParticipant) {
      const areaEndTurnAdjacent =
        await this.persistentArea.resolveEndTurnAdjacent(tickParticipant);
      events.push(...areaEndTurnAdjacent.events);
      events.push(
        ...(await this.applyPersistentAreaDamageEvents(
          encounterId,
          areaEndTurnAdjacent.events,
          "",
        )),
      );
      const areaEndTurn =
        await this.persistentArea.resolveEndTurnIn(
          tickParticipant,
          (ability) =>
            this.getEndOfTurnSaveModifier(tickParticipant, ability),
          `${encounter.currentRound}:${encounter.currentTurnIndex}`,
        );
      events.push(...areaEndTurn.events);
      events.push(
        ...(await this.applyPersistentAreaDamageEvents(
          encounterId,
          areaEndTurn.events,
          "",
        )),
      );
      const conditionEndTurn =
        await this.conditionLifecycle.processEndOfTurn(
          tickParticipant,
          (ability) =>
            this.getEndOfTurnSaveModifier(tickParticipant, ability),
        );
      events.push(...conditionEndTurn.events);
      const sourceTurnConditionExpiry =
        await this.conditionLifecycle.expireAtParticipantTurnEnd(
          encounterId,
          currentParticipantId,
        );
      events.push(...sourceTurnConditionExpiry.events);
      events.push(
        ...(await this.resolveCelestialRevelationEndTurn(
          encounterId,
          tickParticipant,
        )),
      );
      events.push(
        ...(await this.resolveCelestialRevelationFearEndTurn(
          encounterId,
          tickParticipant,
        )),
      );
      const tick = await this.effectInstances.tickAtEndOfTurn(tickParticipant);
      events.push(...tick.events);
      const casterTick =
        await this.effectInstances.tickAtEndOfCasterTurn(
          encounterId,
          currentParticipantId,
        );
      events.push(...casterTick.events);
    }





    const currentParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
    });
    if (currentParticipant) {
      const expired: string[] = [];
      if (currentParticipant.hasDashed) {
        currentParticipant.hasDashed = false;
        expired.push("dash");
      }
      if (currentParticipant.hasDisengaged) {
        currentParticipant.hasDisengaged = false;
        expired.push("disengage");
      }
      if (expired.length > 0) {
        await this.participantRepo.save(currentParticipant);
        for (const state of expired) {
          events.push({
            event_type: "state_expired",
            actor_participant_id: currentParticipantId,
            data: { state, round: encounter.currentRound },
          });
        }
      }
    }



    if (currentParticipant && currentParticipant.type === "pc") {
      try {
        const legendaryEvents =
          await this.legendaryActionsCoordinator.processAfterPcTurn(
            encounter,
            currentParticipant.id,
          );
        events.push(...legendaryEvents);
      } catch {

      }
    }

    let nextIndex = encounter.currentTurnIndex + 1;
    let newRound = encounter.currentRound;
    let roundStartProcessed = false;

    if (nextIndex >= encounter.turnOrder.length) {
      nextIndex = 0;
      newRound += 1;
      events.push({ event_type: "round_start", data: { round: newRound } });
      roundStartProcessed = true;
      await this.pruneDeadFromTurnOrder(encounter);
      try {
        const lairEvents =
          await this.lairActionsCoordinator.processRoundStart(encounter);
        events.push(...lairEvents);
      } catch (err) {

      }
    }

    const turnOrderLen = encounter.turnOrder.length;
    let autoSkip = false;
    let skipped = 0;
    const advancePastSkippedParticipant = () => {
      nextIndex = (nextIndex + 1) % turnOrderLen;
      if (nextIndex === 0) {
        newRound += 1;
        events.push({ event_type: "round_start", data: { round: newRound } });
      }
      skipped += 1;
    };

    while (skipped < turnOrderLen) {
      const pid = encounter.turnOrder[nextIndex];
      const p = await this.participantRepo.findOne({ where: { id: pid } });
      if (!p) {
        advancePastSkippedParticipant();
        continue;
      }


      if (p.type !== "pc" && p.isDefeated) {
        advancePastSkippedParticipant();
        continue;
      }


      if (p.type === "pc" && p.dyingState === "dead") {
        advancePastSkippedParticipant();
        continue;
      }


      if ((p.conditions ?? []).includes("banished")) {
        events.push({
          event_type: "turn_skipped",
          actor_participant_id: p.id,
          data: { reason: "banished", condition: "banished" },
        });
        advancePastSkippedParticipant();
        continue;
      }


      if (p.type === "pc" && p.dyingState === "stable") {
        autoSkip = true;
        break;
      }


      break;
    }

    const startedNewRound = newRound > encounter.currentRound;
    if (startedNewRound && !roundStartProcessed) {
      await this.pruneDeadFromTurnOrder(encounter);
      try {
        const lairEvents =
          await this.lairActionsCoordinator.processRoundStart(encounter);
        events.push(...lairEvents);
      } catch (err) {

      }
    }
    encounter.currentTurnIndex = nextIndex;
    encounter.currentRound = newRound;
    await this.encounterRepo.save(encounter);

    const nextParticipantId = encounter.turnOrder[nextIndex];

    let nextParticipant = await this.participantRepo.findOne({
      where: { id: nextParticipantId },
      relations: ["monster"],
    });

    if (nextParticipant) {
      const expiredAtStart =
        await this.effectInstances.expireAtStartOfTurn(
          encounterId,
          nextParticipant.id,
        );
      events.push(...expiredAtStart.events);
      // expireAtStartOfTurn may update this same participant through a
      // separate repository instance. Reload it before initializeTurn saves
      // turn resources, otherwise that stale save can resurrect the effect.
      nextParticipant = await this.participantRepo.findOne({
        where: { id: nextParticipantId },
        relations: ["monster"],
      });
    }


    if (
      nextParticipant &&
      nextParticipant.dodgingUntilTurnOfParticipantId === nextParticipant.id
    ) {
      nextParticipant.dodgingUntilTurnOfParticipantId = null;
      await this.participantRepo.save(nextParticipant);
      events.push({
        event_type: "state_expired",
        actor_participant_id: nextParticipant.id,
        data: { state: "dodge", round: newRound },
      });
    }
    if (
      nextParticipant &&
      nextParticipant.helpingUntilTurnOfParticipantId === nextParticipant.id
    ) {
      nextParticipant.helpingAllyParticipantId = null;
      nextParticipant.helpingTargetParticipantId = null;
      nextParticipant.helpingUntilTurnOfParticipantId = null;
      await this.participantRepo.save(nextParticipant);
      events.push({
        event_type: "state_expired",
        actor_participant_id: nextParticipant.id,
        data: { state: "help", round: newRound },
      });
    }
    if (nextParticipant?.readiedAction) {
      nextParticipant.readiedAction = null;
      await this.participantRepo.save(nextParticipant);
      events.push({
        event_type: "state_expired",
        actor_participant_id: nextParticipant.id,
        data: { state: "ready", round: newRound },
      });
    }
    if (nextParticipant) {
      const ownerId = await this.resolveParticipantOwner(nextParticipant, "");
      await this.movementService.initializeTurn(
        nextParticipant,
        ownerId || undefined,
      );

      try {
        const allParticipantsInRound = startedNewRound
          ? await this.participantRepo.find({ where: { encounterId } })
          : undefined;
        const startTurn = await this.startTurnOrchestrator.run(
          nextParticipant,
          {
            isStartOfRound: startedNewRound,
            allParticipantsInRound,
            ownerUserId: ownerId || undefined,
            currentRound: newRound,
            currentTurnIndex: nextIndex,
            getSaveModifier: (ability) =>
              this.getEndOfTurnSaveModifier(nextParticipant, ability),
            getSaveModifierForTarget: (ability, target) =>
              this.getEndOfTurnSaveModifier(target, ability),
          },
        );
        events.push(...startTurn.events);
        events.push(
          ...(await this.applyPersistentAreaDamageEvents(
            encounterId,
            startTurn.events,
            ownerId,
          )),
        );
      } catch {
      }
    }

    events.push({
      event_type: "turn_start",
      actor_participant_id: nextParticipantId,
      data: {
        round: newRound,
        dyingState: nextParticipant?.dyingState,
        autoSkip,
      },
    });

    await this.eventService.emit(encounter.sessionId, encounterId, events);







    await this.encounterEndDetector.tryAutoEnd(encounterId);

    return success(
      {
        encounterId,
        round: newRound,
        participantId: nextParticipantId,
        participantName: nextParticipant?.displayName ?? "",
        participantType:
          (nextParticipant?.type as "pc" | "monster" | "npc") ?? "monster",
        isDefeated: nextParticipant?.isDefeated ?? false,
        dyingState: nextParticipant?.dyingState,
        autoSkip,
      },
      events,
    );
  }


  private async pruneDeadFromTurnOrder(
    encounter: EncounterEntity,
  ): Promise<void> {
    const toRemove: string[] = [];
    for (const pid of encounter.turnOrder) {
      const p = await this.participantRepo.findOne({ where: { id: pid } });
      if (p?.type === "pc" && p.dyingState === "dead") {
        toRemove.push(pid);
      }
    }
    if (toRemove.length === 0) return;
    encounter.turnOrder = encounter.turnOrder.filter(
      (pid) => !toRemove.includes(pid),
    );
    if (encounter.currentTurnIndex >= encounter.turnOrder.length) {
      encounter.currentTurnIndex = 0;
    }
  }

  private async removeDefeatedSummon(
    encounter: EncounterEntity,
    participant: EncounterParticipantEntity,
    events: GameEventData[],
    reason: "hp-zero" | "damage",
  ): Promise<void> {
    if (!participant.linkedCasterParticipantId || !participant.isDefeated) {
      return;
    }

    const removedIndex = encounter.turnOrder?.indexOf(participant.id) ?? -1;
    if (removedIndex >= 0) {
      encounter.turnOrder = encounter.turnOrder.filter(
        (id) => id !== participant.id,
      );
      if (removedIndex < encounter.currentTurnIndex) {
        encounter.currentTurnIndex = Math.max(0, encounter.currentTurnIndex - 1);
      } else if (removedIndex === encounter.currentTurnIndex) {
        encounter.currentTurnIndex = Math.min(
          encounter.currentTurnIndex,
          Math.max(0, encounter.turnOrder.length - 1),
        );
      }
      await this.encounterRepo.save(encounter);
    }

    await this.participantRepo.remove(participant);
    events.push({
      event_type: "summon_dismissed",
      actor_participant_id: participant.linkedCasterParticipantId,
      target_participant_id: participant.id,
      data: {
        reason,
        summonId: participant.id,
        displayName: participant.displayName,
      },
    });
  }



  async resolveAttack(
    encounterId: string,
    dto: AttackDto,
  ): Promise<GameResult<AttackResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const attacker = await this.encounterService.getParticipant(
      dto.attackerParticipantId,
    );
    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );
    const attackerWasHiddenBeforeAttack = (attacker.conditions ?? []).includes(
      "hidden",
    );
    if (isFindFamiliarSummon(attacker)) {
      return failure(
        "Um familiar não pode atacar.",
        "CONDITION_PREVENTS_ACTION",
      );
    }

    let monsterRechargeActionName: string | null = null;
    let monsterOnHitCondition:
      | {
          slug: "restrained";
          saveAbility?: "str";
          saveDc?: number;
      }
      | undefined;
    let monsterSecondarySaveDamage:
      | NonNullable<ResolvedMonsterAction["secondarySaveDamage"]>
      | undefined;
    let monsterOnHitSaveCondition:
      | NonNullable<ResolvedMonsterAction["onHitSaveCondition"]>
      | undefined;
    let monsterSaveConditionAction:
      | NonNullable<ResolvedMonsterAction["saveConditionAction"]>
      | undefined;
    if (
      (attacker.type === "monster" || attacker.type === "npc") &&
      attacker.monster
    ) {
      const rawActions = Array.isArray(attacker.monster.actions)
        ? attacker.monster.actions
        : [];
      const requestedName = dto.actionName.toLowerCase();
      const rawAction = rawActions.find((action: Record<string, unknown>) => {
        const rawName = String(action.name ?? "").toLowerCase();
        const displayName = monsterActionDisplayName(action).toLowerCase();
        return rawName === requestedName || displayName === requestedName;
      }) as Record<string, unknown> | undefined;
      if (rawAction && getMonsterRechargeRange(rawAction)) {
        monsterRechargeActionName = monsterActionDisplayName(rawAction);
        if (
          (attacker.rechargeState ?? {})[monsterRechargeActionName] === "used"
        ) {
          return failure(
            `${monsterRechargeActionName} ainda nao recarregou.`,
            "ACTION_RECHARGING",
          );
        }
      }
    }

    if (attacker.isDefeated)
      return failure("Atacante esta derrotado.", "CONDITION_PREVENTS_ACTION");
    if (
      attacker.type === "pc" &&
      attacker.dyingState !== "none"
    ) {
      return failure(
        "Personagem incapacitado não pode atacar.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (target.isDefeated)
      return failure("Alvo ja esta derrotado.", "TARGET_DEFEATED");
    if ((target.conditions ?? []).includes("banished"))
      return failure(
        "Alvo está banido e fora do plano atual.",
        "INVALID_TARGET",
      );
    if (findFearCompulsion(attacker))
      return failure(
        "Fear obriga o atacante a usar Disparada e fugir.",
        "CONDITION_PREVENTS_ACTION",
      );

    const useHasteAction = dto.options?.useHasteAction === true;
    const isUnarmedAttack = this.isUnarmedAttack(dto);
    const openHandFlurryMarker = (attacker.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "open_hand_flurry_attacks" &&
        (effect.payload?.amount ?? 0) > 0,
    );
    const isFlurryGrantedUnarmedAttack =
      isUnarmedAttack &&
      (attacker.bonusUnarmedAttacksRemainingThisTurn ?? 0) > 0 &&
      openHandFlurryMarker != null;
    if (useHasteAction && dto._isSubAttack) {
      return failure(
        "A ação de Haste permite somente um ataque.",
        "NO_ACTION_AVAILABLE",
      );
    }

    if (!dto._isSubAttack) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.attackerParticipantId)
        return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");




      if (useHasteAction && !hasAvailableHasteAction(attacker)) {
        return failure(
          "A ação extra de Haste já foi usada neste turno.",
          "NO_ACTION_AVAILABLE",
        );
      }
      if (
        !useHasteAction &&
        !this.canUseStandardOrBonusAttack(attacker, isUnarmedAttack)
      )
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }


    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure(
        "Atacante nao pode agir devido a condicoes.",
        "CONDITION_PREVENTS_ACTION",
      );

    if (
      isTargetingCharmer(attacker.conditionInstances, target.id)
    ) {
      return failure(
        "Enfeitiçado: não pode atacar quem aplicou a condição.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (!dto._isSubAttack) {
      const usesBonusAttack =
        isUnarmedAttack &&
        (attacker.bonusUnarmedAttacksRemainingThisTurn ?? 0) > 0;
      const abjureChoice = chooseAbjureFoesTurnOption(
        attacker,
        usesBonusAttack ? "bonus" : "action",
        `${encounter.currentRound}:${encounter.currentTurnIndex}`,
      );
      if (!abjureChoice.allowed) {
        return failure(
          abjureFoesChoiceError(abjureChoice.currentChoice),
          "CONDITION_PREVENTS_ACTION",
        );
      }
    }



    const naturesSanctuaryEvents: GameEventData[] = [];
    if (
      target.type === "pc" &&
      target.characterId &&
      attacker.type === "monster" &&
      attacker.monster
    ) {
      const creatureType = (attacker.monster.type ?? "").toLowerCase();
      if (creatureType === "beast" || creatureType === "plant") {
        try {
          const targetOwnerId = await this.resolveParticipantOwner(target, "");
          if (targetOwnerId) {
            const targetSheet = await this.sheetService.computeSheet(
              targetOwnerId,
              target.characterId,
            );
            if ((targetSheet as any).hasNaturesSanctuary) {
              const pb = targetSheet.proficiencyBonus ?? 2;
              const wisBlock = (targetSheet.abilityScores ?? []).find(
                (a: any) => a.slug === "wis",
              );
              const wisMod = wisBlock?.modifier ?? 0;
              const dc = 8 + pb + wisMod;
              const attackerWisMod = getAbilityModifier(
                attacker.monster.wisdom,
              );
              const roll = this.diceService.roll(20);
              const saveTotal = roll + attackerWisMod;
              const saved = saveTotal >= dc;
              naturesSanctuaryEvents.push({
                event_type: "natures_sanctuary_save",
                actor_participant_id: attacker.id,
                target_participant_id: target.id,
                data: {
                  dc,
                  roll,
                  modifier: attackerWisMod,
                  total: saveTotal,
                  success: saved,
                },
              });
              if (!saved) {
                return success(
                  {
                    attackRoll: {
                      roll: 0,
                      modifier: 0,
                      total: 0,
                      targetAc: 0,
                      hit: false,
                      critical: false,
                      criticalMiss: false,
                    },
                    targetDefeated: false,
                  } as AttackResult,
                  naturesSanctuaryEvents,
                );
              }
            }
          }
        } catch {

        }
      }
    }


    let attackBonus = 0;
    let damageDice = "1d4";
    let damageType = "bludgeoning";
    let damageBonus = 0;


    let actionRangeStr: string | null = null;



    let masterySlug: string | undefined;
    let masteryAbilityMod = 0;



    let rerollLowDamage = false;
    let appliedFightingStyle: string | undefined;




    let isWeaponOrUnarmedAttack = false;
    let hasOpenHandTechnique = false;





    if (
      dto.actionSlug === "unarmed-strike" &&
      attacker.type === "pc" &&
      attacker.characterId
    ) {
      isWeaponOrUnarmedAttack = true;
      const pcOwnerId = await this.resolveParticipantOwner(
        attacker,
        dto.ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        pcOwnerId,
        attacker.characterId,
      );
      const strScore = sheet.abilityScores.find((a) => a.slug === "str");
      const strMod = strScore?.modifier ?? 0;
      const profBonus = sheet.proficiencyBonus ?? 2;
      const mode = (dto.options?.mode as string | undefined) ?? "damage";
      if (useHasteAction && mode !== "damage") {
        return failure(
          "A ação de Haste permite somente um ataque, não Agarrar ou Empurrar.",
          "INVALID_ACTION",
        );
      }
      actionRangeStr = "5 ft";



      {
        const rangeCheck = checkAttackRange(
          this.positionOf(attacker),
          this.positionOf(target),
          parseRangeString(actionRangeStr),
        );
        if (!rangeCheck.ok) {
          return failure(
            `Alvo a ${rangeCheck.distanceFt}ft, Ataque Desarmado alcança ${rangeCheck.maxFt}ft.`,
            "OUT_OF_RANGE",
          );
        }
      }

      if (mode === "grapple" || mode === "shove") {

        const saveDc = 8 + profBonus + strMod;
        if (!dto._isSubAttack) {
          this.consumeStandardOrBonusAttack(attacker, isUnarmedAttack);
          await this.participantRepo.save(attacker);
        }
        const event: GameEventData = {
          event_type: "class_feature_invoked",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: {
            featureSlug: mode,
            actionCost: "action",
            targets: [target.id],
            saveDc,
            saveAbility: "str",
            options: { mode, outcome: "pending" },
            caster: {
              abilityMods: { str: strMod },
              profBonus,
            },
            status: "emitted_pending_resolution",
          },
        };
        await this.eventService.emit(encounter.sessionId, encounterId, [event]);

        const resolution = await this.classFeatureResolver.resolveInvocation(
          attacker.id,
          {
            featureSlug: mode,
            actionCost: "action",
            targets: [target.id],
            saveDc,
            saveAbility: "str",
            options: { mode, outcome: "pending" },
            caster: { abilityMods: { str: strMod }, profBonus },
          },
        );
        if (resolution.resolved && resolution.events.length > 0) {
          await this.eventService.emit(
            encounter.sessionId,
            encounterId,
            resolution.events,
          );
        }
        return success(
          {
            attackerParticipantId: attacker.id,
            targetParticipantId: target.id,
            actionSlug: "unarmed-strike",
            unarmedMode: mode,
            deferred: !resolution.resolved,
            resolved: resolution.resolved,
            featureSlug: mode,
            saveDc,
            saveAbility: "str",
            resolutionPayload: resolution.resolutionPayload,
          } as unknown as AttackResult,
          [event, ...resolution.events],
        );
      }


      attackBonus = strMod + profBonus;
      damageDice = "1";
      damageType = "bludgeoning";
      damageBonus = strMod;



      const unarmedOrigin = (
        sheet as unknown as { originDetails?: { fightingStyleIndex?: string } }
      ).originDetails;
      const unarmedFsSlug = unarmedOrigin?.fightingStyleIndex;
      if (unarmedFsSlug === "unarmed-fighting") {

        const hasBothHandsFree = !(
          (
            sheet as unknown as {
              equipment?: Array<{ equipped?: boolean; damage?: unknown }>;
            }
          ).equipment ?? []
        ).some((e) => e.equipped && !!e.damage);
        damageDice = hasBothHandsFree ? "1d8" : "1d6";
        appliedFightingStyle = "unarmed-fighting";
      }




      const monkClass = (
        sheet as unknown as { classes?: Array<{ slug: string; level: number }> }
      ).classes?.find((c) => c.slug.replace(/-phb$/, "") === "monk");
      if (monkClass) {
        hasOpenHandTechnique = (
          (
            sheet as unknown as {
              features?: Array<{ slug?: string; active?: boolean }>;
            }
          ).features ?? []
        ).some(
          (feature) =>
            feature.active !== false &&
            feature.slug?.startsWith("open-hand-technique"),
        );
        const monkLvl = monkClass.level;
        const maDie =
          monkLvl >= 17
            ? "d12"
            : monkLvl >= 11
              ? "d10"
              : monkLvl >= 5
                ? "d8"
                : "d6";
        damageDice = `1${maDie}`;
        const dexScore = sheet.abilityScores.find((a) => a.slug === "dex");
        const dexMod = dexScore?.modifier ?? 0;

        if (dexMod > strMod) {
          attackBonus = dexMod + profBonus;
          damageBonus = dexMod;
        }
      }
    } else if (attacker.type === "pc" && attacker.transformationState) {




      const form = attacker.transformationState.form;
      const syntheticMonster = {
        slug: form.monsterSlug ?? "transformed",
        name: form.formName,
        actions: form.actions,
      };
      const resolved = this.monsterActionResolver.resolveByName(
        syntheticMonster as unknown as Parameters<
          typeof this.monsterActionResolver.resolveByName
        >[0],
        dto.actionName,
      );
      if (!resolved) {
        return failure(
          `Acao "${dto.actionName}" nao encontrada no form "${form.formName}".`,
          "INVALID_ACTION",
        );
      }
      attackBonus = resolved.attackBonus;
      if (resolved.damageDice) damageDice = resolved.damageDice;
      if (resolved.damageType) damageType = resolved.damageType;
      damageBonus = resolved.damageBonus;
      monsterOnHitCondition = resolved.onHitCondition;
      monsterOnHitSaveCondition = resolved.onHitSaveCondition;
      monsterSaveConditionAction = resolved.saveConditionAction;
      monsterSecondarySaveDamage = resolved.secondarySaveDamage;
      actionRangeStr = resolved.range ?? resolved.reach ?? null;
    } else if (attacker.type === "pc" && attacker.characterId) {
      const pcOwnerId = await this.resolveParticipantOwner(
        attacker,
        dto.ownerUserId,
      );
      const actions = await this.actionsService.getActions(
        pcOwnerId,
        attacker.characterId,
      );
      const allActions = [...actions.actions, ...actions.bonusActions];




      const actionSlugKey = dto.actionSlug ?? dto.actionName;
      const action =
        allActions.find((a) => a.id === actionSlugKey) ??
        allActions.find(
          (a) =>
            a.name.toLowerCase() === dto.actionName.toLowerCase() ||
            a.id === dto.actionName,
        );
      if (!action)
        return failure(
          `Acao "${dto.actionName}" nao encontrada.`,
          "INVALID_ACTION",
        );
      if (action.source === "weapon") isWeaponOrUnarmedAttack = true;
      attackBonus = action.attackBonus ?? 0;
      if (action.damage) {
        damageDice = action.damage.dice;
        damageType = action.damage.type;
        damageBonus = action.damage.bonus ?? 0;
      }
      actionRangeStr = action.range ?? null;

      if (action.source === "weapon" && action.masterySlug) {
        masterySlug = action.masterySlug;
        masteryAbilityMod = action.damage?.bonus ?? 0;
      }




      if (
        action.source === "weapon" &&
        attacker.tacticalMasterOverride &&
        masterySlug
      ) {
        masterySlug = attacker.tacticalMasterOverride;
      }



      if (action.source === "weapon") {
        const sheet = await this.sheetService.computeSheet(
          pcOwnerId,
          attacker.characterId,
        );
        const originDetails = (
          sheet as unknown as {
            originDetails?: { fightingStyleIndex?: string };
          }
        ).originDetails;
        const fsSlug = originDetails?.fightingStyleIndex;
        if (fsSlug) {
          const props = (action.properties ?? []).map((p) => p.toLowerCase());
          const isTwoHanded = props.includes("two-handed");
          const isMeleeCtx = this.isMeleeAttack(action.name, dto.actionSlug);
          const isThrown =
            (dto.actionSlug ?? "").startsWith("weapon-thrown-") ||
            (props.includes("thrown") && !isMeleeCtx);


          const isOffhand = false;

          const isOneHandNoOffhand = isMeleeCtx && !isTwoHanded;
          const fsRes = this.fightingStyle.resolveAttackModifiers({
            fightingStyleSlug: fsSlug,
            isMelee: isMeleeCtx,
            isTwoHanded,
            isThrown,
            isOneHandNoOffhand,
            isOffhandAttack: isOffhand,
            abilityMod: action.damage?.bonus ?? 0,
            isUnarmed: false,
            hasBothHandsFree: false,
          });
          attackBonus += fsRes.attackBonus;
          damageBonus += fsRes.damageBonus;
          if (fsRes.rerollLowDamage) rerollLowDamage = true;
          if (fsRes.appliedStyle) appliedFightingStyle = fsRes.appliedStyle;
        }
      }
    } else if (
      (attacker.type === "monster" || attacker.type === "npc") &&
      attacker.monster
    ) {
      const summonStatBlock = getSummonStatBlock(attacker);
      let resolved: ResolvedMonsterAction | null | undefined =
        summonStatBlock &&
        dto.actionName.trim().toLowerCase() ===
          summonStatBlock.attack.name.toLowerCase()
          ? {
              name: summonStatBlock.attack.name,
              attackBonus: summonStatBlock.attack.attackBonus,
              hasAttack: true,
              damageDice: summonStatBlock.attack.damageDice,
              damageType: summonStatBlock.attack.damageType,
              damageBonus: summonStatBlock.attack.damageBonus,
              reach: `${summonStatBlock.attack.reachFt} ft.`,
              description: `Melee Spell Attack: +${summonStatBlock.attack.attackBonus} to hit. Hit: ${summonStatBlock.attack.damageDice} + ${summonStatBlock.attack.damageBonus} ${summonStatBlock.attack.damageType} damage.`,
              attackBonusSource: "structured",
            }
          : this.monsterActionResolver.resolveByName(
              attacker.monster,
              dto.actionName,
            );
      if (!resolved) {
        const monsterActions = (attacker.monster as { actions?: unknown })
          .actions;
        if (Array.isArray(monsterActions)) {
          for (const candidate of monsterActions) {
            if (!candidate || typeof candidate !== "object") continue;
            const candidateName = (candidate as { name?: unknown }).name;
            if (typeof candidateName !== "string" || !candidateName.trim()) {
              continue;
            }
            const r = this.monsterActionResolver.resolveByName(
              attacker.monster,
              candidateName,
            );
            if (r && (typeof r.attackBonus === "number" || r.damageDice)) {
              resolved = r;
              break;
            }
          }
        }
      }
      if (!resolved) {
        return failure(
          `Acao "${dto.actionName}" nao encontrada no statblock do monstro.`,
          "INVALID_ACTION",
        );
      }
      attackBonus = resolved.attackBonus;
      damageDice = resolved.damageDice ?? "0";
      if (resolved.damageType) damageType = resolved.damageType;
      damageBonus = resolved.damageBonus;
      monsterOnHitCondition = resolved.onHitCondition;
      monsterOnHitSaveCondition = resolved.onHitSaveCondition;
      monsterSaveConditionAction = resolved.saveConditionAction;
      monsterSecondarySaveDamage = resolved.secondarySaveDamage;
      actionRangeStr = resolved.range ?? resolved.reach ?? null;
    }

    if (
      useHasteAction &&
      attacker.type === "pc" &&
      !attacker.transformationState &&
      !isWeaponOrUnarmedAttack
    ) {
      return failure(
        "A ação de Haste permite somente um ataque de arma ou desarmado.",
        "INVALID_ACTION",
      );
    }



    const parsedRange = parseRangeString(actionRangeStr);
    const rangeCheck = checkAttackRange(
      this.positionOf(attacker),
      this.positionOf(target),
      parsedRange,
    );


    if (!rangeCheck.ok && !dto._bypassRangeCheck) {
      const actionLabel = dto.actionName || "Ataque";
      return failure(
        `Alvo a ${rangeCheck.distanceFt}ft, ${actionLabel} alcança ${rangeCheck.maxFt}ft.`,
        "OUT_OF_RANGE",
      );
    }

    if (monsterSaveConditionAction) {
      if (target.type !== "pc" || !target.characterId) {
        return failure(
          "Esta ação de salvaguarda exige um personagem como alvo.",
          "INVALID_TARGET",
        );
      }
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        dto.ownerUserId,
      );
      const saveResult = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        userId: targetOwnerId,
        ability: monsterSaveConditionAction.saveAbility,
        dc: monsterSaveConditionAction.saveDc,
        encounterId: encounter.id,
        sessionId: encounter.sessionId,
        participantId: target.id,
      });
      if (!saveResult.ok) {
        return failure(saveResult.error, saveResult.code);
      }
      const events: GameEventData[] = [...saveResult.events];
      let conditionApplied = false;
      let conditionBlocked = false;
      if (!saveResult.value.success) {
        const conditionResult = await this.conditionLifecycle.applyCondition(
          target,
          {
            slug: monsterSaveConditionAction.slug,
            appliedBy: attacker.id,
            source: `ability:${dto.actionName
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`,
            saveAbility: monsterSaveConditionAction.saveAbility,
            saveDc: monsterSaveConditionAction.saveDc,
            repeatSaveTiming:
              monsterSaveConditionAction.repeatSaveTiming,
            durationRoundsRemaining:
              monsterSaveConditionAction.durationRounds,
          },
        );
        events.push(...conditionResult.events);
        conditionBlocked = conditionResult.events.some(
          (event) => event.event_type === "condition_blocked_by_immunity",
        );
        conditionApplied = !conditionBlocked;
      }
      attacker.actionUsed = true;
      attacker.attacksUsedThisTurn = Math.max(
        attacker.attacksUsedThisTurn,
        attacker.attacksMaxThisTurn,
      );
      await this.participantRepo.save(attacker);
      events.push({
        event_type: "monster_save_condition_action",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          actionName: dto.actionName,
          condition: monsterSaveConditionAction.slug,
          saveAbility: monsterSaveConditionAction.saveAbility,
          saveDc: monsterSaveConditionAction.saveDc,
          roll: saveResult.value.roll,
          modifier: saveResult.value.modifier,
          auraBonus: saveResult.value.auraBonus,
          halfCoverBonus: saveResult.value.halfCoverBonus,
          effectBonus: saveResult.value.effectBonus,
          exhaustionPenalty: saveResult.value.exhaustionPenalty,
          total: saveResult.value.total,
          success: saveResult.value.success,
          conditionApplied,
          conditionBlocked,
        },
      });
      await this.eventService.emit(
        encounter.sessionId,
        encounter.id,
        events,
      );
      return success(
        {
          attackRoll: {
            roll: saveResult.value.roll,
            modifier: saveResult.value.modifier,
            total: saveResult.value.total,
            targetAc: monsterSaveConditionAction.saveDc,
            hit: !saveResult.value.success,
            critical: false,
            criticalMiss: false,
          },
          targetDefeated: false,
        },
        events,
      );
    }


    const attackerMods = this.conditionEffects.getAttackModifiers(
      attacker.conditions,
    );
    const defenderMods = this.conditionEffects.getDefenseModifiers(
      target.conditions,
    );





    const activeHelper = await this.participantRepo.findOne({
      where: {
        encounterId: encounter.id,
        helpingAllyParticipantId: attacker.id,
        helpingTargetParticipantId: target.id,
      },
    });
    const helpingState = activeHelper
      ? {
          allyParticipantId: attacker.id,
          targetParticipantId: target.id,
          expiresAtNextTurnOfParticipantId:
            activeHelper.helpingUntilTurnOfParticipantId ?? activeHelper.id,
        }
      : undefined;
    const reactive = this.conditionEffects.getReactiveAttackModifiers(
      {
        id: attacker.id,
        conditions: attacker.conditions ?? [],
        dodgingUntilTurnOfParticipantId:
          attacker.dodgingUntilTurnOfParticipantId,
      },
      {
        id: target.id,
        conditions: target.conditions ?? [],
        dodgingUntilTurnOfParticipantId: target.dodgingUntilTurnOfParticipantId,
      },
      helpingState ? { helpingAgainst: helpingState } : undefined,
    );



    const isMeleeAttack = this.isMeleeAttack(dto.actionName, dto.actionSlug);
    const effectDec = this.resolveEffectInstanceDecisions(
      attacker,
      target,
      isMeleeAttack,
      dto.actionSlug,
    );



    const consumeInspiration = attacker.inspirationArmed === true;
    const packTacticsAdvantage =
      await this.hasSummonPackTacticsAdvantage(
        encounter.id,
        attacker,
        target,
      );

    let hasAdvantage =
      attackerMods.hasAdvantage ||
      defenderMods.attacksHaveAdvantage ||
      reactive.advantage ||
      effectDec.advantage ||
      packTacticsAdvantage ||
      consumeInspiration ||
      (dto.forceAdvantage ?? false);
    let hasDisadvantage =
      attackerMods.hasDisadvantage ||
      defenderMods.attacksHaveDisadvantage ||
      reactive.disadvantage ||
      effectDec.disadvantage ||
      rangeCheck.disadvantage ||
      (dto.forceDisadvantage ?? false);
    let advantageCancelled = false;



    let elusiveCancelledAdvantage = false;
    if (target.type === "pc" && target.characterId && hasAdvantage) {
      try {
        const targetOwnerId = await this.resolveParticipantOwner(
          target,
          dto.ownerUserId,
        );
        const targetSheet = await this.sheetService.computeSheet(
          targetOwnerId,
          target.characterId,
        );
        const hasElusive =
          (targetSheet as { hasElusive?: boolean }).hasElusive === true;
        const incapacitated = (target.conditions ?? []).some((c) =>
          [
            "incapacitated",
            "paralyzed",
            "petrified",
            "stunned",
            "unconscious",
          ].includes(c),
        );
        if (hasElusive && !incapacitated) {
          hasAdvantage = false;
          elusiveCancelledAdvantage = true;
        }
      } catch {

      }
    }


    if (hasAdvantage && hasDisadvantage) {
      hasAdvantage = false;
      hasDisadvantage = false;
      advantageCancelled = true;
    }


    let attackerHasHalflingLuck = false;
    if (attacker.type === "pc" && attacker.characterId) {
      try {
        const attackerOwnerId = await this.resolveParticipantOwner(
          attacker,
          dto.ownerUserId,
        );
        attackerHasHalflingLuck = hasHalflingLuck(
          await this.sheetService.computeSheet(
            attackerOwnerId,
            attacker.characterId,
          ),
        );
      } catch {
        attackerHasHalflingLuck = false;
      }
    }
    const d20Test = rollD20TestWithHalflingLuck({
      enabled: attackerHasHalflingLuck,
      advantage: hasAdvantage,
      disadvantage: hasDisadvantage,
      roll: () => this.diceService.roll(20),
    });
    const attackRoll = d20Test.chosen;
    const advantageResult = d20Test.advantage;



    const critThreshold = await this.computeCritThreshold(
      attacker,
      dto.ownerUserId,
    );
    const isCritical = attackRoll >= critThreshold;
    const isCriticalMiss = attackRoll === 1;


    let targetAc = 10;
    let targetHpBeforeAttack = target.currentHp ?? 0;
    let targetTempHpBeforeAttack = target.tempHp ?? 0;
    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        dto.ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        targetOwnerId,
        target.characterId,
      );
      targetAc = target.transformationState?.form.ac ?? sheet.armorClass;
      targetHpBeforeAttack = sheet.currentHp ?? targetHpBeforeAttack;
      targetTempHpBeforeAttack = sheet.tempHp ?? targetTempHpBeforeAttack;
    } else if (target.type === "monster" && target.monster) {
      const summonAc = getSummonStatBlock(target)?.armorClass;
      const ac = target.monster.armor_class as any;
      targetAc =
        summonAc ?? (Array.isArray(ac) ? ac[0]?.value : ac?.value) ?? 10;
    }

    targetAc = Math.max(targetAc, effectDec.targetAcBaseOverride ?? targetAc);
    targetAc += effectDec.targetAcBonus;
    const smiteOfProtectionHalfCover =
      await this.paladinAuras?.getSmiteOfProtectionHalfCover(target);
    targetAc += smiteOfProtectionHalfCover?.bonus ?? 0;



    const rolledEffectBonuses = effectDec.attackBonuses.map((b) => {
      if (b.dice) {
        const negated = b.dice.startsWith("-");
        const expr = negated ? b.dice.slice(1) : b.dice;
        const r = this.diceService.rollExpression(expr);
        const total = negated ? -r.total : r.total;
        return { source: b.source, dice: b.dice, rolled: total };
      }
      return { source: b.source, amount: b.amount ?? 0, rolled: b.amount ?? 0 };
    });
    const effectBonusSum = rolledEffectBonuses.reduce(
      (s, b) => s + (b.rolled ?? 0),
      0,
    );




    let biBonus = 0;
    let biEvents: GameEventData[] = [];
    const hasBardicInspirationEffect = (attacker.effectInstances ?? []).some(
      (e) => (e as unknown as { kind?: string }).kind === "bardic_inspiration",
    );
    if (hasBardicInspirationEffect) {
      try {
        const biResult = await this.bard.consumeBardicInspirationIfPresent(
          attacker.id,
          "attack_roll",
          (sides) => this.diceService.roll(sides),
        );
        biBonus = biResult.consumed ? biResult.bonus : 0;
        biEvents = biResult.events;
      } catch {

      }
    }



    let exhaustionAttackPenalty = 0;
    let attackerExhaustionLevel = 0;
    if (attacker.type === "pc" && attacker.characterId) {
      try {
        const ownerIdForExh = await this.resolveParticipantOwner(
          attacker,
          dto.ownerUserId,
        );
        const attackerSheet = await this.sheetService.computeSheet(
          ownerIdForExh,
          attacker.characterId,
        );
        attackerExhaustionLevel =
          (attackerSheet as { exhaustionLevel?: number }).exhaustionLevel ?? 0;
        if (attackerExhaustionLevel > 0) {
          const mods = this.exhaustion.getModifiers(
            attackerExhaustionLevel,
            "2024_ten_levels",
          );
          exhaustionAttackPenalty = mods.d20Penalty ?? 0;
        }
      } catch {

      }
    }

    const totalAttack =
      attackRoll +
      attackBonus +
      effectBonusSum +
      biBonus +
      exhaustionAttackPenalty;
    const rawHit =
      !isCriticalMiss &&
      (isCritical || defenderMods.autoCritIfMelee || totalAttack >= targetAc);



    let hit = rawHit;
    let strokeOfLuckConsumed = false;
    if (!rawHit) {
      const armed = (attacker.effectInstances ?? []).find(
        (e) =>
          (e as unknown as { kind?: string }).kind ===
          "stroke_of_luck_armed_attack",
      );
      if (armed) {
        hit = true;
        strokeOfLuckConsumed = true;
        attacker.effectInstances = (attacker.effectInstances ?? []).filter(
          (e) =>
            (e as unknown as { kind?: string }).kind !==
            "stroke_of_luck_armed_attack",
        );
        await this.participantRepo.save(attacker);
      }
    }

    const events: GameEventData[] = [...biEvents, ...naturesSanctuaryEvents];
    if (smiteOfProtectionHalfCover) {
      events.push({
        event_type: "smite_of_protection_half_cover_applied",
        actor_participant_id:
          smiteOfProtectionHalfCover.sourceParticipantId,
        target_participant_id: target.id,
        data: {
          bonus: smiteOfProtectionHalfCover.bonus,
          sourcePaladinName: smiteOfProtectionHalfCover.sourceName,
          defense: "armor-class",
          finalArmorClass: targetAc,
          radiusFeet: smiteOfProtectionHalfCover.radiusFeet,
        },
      });
    }
    if (strokeOfLuckConsumed) {
      events.push({
        event_type: "stroke_of_luck_consumed",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          featureSlug: "stroke-of-luck",
          kind: "attack",
          originalMiss: true,
        },
      });
    }
    if (elusiveCancelledAdvantage) {
      events.push({
        event_type: "elusive_cancelled_advantage",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: { featureSlug: "elusive" },
      });
    }
    if (exhaustionAttackPenalty !== 0) {
      events.push({
        event_type: "exhaustion_penalty_applied",
        actor_participant_id: attacker.id,
        data: {
          kind: "attack_roll",
          level: attackerExhaustionLevel,
          d20Penalty: exhaustionAttackPenalty,
          rawRoll: attackRoll,
          modifier: attackBonus,
          finalTotal: totalAttack,
        },
      });
    }

    const attackRollResult = {
      roll: attackRoll,
      modifier: attackBonus,
      total: totalAttack,
      targetAc,
      hit,
      critical: isCritical || defenderMods.autoCritIfMelee,
      criticalMiss: isCriticalMiss && !strokeOfLuckConsumed,
      advantage: advantageResult,
      hasAdvantage,
      hasDisadvantage,
      advantageCancelled,
      effectBonuses: rolledEffectBonuses,
      halflingLuckRerolls: d20Test.rerolls,
    };

    events.push({
      event_type: "attack_roll",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        actionName: dto.actionName,
        actorName: attacker.displayName,
        targetName: target.displayName,
        ...attackRollResult,
      },
    });




    await this.consumeOneShotEffects(attacker, target);



    if (hit && !isCritical) {
      const parryRes = await this.monsterReactions.tryParryAfterAttackRoll(
        target,
        totalAttack,
        isMeleeAttack,
        targetAc,
      );
      if (parryRes) {
        events.push(...parryRes.events);
        if (!parryRes.hitAfter) {
          hit = false;
          targetAc = parryRes.newAc;
        }
      }
    }

    let damageRollResult;
    let targetHpAfter: number | undefined;
    let targetDefeated = false;
    let cunningStrikeAvailable = false;
    let cunningStrikeOptions: string[] = [];
    let cunningStrikeSneakAttackRolls: number[] = [];
    let cunningStrikeSneakAttackDice: string | null = null;
    let radiantStrikesDamage = 0;
    let celestialRevelationDamage = 0;
    let divineSmiteAvailable = false;
    let divineSmiteSlotLevels: number[] = [];
    let divineSmiteFreeCastAvailable = false;
    let divineSmiteCritical = false;
    let divineSmiteSourceEdition: string | undefined;
    let giantAncestryAvailable = false;
    let giantAncestryFeatureSlug: GiantAncestryChoice | undefined;

    let collateralDefeated = false;
    let concentrationBroken: boolean | undefined;

    if (hit && damageDice !== "0") {

      const dmgResult = this.diceService.rollExpression(damageDice);
      let totalDamage = dmgResult.total + damageBonus;



      if (rerollLowDamage) {
        const rollsArr = dmgResult.rolls ?? [];
        const dieSize = parseInt(damageDice.split("d")[1] ?? "0", 10);
        if (rollsArr.length > 0 && dieSize > 0) {
          const rerollRes = this.fightingStyle.applyRerollLowDamage(
            rollsArr,
            dieSize,
          );
          if (rerollRes.rerolled) {
            totalDamage = rerollRes.total + damageBonus;
          }
        }
      }


      if (isCritical || defenderMods.autoCritIfMelee) {
        const critExtra = this.diceService.rollExpression(damageDice);
        let critTotal = critExtra.total;
        if (rerollLowDamage) {
          const rollsArr = critExtra.rolls ?? [];
          const dieSize = parseInt(damageDice.split("d")[1] ?? "0", 10);
          if (rollsArr.length > 0 && dieSize > 0) {
            const rerollRes = this.fightingStyle.applyRerollLowDamage(
              rollsArr,
              dieSize,
            );
            if (rerollRes.rerolled) critTotal = rerollRes.total;
          }
        }
        totalDamage += critTotal;
      }





      let sneakAttackDamage = 0;
      let sneakAttackDice: string | null = null;
      try {
        if (
          attacker.type === "pc" &&
          attacker.characterId &&
          !attacker.sneakAttackUsedThisTurn
        ) {
          const ownerIdForSa = await this.resolveParticipantOwner(
            attacker,
            dto.ownerUserId,
          );
          const saSheet = await this.sheetService.computeSheet(
            ownerIdForSa,
            attacker.characterId,
          );
          const classesList =
            (
              saSheet as unknown as {
                classes?: Array<{ slug?: string; level?: number }>;
              }
            ).classes ?? [];
          const rogueClass = classesList.find(
            (c) =>
              typeof c.slug === "string" &&
              c.slug.replace(/-phb$/, "") === "rogue",
          );
          if (rogueClass && typeof rogueClass.level === "number") {
            const weaponSlug = dto.actionSlug ?? "";
            const isWeaponAttack =
              weaponSlug.startsWith("weapon-") ||
              weaponSlug.endsWith("-attack");
            const advantageForSa = hasAdvantage && !hasDisadvantage;
            if (isWeaponAttack && advantageForSa) {
              const nDice = Math.min(
                10,
                Math.max(1, Math.floor((rogueClass.level + 1) / 2)),
              );
              const rolledSneakDice = isCritical ? nDice * 2 : nDice;
              sneakAttackDice = `${rolledSneakDice}d6`;
              const saRoll = this.diceService.rollExpression(sneakAttackDice);
              sneakAttackDamage = saRoll.total;
              cunningStrikeSneakAttackRolls = [...(saRoll.rolls ?? [])];
              cunningStrikeSneakAttackDice = sneakAttackDice;
              if (rogueClass.level >= 5) {
                const featureSlugs = (
                  (
                    saSheet as unknown as {
                      features?: Array<{ slug?: string; active?: boolean }>;
                    }
                  ).features ?? []
                )
                  .filter((feature) => feature.active !== false)
                  .map((feature) => feature.slug ?? "");
                const hasCunningStrike = featureSlugs.some((slug) =>
                  slug.startsWith("cunning-strike"),
                );
                if (hasCunningStrike) {
                  cunningStrikeOptions = ["poison", "trip", "withdraw"];
                  if (
                    rogueClass.level >= 9 &&
                    featureSlugs.some((slug) =>
                      slug.startsWith("supreme-sneak"),
                    )
                  ) {
                    cunningStrikeOptions.push("stealth");
                  }
                }
              }
              totalDamage += sneakAttackDamage;
              attacker.sneakAttackUsedThisTurn = true;
              await this.participantRepo.save(attacker);
            }
          }
        }
      } catch {

      }




      let foeSlayerBonus = 0;
      let foeSlayerConsumed = false;
      try {
        const alreadyUsed = (attacker.effectInstances ?? []).some(
          (e) => e.kind === "foe_slayer_used_this_turn",
        );
        if (!alreadyUsed && attacker.type === "pc" && attacker.characterId) {
          const ownerIdForFs = await this.resolveParticipantOwner(
            attacker,
            dto.ownerUserId,
          );
          const fsSheet = await this.sheetService.computeSheet(
            ownerIdForFs,
            attacker.characterId,
          );
          const hasFoeSlayer =
            (fsSheet as { hasFoeSlayer?: boolean }).hasFoeSlayer === true;
          if (hasFoeSlayer) {
            const wisAbility = fsSheet.abilityScores.find(
              (a) => a.slug === "wis",
            );
            const wisMod = wisAbility?.modifier ?? 0;


            if (hasFoeSlayer) {
              foeSlayerBonus = Math.max(0, wisMod);
              foeSlayerConsumed = true;
              totalDamage += foeSlayerBonus;
              attacker.effectInstances = [
                ...(attacker.effectInstances ?? []),
                {
                  id: randomUUID(),
                  kind: "foe_slayer_used_this_turn",
                  sourceFeatureSlug: "foe-slayer",
                  sourceCasterParticipantId: attacker.id,
                  payload:
                    {} as unknown as import("../interfaces/combat.interfaces").EffectInstancePayload,
                  expiresAt: { kind: "turns", value: 1 },
                  requiresConcentration: false,
                  appliedAt: new Date().toISOString(),
                },
              ];
              await this.participantRepo.save(attacker);
            }
          }
        }
      } catch {

      }






      const damageBonusEffects = (attacker.effectInstances ?? []).filter(
        (e) => e.kind === "damage_bonus",
      );
      const extraDamageBonuses: Array<{
        source: string;
        amount: number;
        dice?: string;
        damageType?: string;
        finalAmount?: number;
      }> = [];
      if (foeSlayerConsumed) {
        if (foeSlayerBonus > 0) {
          extraDamageBonuses.push({
            source: "foe-slayer",
            amount: foeSlayerBonus,
          });
        }
        events.push({
          event_type: "foe_slayer_applied",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: { wisBonus: foeSlayerBonus, oneshot: true },
        });
      }
      if (sneakAttackDice) {
        extraDamageBonuses.push({
          source: "sneak-attack",
          amount: sneakAttackDamage,
          dice: sneakAttackDice,
        });
      }
      for (const eff of damageBonusEffects) {
        const payload = (eff.payload ?? {}) as {
          amount?: number;
          dice?: string;
          scope?: "melee" | "ranged" | "any";
        };
        const scope = payload.scope ?? "any";
        const applies =
          scope === "any" ||
          (scope === "melee" && isMeleeAttack) ||
          (scope === "ranged" && !isMeleeAttack);
        if (!applies) continue;
        if (payload.dice) {
          const r = this.diceService.rollExpression(payload.dice);
          totalDamage += r.total;
          extraDamageBonuses.push({
            source: eff.sourceFeatureSlug ?? eff.sourceSpellSlug ?? eff.kind,
            amount: r.total,
            dice: payload.dice,
          });
        } else if (typeof payload.amount === "number") {
          totalDamage += payload.amount;
          extraDamageBonuses.push({
            source: eff.sourceFeatureSlug ?? eff.sourceSpellSlug ?? eff.kind,
            amount: payload.amount,
          });
        }
      }




      const targetMarks = (target.effectInstances ?? []).filter(
        (e) =>
          (e.kind === "hex_mark" || e.kind === "hunter_mark") &&
          e.sourceCasterParticipantId === attacker.id,
      );
      for (const mark of targetMarks) {
        const p = (mark.payload ?? {}) as {
          riderDice?: string;
          riderType?: string;
        };
        const dice = p.riderDice ?? "1d6";
        const r = this.diceService.rollExpression(dice);
        totalDamage += r.total;
        extraDamageBonuses.push({
          source: mark.sourceSpellSlug ?? mark.kind,
          amount: r.total,
          dice,
        });
      }

      let radiantStrikesRawDamage = 0;
      let radiantStrikesAdjusted = {
        finalDamage: 0,
        resisted: false,
        immune: false,
        vulnerable: false,
      };
      let radiantStrikesRoll:
        | ReturnType<DiceService["rollExpression"]>
        | undefined;
      if (
        attacker.type === "pc" &&
        attacker.characterId &&
        isWeaponOrUnarmedAttack &&
        isMeleeAttack
      ) {
        try {
          const ownerUserId = await this.resolveParticipantOwner(
            attacker,
            dto.ownerUserId,
          );
          const paladinSheet = await this.sheetService.computeSheet(
            ownerUserId,
            attacker.characterId,
          );
          const paladinFlags = paladinSheet as typeof paladinSheet & {
            hasDivineSmite?: boolean;
            hasPaladinsSmite?: boolean;
            hasRadiantStrikes?: boolean;
          };
          const paladinLevel =
            paladinSheet.classes.find(
              (classBlock) =>
                classBlock.slug.replace(/-(phb|xphb)$/i, "") === "paladin",
            )?.level ?? 0;
          const criticalHit =
            isCritical || defenderMods.autoCritIfMelee;

          if (
            paladinLevel >= 11 &&
            paladinFlags.hasRadiantStrikes === true
          ) {
            const radiantDice = criticalHit ? "2d8" : "1d8";
            radiantStrikesRoll =
              this.diceService.rollExpression(radiantDice);
            radiantStrikesRawDamage = radiantStrikesRoll.total;
            radiantStrikesAdjusted = await this.resolveDamageAdjustments(
              target,
              radiantStrikesRawDamage,
              "radiant",
              dto.ownerUserId,
            );
            radiantStrikesDamage = radiantStrikesAdjusted.finalDamage;
            extraDamageBonuses.push({
              source: "radiant-strikes",
              amount: radiantStrikesRawDamage,
              dice: radiantDice,
              damageType: "radiant",
            });
            events.push({
              event_type: "class_feature_triggered",
              actor_participant_id: attacker.id,
              target_participant_id: target.id,
              data: {
                featureSlug: "radiant-strikes",
                dice: radiantDice,
                rolledDamage: radiantStrikesRawDamage,
                damage: radiantStrikesDamage,
                damageType: "radiant",
                critical: criticalHit,
                resisted: radiantStrikesAdjusted.resisted,
                immune: radiantStrikesAdjusted.immune,
                vulnerable: radiantStrikesAdjusted.vulnerable,
              },
            });
          }

          const hasDivineSmite =
            paladinFlags.hasDivineSmite === true ||
            paladinFlags.hasPaladinsSmite === true;
          divineSmiteSourceEdition = paladinSheet.source?.code;
          const is2024Rules = divineSmiteSourceEdition !== "PHB";
          divineSmiteSlotLevels = paladinSheet.spellSlots
            .filter(
              (slot) =>
                slot.level >= 1 &&
                slot.used < slot.total,
            )
            .map((slot) => slot.level);
          const featureUses =
            await this.stateService.getFeatureUsesUsed(attacker.characterId);
          divineSmiteFreeCastAvailable =
            paladinFlags.hasPaladinsSmite === true &&
            (featureUses["paladins-smite-free"] ?? 0) < 1;
          divineSmiteCritical = criticalHit;
          divineSmiteAvailable =
            hasDivineSmite &&
            paladinLevel >= (is2024Rules ? 1 : 2) &&
            (!is2024Rules || !attacker.bonusActionUsed) &&
            (divineSmiteSlotLevels.length > 0 ||
              divineSmiteFreeCastAvailable);
        } catch {
          divineSmiteAvailable = false;
        }
      }

      let celestialRevelationRawDamage = 0;
      let celestialRevelationDamageType = "radiant";
      let celestialRevelationAdjusted = {
        finalDamage: 0,
        resisted: false,
        immune: false,
        vulnerable: false,
      };
      const celestialRevelationEffect = (
        attacker.effectInstances ?? []
      ).find((effect) => effect.kind === "celestial_revelation");
      const celestialRevelationAlreadyUsed = (
        attacker.effectInstances ?? []
      ).some((effect) => effect.kind === "celestial_revelation_used_turn");
      if (
        celestialRevelationEffect &&
        !celestialRevelationAlreadyUsed
      ) {
        celestialRevelationRawDamage = Math.max(
          0,
          Number(
            celestialRevelationEffect.payload?.extraDamageAmount ?? 0,
          ),
        );
        celestialRevelationDamageType = String(
          celestialRevelationEffect.payload?.damageType ?? "radiant",
        ).toLowerCase();
        if (celestialRevelationRawDamage > 0) {
          celestialRevelationAdjusted =
            await this.resolveDamageAdjustments(
              target,
              celestialRevelationRawDamage,
              celestialRevelationDamageType,
              dto.ownerUserId,
            );
          celestialRevelationDamage =
            celestialRevelationAdjusted.finalDamage;
          extraDamageBonuses.push({
            source: "celestial-revelation",
            amount: celestialRevelationRawDamage,
            damageType: celestialRevelationDamageType,
            finalAmount: celestialRevelationDamage,
          });
          attacker.effectInstances = [
            ...(attacker.effectInstances ?? []),
            {
              id: randomUUID(),
              kind: "celestial_revelation_used_turn",
              sourceFeatureSlug: "celestial-revelation",
              sourceCasterParticipantId: attacker.id,
              payload: {
                targetParticipantId: target.id,
              },
              expiresAt: { kind: "turns", value: 1 },
              requiresConcentration: false,
              appliedAt: new Date().toISOString(),
            },
          ];
          await this.participantRepo.save(attacker);
          events.push({
            event_type: "celestial_revelation_damage",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              featureSlug: "celestial-revelation",
              form: celestialRevelationEffect.payload?.form,
              damage: celestialRevelationRawDamage,
              damageApplied: celestialRevelationDamage,
              damageType: celestialRevelationDamageType,
              oncePerTurn: true,
              resisted: celestialRevelationAdjusted.resisted,
              immune: celestialRevelationAdjusted.immune,
              vulnerable: celestialRevelationAdjusted.vulnerable,
            },
          });
        }
      }


      let resisted = false;
      let immune = false;
      let vulnerable = false;
      let finalDamage = totalDamage;
      const adjustedDamage = await this.resolveDamageAdjustments(
        target,
        totalDamage,
        damageType,
        dto.ownerUserId,
      );
      finalDamage =
        adjustedDamage.finalDamage +
        radiantStrikesAdjusted.finalDamage +
        celestialRevelationAdjusted.finalDamage;
      const radiantComponent = extraDamageBonuses.find(
        (component) => component.source === "radiant-strikes",
      );
      if (radiantComponent) {
        radiantComponent.finalAmount = radiantStrikesAdjusted.finalDamage;
      }
      resisted =
        adjustedDamage.resisted ||
        radiantStrikesAdjusted.resisted ||
        celestialRevelationAdjusted.resisted;
      immune =
        adjustedDamage.immune &&
        (radiantStrikesRawDamage === 0 || radiantStrikesAdjusted.immune) &&
        (celestialRevelationRawDamage === 0 ||
          celestialRevelationAdjusted.immune);
      vulnerable =
        adjustedDamage.vulnerable ||
        radiantStrikesAdjusted.vulnerable ||
        celestialRevelationAdjusted.vulnerable;

      damageRollResult = {
        rolls: radiantStrikesRoll
          ? [dmgResult, radiantStrikesRoll]
          : [dmgResult],
        bonus: damageBonus,
        total:
          totalDamage +
          radiantStrikesRawDamage +
          celestialRevelationRawDamage,
        type: damageType,
        resisted,
        immune,
        vulnerable,
        finalDamage,
        extraDamageBonuses,
      };

      events.push({
        event_type: "damage_applied",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          actorName: attacker.displayName,
          targetName: target.displayName,
          ...damageRollResult,
          critical: isCritical || defenderMods.autoCritIfMelee,
        },
      });


      if (target.type === "pc" && target.characterId) {
        const targetOwnerId = await this.resolveParticipantOwner(
          target,
          dto.ownerUserId,
        );
        const wasDying = target.dyingState === "dying";
        if (wasDying) {

          const failuresDelta = isCritical ? 2 : 1;
          const ds = await this.stateService.updateDeathSaves(
            targetOwnerId,
            target.characterId,
            { failuresDelta },
          );
          targetHpAfter = 0;
          if (ds.dead) {
            target.dyingState = "dead";
            target.isDefeated = true;
            targetDefeated = true;
            await this.participantRepo.save(target);
          }
          events.push({
            event_type: "death_save_failed_from_damage",
            target_participant_id: target.id,
            data: {
              failuresAdded: failuresDelta,
              failures: ds.failures,
              dyingState: target.dyingState,
            },
          });
        } else {

          const hpResult = await this.applyDamageToPcFormAware(
            target,
            finalDamage,
            targetOwnerId,
          );
          targetHpAfter = hpResult.currentHp;
          targetDefeated = hpResult.isDown;
          if (hpResult.instantDeath) {
            target.dyingState = "dead";
            target.isDefeated = true;
            await this.participantRepo.save(target);
            events.push({
              event_type: "instant_death",
              target_participant_id: target.id,
              data: { dyingState: "dead" },
            });
          } else if (targetDefeated) {
            target.dyingState = "dying";
            target.isDefeated = false;
            await this.participantRepo.save(target);
            events.push({
              event_type: "fell_unconscious",
              target_participant_id: target.id,
              data: { dyingState: "dying" },
            });
          }
        }
      } else {

        const result = this.applyDamageToMonster(target, finalDamage);
        const survivalEvent = this.applyUndeadFortitude(
          target,
          finalDamage,
          damageType,
          isCritical || defenderMods.autoCritIfMelee,
        );
        if (survivalEvent) events.push(survivalEvent);
        targetHpAfter = target.currentHp ?? result.hpAfter;
        targetDefeated = target.isDefeated;
        await this.participantRepo.save(target);
      }

      if (finalDamage > 0) {
        events.push(
          ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
            target,
          )),
        );
      }

      if (target.isConcentrating && finalDamage > 0 && !targetDefeated) {
        const concResult = await this.concentrationCheck(target, finalDamage);
        concentrationBroken = !concResult.maintained;
        events.push({
          event_type: "concentration_check",
          target_participant_id: target.id,
          data: concResult,
        });
        if (!concResult.maintained) {
          const breakRes = await this.concentration.break(target, "damage");
          events.push(...breakRes.events);
        }
      }

      if (targetDefeated) {


        if (target.isConcentrating) {
          const breakRes = await this.concentration.breakDueToDeath(target);
          events.push(...breakRes.events);
        }





        const hunterMarks = (target.effectInstances ?? []).filter(
          (e) =>
            e.kind === "hunter_mark" &&
            e.sourceCasterParticipantId === attacker.id,
        );
        const hexMarks = (target.effectInstances ?? []).filter(
          (e) =>
            e.kind === "hex_mark" &&
            e.sourceCasterParticipantId === attacker.id,
        );
        for (const mk of hunterMarks) {
          events.push({
            event_type: "mark_ready_to_transfer",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              sourceSpell: mk.sourceSpellSlug ?? "hunters-mark",
              previousTargetId: target.id,
              effectId: mk.id,
              bonusActionRecast: true,
            },
          });
        }
        for (const mk of hexMarks) {
          events.push({
            event_type: "mark_ready_to_transfer",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              sourceSpell: mk.sourceSpellSlug ?? "hex",
              previousTargetId: target.id,
              effectId: mk.id,
              bonusActionRecast: true,
            },
          });
        }
        await this.removeDefeatedSummon(encounter, target, events, "hp-zero");
      }

      if (
        damageRollResult?.finalDamage > 0 &&
        !targetDefeated
      ) {
        const giantAncestry = await this.maybeOfferGiantAncestryOnHit(
          attacker,
          target,
          dto.ownerUserId,
          events,
        );
        if (giantAncestry) {
          giantAncestryAvailable = true;
          giantAncestryFeatureSlug = giantAncestry;
        }
        await this.maybeOfferDruidHitRiders(
          attacker,
          target,
          dto.ownerUserId,
          {
            weaponOrWildShape:
              Boolean(attacker.transformationState) ||
              (isWeaponOrUnarmedAttack && !isUnarmedAttack),
            wildShape: Boolean(attacker.transformationState),
            critical: isCritical || defenderMods.autoCritIfMelee,
          },
          events,
        );
      }

      if (divineSmiteAvailable && !targetDefeated) {
        const stalePending = (attacker.effectInstances ?? []).filter(
          (effect) => effect.kind === "divine_smite_pending",
        );
        for (const effect of stalePending) {
          const removed = await this.effectInstances.removeEffect(
            attacker,
            effect.id,
            "manual",
          );
          events.push(...removed.events);
        }
        const pending = await this.effectInstances.addEffect(attacker, {
          kind: "divine_smite_pending",
          sourceFeatureSlug: "divine-smite",
          sourceCasterParticipantId: attacker.id,
          payload: {
            requiredTargetId: target.id,
            hitWasCritical: divineSmiteCritical,
            sourceEdition: divineSmiteSourceEdition,
          },
          expiresAt: { kind: "caster_turn_ends", value: 1 },
          requiresConcentration: false,
        });
        events.push(...pending.events, {
          event_type: "divine_smite_available",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: {
            targetParticipantId: target.id,
            targetName: target.displayName,
            slotLevels: divineSmiteSlotLevels,
            freeCastAvailable: divineSmiteFreeCastAvailable,
            critical: divineSmiteCritical,
            sourceEdition: divineSmiteSourceEdition,
          },
        });
      } else {
        divineSmiteAvailable = false;
      }

      if (
        cunningStrikeOptions.length > 0 &&
        cunningStrikeSneakAttackDice &&
        cunningStrikeSneakAttackRolls.length > 0 &&
        !targetDefeated
      ) {
        const pending = await this.effectInstances.addEffect(attacker, {
          kind: "cunning_strike_pending",
          sourceFeatureSlug: "cunning-strike",
          sourceCasterParticipantId: attacker.id,
          payload: {
            requiredTargetId: target.id,
            sneakAttackDice: cunningStrikeSneakAttackDice,
            sneakAttackRolls: cunningStrikeSneakAttackRolls,
            sneakAttackCritical: isCritical,
            targetHpAfterAttack: targetHpAfter,
            wasHiddenBeforeAttack: attackerWasHiddenBeforeAttack,
            cunningStrikeOptions,
          },
          expiresAt: { kind: "caster_turn_ends", value: 1 },
          requiresConcentration: false,
        });
        events.push(...pending.events, {
          event_type: "cunning_strike_available",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: {
            targetParticipantId: target.id,
            targetName: target.displayName,
            sneakAttackDice: cunningStrikeSneakAttackDice,
            options: cunningStrikeOptions,
          },
        });
        cunningStrikeAvailable = true;
      }





      if (masterySlug) {
        const mRes = await this.weaponMastery.resolveOnHit({
          masterySlug,
          attacker,
          target,
          abilityMod: masteryAbilityMod,
          profBonus: await this.getAttackerProfBonus(attacker, dto.ownerUserId),
          damageType,

          damageRolledAmount: damageRollResult?.finalDamage,
        });
        events.push(...mRes.events);



        if (mRes.cleaveSecondTarget) {
          const secondTarget = await this.participantRepo.findOne({
            where: { id: mRes.cleaveSecondTarget.participantId },
          });
          if (secondTarget) {
            const cleaveDmg = mRes.cleaveSecondTarget.damageAmount;
            if (secondTarget.type === "pc" && secondTarget.characterId) {
              const targetOwnerId = await this.resolveParticipantOwner(
                secondTarget,
                dto.ownerUserId,
              );
              const hpRes = await this.stateService.updateHp(
                targetOwnerId,
                secondTarget.characterId,
                { damage: cleaveDmg },
              );
              if (hpRes.instantDeath) {
                secondTarget.dyingState = "dead";
                secondTarget.isDefeated = true;
                collateralDefeated = true;
                await this.participantRepo.save(secondTarget);
              } else if (hpRes.isDown) {
                secondTarget.dyingState = "dying";
                await this.participantRepo.save(secondTarget);
              }
            } else {
              const cleaveResult = this.applyDamageToMonster(
                secondTarget,
                cleaveDmg,
              );
              await this.participantRepo.save(secondTarget);
              if (cleaveResult.defeated) {
                collateralDefeated = true;
                await this.removeDefeatedSummon(
                  encounter,
                  secondTarget,
                  events,
                  "hp-zero",
                );
              }
            }
            events.push(
              ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
                secondTarget,
              )),
            );
            events.push({
              event_type: "damage_applied",
              actor_participant_id: attacker.id,
              target_participant_id: secondTarget.id,
              data: {
                rolls: [],
                bonus: 0,
                total: cleaveDmg,
                type: mRes.cleaveSecondTarget.damageType,
                resisted: false,
                immune: false,
                vulnerable: false,
                finalDamage: cleaveDmg,
                source: "weapon-mastery:cleave",
              },
            });
          }
        }
      }
    } else {

      if (masterySlug === "graze") {
        const profBonus = await this.getAttackerProfBonus(
          attacker,
          dto.ownerUserId,
        );
        const mRes = this.weaponMastery.resolveOnMiss({
          masterySlug,
          attacker,
          target,
          abilityMod: masteryAbilityMod,
          profBonus,
          damageType,
        });
        events.push(...mRes.events);
        if (mRes.grazeDamage && mRes.grazeDamage.amount > 0) {



          const dmg = mRes.grazeDamage.amount;
          if (target.type === "pc" && target.characterId) {
            const targetOwnerId = await this.resolveParticipantOwner(
              target,
              dto.ownerUserId,
            );
            const hpResult = await this.stateService.updateHp(
              targetOwnerId,
              target.characterId,
              { damage: dmg },
            );
            targetHpAfter = hpResult.currentHp;
            targetDefeated = hpResult.isDown;
            if (hpResult.instantDeath) {
              target.dyingState = "dead";
              target.isDefeated = true;
              await this.participantRepo.save(target);
            } else if (targetDefeated) {
              target.dyingState = "dying";
              target.isDefeated = false;
              await this.participantRepo.save(target);
            }
          } else {
            const result = this.applyDamageToMonster(target, dmg);
            targetHpAfter = result.hpAfter;
            targetDefeated = result.defeated;
            await this.participantRepo.save(target);
          }
          events.push(
            ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
              target,
            )),
          );
          events.push({
            event_type: "damage_applied",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              rolls: [],
              bonus: 0,
              total: dmg,
              type: mRes.grazeDamage.damageType,
              resisted: false,
              immune: false,
              vulnerable: false,
              finalDamage: dmg,
              source: "weapon-mastery:graze",
            },
          });
          if (targetDefeated) {
            await this.removeDefeatedSummon(
              encounter,
              target,
              events,
              "hp-zero",
            );
          }

          damageRollResult = {
            rolls: [],
            bonus: 0,
            total: dmg,
            type: mRes.grazeDamage.damageType,
            resisted: false,
            immune: false,
            vulnerable: false,
            finalDamage: dmg,
            extraDamageBonuses: [],
          } as any;
        }
      }





      if (
        isWeaponOrUnarmedAttack &&
        attacker.type === "pc" &&
        (await this.hasStudiedAttacks(attacker, dto.ownerUserId))
      ) {
        const { effect, events: effEvents } =
          await this.effectInstances.addEffect(attacker, {
            kind: "self_advantage_next_attack",
            sourceFeatureSlug: "fighter:studied-attacks",
            sourceCasterParticipantId: attacker.id,
            payload: { requiredTargetId: target.id },
            expiresAt: { kind: "until_consumed" },
            requiresConcentration: false,
          });
        events.push(...effEvents);
        events.push({
          event_type: "class_feature_triggered",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: {
            featureSlug: "studied-attacks",
            trigger: "miss",
            effectId: effect.id,
            requiredTargetId: target.id,
          },
        });
      }
    }

    if (
      hit &&
      monsterSecondarySaveDamage &&
      !(target.type === "monster" && target.isDefeated)
    ) {
      const secondary = await this.resolveMonsterSecondarySaveDamage({
        encounter,
        attacker,
        target,
        actionName: dto.actionName,
        ownerUserId: dto.ownerUserId,
        effect: monsterSecondarySaveDamage,
        hpBefore: targetHpAfter,
      });
      events.push(...secondary.events);
      targetHpAfter = secondary.hpAfter;
      targetDefeated = secondary.defeated;
      if (secondary.concentrationBroken !== undefined) {
        concentrationBroken =
          concentrationBroken === true || secondary.concentrationBroken;
      }
    }

    if (hit && monsterOnHitCondition) {
      const applied = await this.conditionLifecycle.applyCondition(target, {
        slug: monsterOnHitCondition.slug,
        appliedBy: attacker.id,
        source: `ability:${String(attacker.monster?.slug ?? "monster")}-${dto.actionName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        saveAbility: monsterOnHitCondition.saveAbility,
        saveDc: monsterOnHitCondition.saveDc,
        repeatSaveTiming: "never",
        durationRoundsRemaining: null,
      });
      events.push(...applied.events);
    }

    if (
      hit &&
      monsterOnHitSaveCondition &&
      !(target.type === "monster" && target.isDefeated)
    ) {
      events.push(
        ...(await this.resolveMonsterOnHitSaveCondition({
          encounter,
          attacker,
          target,
          actionName: dto.actionName,
          ownerUserId: dto.ownerUserId,
          effect: monsterOnHitSaveCondition,
        })),
      );
    }

    let openHandTechniqueAvailable = false;
    if (!dto._isSubAttack) {

      if (useHasteAction) {
        consumeHasteAction(attacker);
        events.push({
          event_type: "haste_action_used",
          actor_participant_id: attacker.id,
          target_participant_id: target.id,
          data: { kind: "weapon_attack", actionName: dto.actionName },
        });
      } else {
        this.consumeStandardOrBonusAttack(attacker, isUnarmedAttack);
      }

      if (isFlurryGrantedUnarmedAttack && openHandFlurryMarker) {
        const remaining = Math.max(
          0,
          (openHandFlurryMarker.payload?.amount ?? 1) - 1,
        );
        attacker.effectInstances = (attacker.effectInstances ?? [])
          .map((effect) =>
            effect.id === openHandFlurryMarker.id
              ? {
                  ...effect,
                  payload: { ...effect.payload, amount: remaining },
                }
              : effect,
          )
          .filter(
            (effect) =>
              effect.id !== openHandFlurryMarker.id || remaining > 0,
          );
        if (hit && !targetDefeated && hasOpenHandTechnique) {
          const pending = await this.effectInstances.addEffect(attacker, {
            kind: "open_hand_technique_pending",
            sourceFeatureSlug: "open-hand-technique",
            sourceCasterParticipantId: attacker.id,
            payload: { requiredTargetId: target.id },
            expiresAt: { kind: "caster_turn_ends", value: 1 },
            requiresConcentration: false,
          });
          events.push({
            event_type: "open_hand_technique_available",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              targetParticipantId: target.id,
              targetName: target.displayName,
            },
          });
          openHandTechniqueAvailable = true;
        }
      }


      if (attacker.tacticalMasterOverride) {
        attacker.tacticalMasterOverride = null;
      }

      if (monsterRechargeActionName) {
        attacker.rechargeState = {
          ...(attacker.rechargeState ?? {}),
          [monsterRechargeActionName]: "used",
        };
      }


      if (attacker.conditions?.includes("hidden")) {
        attacker.conditions = attacker.conditions.filter((c) => c !== "hidden");
        events.push({
          event_type: "condition_removed",
          actor_participant_id: attacker.id,
          data: { condition: "hidden", reason: "attacked" },
        });
      }



      if (reactive.consumedHelp && activeHelper) {
        activeHelper.helpingAllyParticipantId = null;
        activeHelper.helpingTargetParticipantId = null;
        activeHelper.helpingUntilTurnOfParticipantId = null;
        await this.participantRepo.save(activeHelper);
        events.push({
          event_type: "help_consumed",
          actor_participant_id: activeHelper.id,
          data: {
            allyParticipantId: attacker.id,
            targetParticipantId: target.id,
          },
        });
      }



      if (consumeInspiration) {
        const inspResult = await this.inspirationService.consumeIfArmed(
          attacker.id,
          "attack_roll",
        );
        if (inspResult.consumed && inspResult.eventData) {


          attacker.inspirationArmed = false;
          events.push(inspResult.eventData);
        }
      }

      await this.participantRepo.save(attacker);

      const savedEvents = await this.eventService.emit(
        encounter.sessionId,
        encounterId,
        events,
      );




      if (
        hit &&
        target.type === "pc" &&
        damageRollResult &&
        damageRollResult.finalDamage > 0
      ) {
        const deflectOpp =
          await this.reactionOpportunity.shouldOfferDeflectAttacks(
            target,
            damageRollResult.type,
            dto.ownerUserId,
          );
        const damageEventSaved = savedEvents.find(
          (event) => event.eventType === "damage_applied",
        );
        const giantAncestryReactionOffered = damageEventSaved
          ? await this.maybeOfferGiantAncestryReaction(
              encounter,
              attacker,
              target,
              dto.ownerUserId,
              damageEventSaved.id,
              targetHpBeforeAttack,
              targetHpAfter ?? 0,
              targetTempHpBeforeAttack,
              damageRollResult.finalDamage,
              damageRollResult.type,
              events,
            )
          : false;
        if (
          !giantAncestryReactionOffered &&
          deflectOpp &&
          damageEventSaved
        ) {
          await this.effectInstances.addEffect(target, {
            kind: "deflect_attacks_pending",
            sourceFeatureSlug: "deflect-attacks",
            sourceCasterParticipantId: target.id,
            payload: {
              triggerEventId: damageEventSaved.id,
              attackerParticipantId: attacker.id,
              turnParticipantIdAtTrigger:
                encounter.turnOrder[encounter.currentTurnIndex],
              incomingDamage: damageRollResult.finalDamage,
              damageType: damageRollResult.type,
              hpBefore: targetHpBeforeAttack,
              hpAfter: targetHpAfter ?? 0,
              isMeleeAttack,
              minimumReduction:
                1 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
              maximumReduction:
                10 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
              focusRemaining: deflectOpp.focusRemaining,
            },
            expiresAt: { kind: "until_consumed" },
            requiresConcentration: false,
          });
          events.push({
            event_type: "deflect_attacks_opportunity",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              triggerEventId: damageEventSaved.id,
              attackerParticipantId: attacker.id,
              attackerName: attacker.displayName,
              reactorName: deflectOpp.reactorName,
              incomingDamage: damageRollResult.finalDamage,
              damageType: damageRollResult.type,
              minimumReduction:
                1 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
              maximumReduction:
                10 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
              focusRemaining: deflectOpp.focusRemaining,
              isMeleeAttack,
              timeoutSeconds: 20,
            },
          });
        }

        const uncannyDodgeOpp =
          !giantAncestryReactionOffered && !deflectOpp
          ? await this.reactionOpportunity.shouldOfferUncannyDodge(
              target,
              dto.ownerUserId,
            )
          : null;
        if (uncannyDodgeOpp && damageEventSaved) {
          await this.effectInstances.addEffect(target, {
            kind: "uncanny_dodge_pending",
            sourceFeatureSlug: "uncanny-dodge",
            sourceCasterParticipantId: target.id,
            payload: {
              triggerEventId: damageEventSaved.id,
              attackerParticipantId: attacker.id,
              turnParticipantIdAtTrigger:
                encounter.turnOrder[encounter.currentTurnIndex],
              incomingDamage: damageRollResult.finalDamage,
              damageType: damageRollResult.type,
              hpBefore: targetHpBeforeAttack,
              hpAfter: targetHpAfter ?? 0,
            },
            expiresAt: { kind: "until_consumed" },
            requiresConcentration: false,
          });
          events.push({
            event_type: "uncanny_dodge_opportunity",
            actor_participant_id: attacker.id,
            target_participant_id: target.id,
            data: {
              triggerEventId: damageEventSaved.id,
              attackerParticipantId: attacker.id,
              attackerName: attacker.displayName,
              reactorName: uncannyDodgeOpp.reactorName,
              incomingDamage: damageRollResult.finalDamage,
              damageAfter: Math.floor(damageRollResult.finalDamage / 2),
              damageType: damageRollResult.type,
              timeoutSeconds: 20,
            },
          });
        }

        const shieldOpp =
          !giantAncestryReactionOffered && !deflectOpp && !uncannyDodgeOpp
          ? await this.reactionOpportunity.shouldOfferShield(
              target,
              attackRollResult.total,
              targetAc,
              dto.ownerUserId,
            )
          : null;
        if (shieldOpp) {
          const attackRollSaved = savedEvents.find(
            (e) => e.eventType === "attack_roll",
          );
          if (attackRollSaved) {
            const oppEvents = await this.eventService.emit(
              encounter.sessionId,
              encounterId,
              [
                {
                  event_type: "shield_opportunity",
                  actor_participant_id: attacker.id,
                  target_participant_id: target.id,
                  data: {
                    triggerEventId: attackRollSaved.id,
                    attackerName: attacker.displayName,
                    reactorName: shieldOpp.reactorName,
                    attackTotal: attackRollResult.total,
                    currentAc: targetAc,
                    slotLevel: shieldOpp.slotLevel,
                    timeoutSeconds: 20,
                  },
                },
              ],
            );

            events.push({
              event_type: "shield_opportunity",
              actor_participant_id: attacker.id,
              target_participant_id: target.id,
              data: {
                triggerEventId: attackRollSaved.id,
                attackerName: attacker.displayName,
                reactorName: shieldOpp.reactorName,
                attackTotal: attackRollResult.total,
                currentAc: targetAc,
                slotLevel: shieldOpp.slotLevel,
                timeoutSeconds: 20,
              },
            });

            void oppEvents;
          }
        }
      }
    }

    // Sub-attacks (multiattack) deixam a checagem para o fim da sequência.
    if (!dto._isSubAttack) {
      await this.maybeAutoEndAfterDefeat(
        encounterId,
        targetDefeated || collateralDefeated,
      );
    }

    return success(
      {
        attackRoll: attackRollResult,
        damageRoll: damageRollResult,
        targetHpBefore: targetHpBeforeAttack,
        targetHpAfter,
        targetDefeated,
        concentrationBroken,
        radiantStrikesDamage,
        celestialRevelationDamage,
        divineSmiteAvailable,
        divineSmiteTargetParticipantId: divineSmiteAvailable
          ? target.id
          : undefined,
        divineSmiteSlotLevels: divineSmiteAvailable
          ? divineSmiteSlotLevels
          : undefined,
        divineSmiteFreeCastAvailable: divineSmiteAvailable
          ? divineSmiteFreeCastAvailable
          : undefined,
        divineSmiteCritical: divineSmiteAvailable
          ? divineSmiteCritical
          : undefined,
        openHandTechniqueAvailable,
        openHandTargetParticipantId: openHandTechniqueAvailable
          ? target.id
          : undefined,
        giantAncestryAvailable,
        giantAncestryFeatureSlug,
        giantAncestryTargetParticipantId: giantAncestryAvailable
          ? target.id
          : undefined,
        cunningStrikeAvailable,
        cunningStrikeTargetParticipantId: cunningStrikeAvailable
          ? target.id
          : undefined,
        cunningStrikeOptions,
      },
      events,
    );
  }

  private async resolveMonsterOnHitSaveCondition(input: {
    encounter: EncounterEntity;
    attacker: EncounterParticipantEntity;
    target: EncounterParticipantEntity;
    actionName: string;
    ownerUserId: string;
    effect: NonNullable<ResolvedMonsterAction["onHitSaveCondition"]>;
  }): Promise<GameEventData[]> {
    const {
      encounter,
      attacker,
      target,
      actionName,
      ownerUserId,
      effect,
    } = input;
    const creatureType = String(target.monster?.type ?? "").toLowerCase();
    if (
      effect.excludedCreatureTypes.some((excluded) =>
        creatureType.includes(excluded.toLowerCase()),
      )
    ) {
      return [];
    }

    if (
      target.type === "pc" &&
      target.characterId &&
      effect.excludedRaceTerms.length > 0
    ) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        targetOwnerId,
        target.characterId,
      );
      const raceText =
        `${sheet.race?.slug ?? ""} ${sheet.race?.name ?? ""}`.toLowerCase();
      if (
        effect.excludedRaceTerms.some((excluded) =>
          raceText.includes(excluded.toLowerCase()),
        )
      ) {
        return [];
      }
    }

    let save: SavingThrowResult;
    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        ownerUserId,
      );
      const result = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        userId: targetOwnerId,
        ability: effect.saveAbility,
        dc: effect.saveDc,
        encounterId: encounter.id,
        sessionId: encounter.sessionId,
        participantId: target.id,
      });
      if (!result.ok || !result.value) {
        throw new Error(`Falha ao resolver salvaguarda de ${actionName}.`);
      }
      save = result.value;
    } else {
      const saveModifiers = this.conditionEffects.getSavingThrowModifiers(
        target.conditions ?? [],
        effect.saveAbility,
      );
      const hasAdvantage =
        saveModifiers.hasAdvantage ||
        hasDodgeDexSaveAdvantage(target, effect.saveAbility) ||
        hasBeaconWisdomSaveAdvantage(target, effect.saveAbility);
      const hasDisadvantage = saveModifiers.hasDisadvantage;
      let roll = 0;
      let advantage:
        | { roll1: number; roll2: number; chosen: number; discarded: number }
        | undefined;
      if (!saveModifiers.autoFail) {
        if (hasAdvantage && !hasDisadvantage) {
          const rolled = this.diceService.rollWithAdvantage();
          roll = rolled.chosen;
          advantage = {
            ...rolled,
            discarded:
              rolled.roll1 === rolled.chosen ? rolled.roll2 : rolled.roll1,
          };
        } else if (hasDisadvantage && !hasAdvantage) {
          const rolled = this.diceService.rollWithDisadvantage();
          roll = rolled.chosen;
          advantage = {
            ...rolled,
            discarded:
              rolled.roll1 === rolled.chosen ? rolled.roll2 : rolled.roll1,
          };
        } else {
          roll = this.diceService.roll(20);
        }
      }
      const modifier = getMonsterSavingThrowBonus(
        (target.monster ?? {}) as unknown as Record<string, unknown>,
        effect.saveAbility,
      );
      const total = saveModifiers.autoFail ? 0 : roll + modifier;
      save = {
        ability: effect.saveAbility,
        dc: effect.saveDc,
        roll,
        modifier,
        total,
        success: !saveModifiers.autoFail && total >= effect.saveDc,
        advantage,
      };
    }

    const events: GameEventData[] = [
      {
        event_type: "save_rolled",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          sourceAction: actionName,
          spellSlug: actionName,
          ability: save.ability,
          dc: save.dc,
          roll: save.roll,
          modifier: save.modifier,
          total: save.total,
          success: save.success,
          advantage: save.advantage,
        },
      },
    ];
    if (save.success) return events;

    const applied = await this.conditionLifecycle.applyCondition(target, {
      slug: effect.slug,
      appliedBy: attacker.id,
      source: `ability:${String(attacker.monster?.slug ?? "monster")}-${actionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      saveAbility: effect.saveAbility,
      saveDc: effect.saveDc,
      repeatSaveTiming: effect.repeatSaveTiming,
      durationRoundsRemaining: effect.durationRounds,
      expiresAtTurnEndParticipantId:
        effect.expiresAtTurnEndParticipantId,
    });
    events.push(...applied.events);
    return events;
  }

  private async resolveMonsterSecondarySaveDamage(input: {
    encounter: EncounterEntity;
    attacker: EncounterParticipantEntity;
    target: EncounterParticipantEntity;
    actionName: string;
    ownerUserId: string;
    effect: NonNullable<ResolvedMonsterAction["secondarySaveDamage"]>;
    hpBefore?: number;
  }): Promise<{
    events: GameEventData[];
    hpAfter: number;
    defeated: boolean;
    concentrationBroken?: boolean;
  }> {
    const {
      encounter,
      attacker,
      target,
      actionName,
      ownerUserId,
      effect,
    } = input;
    const events: GameEventData[] = [];
    let save: SavingThrowResult;

    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        ownerUserId,
      );
      const result = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        userId: targetOwnerId,
        ability: effect.saveAbility,
        dc: effect.saveDc,
        encounterId: encounter.id,
        sessionId: encounter.sessionId,
        participantId: target.id,
      });
      if (!result.ok || !result.value) {
        throw new Error(
          `Falha ao resolver salvaguarda secundária de ${actionName}.`,
        );
      }
      save = result.value;
    } else {
      const saveModifiers = this.conditionEffects.getSavingThrowModifiers(
        target.conditions ?? [],
        effect.saveAbility,
      );
      const hasAdvantage =
        saveModifiers.hasAdvantage ||
        hasDodgeDexSaveAdvantage(target, effect.saveAbility) ||
        hasBeaconWisdomSaveAdvantage(target, effect.saveAbility);
      const hasDisadvantage = saveModifiers.hasDisadvantage;
      let roll = 0;
      let advantage:
        | { roll1: number; roll2: number; chosen: number; discarded: number }
        | undefined;
      if (!saveModifiers.autoFail) {
        if (hasAdvantage && !hasDisadvantage) {
          const rolled = this.diceService.rollWithAdvantage();
          roll = rolled.chosen;
          advantage = {
            ...rolled,
            discarded:
              rolled.roll1 === rolled.chosen ? rolled.roll2 : rolled.roll1,
          };
        } else if (hasDisadvantage && !hasAdvantage) {
          const rolled = this.diceService.rollWithDisadvantage();
          roll = rolled.chosen;
          advantage = {
            ...rolled,
            discarded:
              rolled.roll1 === rolled.chosen ? rolled.roll2 : rolled.roll1,
          };
        } else {
          roll = this.diceService.roll(20);
        }
      }
      const modifier = getMonsterSavingThrowBonus(
        (target.monster ?? {}) as unknown as Record<string, unknown>,
        effect.saveAbility,
      );
      const total = saveModifiers.autoFail ? 0 : roll + modifier;
      save = {
        ability: effect.saveAbility,
        dc: effect.saveDc,
        roll,
        modifier,
        total,
        success: !saveModifiers.autoFail && total >= effect.saveDc,
        advantage,
      };
    }

    events.push({
      event_type: "save_rolled",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        sourceAction: actionName,
        spellSlug: actionName,
        ability: save.ability,
        dc: save.dc,
        roll: save.roll,
        modifier: save.modifier,
        total: save.total,
        success: save.success,
        advantage: save.advantage,
      },
    });

    const damageRoll = this.diceService.rollExpression(effect.damageDice);
    const rawDamage =
      save.success && effect.halfOnSuccess
        ? Math.floor(damageRoll.total / 2)
        : damageRoll.total;
    const adjusted = await this.resolveDamageAdjustments(
      target,
      rawDamage,
      effect.damageType,
      ownerUserId,
    );
    const finalDamage = adjusted.finalDamage;
    events.push({
      event_type: "damage_applied",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        rolls: [damageRoll],
        bonus: 0,
        total: rawDamage,
        type: effect.damageType,
        resisted: adjusted.resisted,
        immune: adjusted.immune,
        vulnerable: adjusted.vulnerable,
        finalDamage,
        source: `monster-action:${actionName}`,
        component: "secondary-save-damage",
        save,
      },
    });

    let hpAfter = input.hpBefore ?? target.currentHp ?? 0;
    let defeated = false;
    let reducedToZeroByThisDamage = false;

    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        ownerUserId,
      );
      const wasAlreadyAtZero =
        target.dyingState === "dying" ||
        target.dyingState === "stable" ||
        input.hpBefore === 0;
      if (wasAlreadyAtZero && finalDamage > 0) {
        const deathSaves = await this.stateService.updateDeathSaves(
          targetOwnerId,
          target.characterId,
          { failuresDelta: 1 },
        );
        hpAfter = 0;
        defeated = deathSaves.dead;
        target.dyingState = deathSaves.dead ? "dead" : "dying";
        target.isDefeated = deathSaves.dead;
        await this.participantRepo.save(target);
        events.push({
          event_type: "death_save_failed_from_damage",
          target_participant_id: target.id,
          data: {
            failuresAdded: 1,
            failures: deathSaves.failures,
            dyingState: target.dyingState,
            source: `monster-action:${actionName}`,
          },
        });
      } else {
        const hpResult = await this.applyDamageToPcFormAware(
          target,
          finalDamage,
          targetOwnerId,
        );
        hpAfter = hpResult.currentHp;
        defeated = hpResult.isDown;
        reducedToZeroByThisDamage =
          finalDamage > 0 && hpResult.isDown && !hpResult.instantDeath;
        if (hpResult.instantDeath) {
          target.dyingState = "dead";
          target.isDefeated = true;
          defeated = true;
          await this.participantRepo.save(target);
          events.push({
            event_type: "instant_death",
            target_participant_id: target.id,
            data: {
              dyingState: "dead",
              source: `monster-action:${actionName}`,
            },
          });
        } else if (hpResult.isDown) {
          target.dyingState = "dying";
          target.isDefeated = false;
          await this.participantRepo.save(target);
          events.push({
            event_type: "fell_unconscious",
            target_participant_id: target.id,
            data: {
              dyingState: "dying",
              source: `monster-action:${actionName}`,
            },
          });
        }
      }
    } else {
      const result = this.applyDamageToMonster(target, finalDamage);
      hpAfter = result.hpAfter;
      defeated = result.defeated;
      reducedToZeroByThisDamage = finalDamage > 0 && result.defeated;
      await this.participantRepo.save(target);
    }

    if (finalDamage > 0) {
      events.push(
        ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
          target,
        )),
      );
    }

    const zeroHpEffect =
      reducedToZeroByThisDamage && !target.isDefeated
        ? effect.zeroHpEffect
        : reducedToZeroByThisDamage
          ? effect.zeroHpEffect
          : undefined;
    if (zeroHpEffect?.stable) {
      defeated = false;
      target.isDefeated = false;
      target.dyingState = "stable";
      if (target.type === "pc" && target.characterId) {
        const targetOwnerId = await this.resolveParticipantOwner(
          target,
          ownerUserId,
        );
        await this.stateService.updateDeathSaves(
          targetOwnerId,
          target.characterId,
          { reset: true },
        );
        const sheet = await this.sheetService.computeSheet(
          targetOwnerId,
          target.characterId,
        );
        const sheetConditions = (sheet.conditions ?? []).filter(
          (condition) => condition !== "dying" && condition !== "dead",
        );
        if (!sheetConditions.includes("unconscious")) {
          sheetConditions.push("unconscious");
        }
        await this.stateService.updateConditions(
          targetOwnerId,
          target.characterId,
          { conditions: sheetConditions },
        );
      }
      await this.participantRepo.save(target);
      events.push({
        event_type: "poison_zero_hp_stabilized",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          sourceAction: actionName,
          durationRounds: zeroHpEffect.durationRounds,
        },
      });

      const poisoned = await this.conditionLifecycle.applyCondition(target, {
        slug: "poisoned",
        appliedBy: attacker.id,
        source: `ability:${String(attacker.monster?.slug ?? "monster")}-${actionName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
        repeatSaveTiming: "never",
        durationRoundsRemaining: zeroHpEffect.durationRounds,
      });
      events.push(...poisoned.events);
      if ((target.conditions ?? []).includes("poisoned")) {
        const paralyzed = await this.conditionLifecycle.applyCondition(target, {
          slug: "paralyzed",
          appliedBy: attacker.id,
          source: `ability:${String(attacker.monster?.slug ?? "monster")}-${actionName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,
          repeatSaveTiming: "never",
          durationRoundsRemaining: zeroHpEffect.durationRounds,
        });
        events.push(...paralyzed.events);
      }
    }

    let concentrationBroken: boolean | undefined;
    if (target.isConcentrating && finalDamage > 0 && !defeated) {
      const concentration = await this.concentrationCheck(target, finalDamage);
      concentrationBroken = !concentration.maintained;
      events.push({
        event_type: "concentration_check",
        target_participant_id: target.id,
        data: concentration,
      });
      if (!concentration.maintained) {
        const broken = await this.concentration.break(target, "damage");
        events.push(...broken.events);
      }
    }

    if (defeated) {
      if (target.isConcentrating) {
        const broken = await this.concentration.breakDueToDeath(target);
        events.push(...broken.events);
      }
      await this.removeDefeatedSummon(encounter, target, events, "hp-zero");
    }

    return {
      events,
      hpAfter,
      defeated,
      concentrationBroken,
    };
  }



  async resolveMultiattack(
    encounterId: string,
    dto: AttackDto,
  ): Promise<GameResult<MultiattackResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");

    const attacker = await this.encounterService.getParticipant(
      dto.attackerParticipantId,
    );

    if (attacker.isDefeated)
      return failure("Atacante esta derrotado.", "CONDITION_PREVENTS_ACTION");
    if (findFearCompulsion(attacker))
      return failure(
        "Fear obriga o atacante a usar Disparada e fugir.",
        "CONDITION_PREVENTS_ACTION",
      );

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== dto.attackerParticipantId)
      return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");

    if (attacker.actionUsed)
      return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");

    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure(
        "Atacante nao pode agir devido a condicoes.",
        "CONDITION_PREVENTS_ACTION",
      );
    const abjureChoice = chooseAbjureFoesTurnOption(
      attacker,
      "action",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }

    const transformedMultiattack =
      attacker.type === "pc"
        ? attacker.transformationState?.form.multiattack
        : null;
    if (
      (attacker.type !== "monster" || !attacker.monster) &&
      !transformedMultiattack
    ) {
      return failure(
        "Multiataque exige um monstro ou uma forma transformada compatível.",
        "INVALID_MULTIATTACK",
      );
    }
    const summonStatBlock =
      attacker.type === "monster" ? getSummonStatBlock(attacker) : null;
    const multiattack =
      transformedMultiattack ??
      (summonStatBlock && summonStatBlock.attack.attacksPerAction > 1
        ? {
            sequence: [
              {
                actionName: summonStatBlock.attack.name,
                count: summonStatBlock.attack.attacksPerAction,
              },
            ],
          }
        : (attacker.monster as any)?.multiattack);
    if (
      !multiattack ||
      !Array.isArray(multiattack.sequence) ||
      multiattack.sequence.length === 0
    ) {
      return failure(
        "Este monstro não possui multiataque configurado.",
        "INVALID_MULTIATTACK",
      );
    }

    const expectedTargets = multiattack.sequence.reduce(
      (acc: number, s: { count: number }) => acc + (s.count ?? 1),
      0,
    );
    const targetIds = Array.isArray(dto.targetParticipantIds)
      ? dto.targetParticipantIds
      : [];
    if (targetIds.length !== expectedTargets) {
      return failure(
        `Multiataque exige targetParticipantIds com ${expectedTargets} alvos.`,
        "INVALID_PAYLOAD",
      );
    }

    const subAttacks: SubAttackResult[] = [];
    const allEvents: GameEventData[] = [
      {
        event_type: "multiattack_start",
        actor_participant_id: attacker.id,
        data: { sequence: multiattack.sequence },
      },
    ];

    let targetIdx = 0;
    let interruptedAt: MultiattackResult["interruptedAt"] = null;

    outer: for (const sub of multiattack.sequence) {
      for (let i = 0; i < (sub.count ?? 1); i++) {
        const tid = targetIds[targetIdx];
        targetIdx++;
        const target = await this.encounterService.getParticipant(tid);
        if (target.isDefeated) {
          interruptedAt = { index: targetIdx - 1, reason: "target_defeated" };
          break outer;
        }
        const subDto: AttackDto = {
          ...dto,
          targetParticipantId: tid,
          actionName: sub.actionName,
          _isSubAttack: true,
        };
        const res = await this.resolveAttack(encounterId, subDto);
        if (!res.ok) {
          if (subAttacks.length === 0) {
            return failure(
              `Multiataque não executado: ${res.error}`,
              res.code,
            );
          }
          interruptedAt = { index: targetIdx - 1, reason: "action_cancelled" };
          break outer;
        }
        const updatedTarget = await this.encounterService.getParticipant(tid);
        subAttacks.push({
          subActionName: sub.actionName,
          targetParticipantId: tid,
          attackRoll: res.value.attackRoll,
          damageRoll: res.value.damageRoll,
          targetHpBefore: res.value.targetHpBefore,
          targetHpAfter: res.value.targetHpAfter,
          targetDefeated: res.value.targetDefeated,
          targetDyingState: updatedTarget.dyingState,
          concentrationBroken: res.value.concentrationBroken,
        });
        allEvents.push(...res.events);

        if (res.value.targetDefeated && targetIdx < expectedTargets) {
          interruptedAt = { index: targetIdx - 1, reason: "target_defeated" };
          break outer;
        }
      }
    }

    // Cada subataque pode persistir mudanças no atacante (por exemplo,
    // consumir "vantagem no próximo ataque"). Não salve a instância antiga
    // carregada antes da sequência, pois isso ressuscita efeitos consumidos.
    attacker.actionUsed = true;
    await this.participantRepo.update(attacker.id, { actionUsed: true });

    const lastDamagingSubAttack = [...subAttacks]
      .reverse()
      .find(
        (subAttack) =>
          subAttack.damageRoll &&
          subAttack.damageRoll.finalDamage > 0,
      );
    if (lastDamagingSubAttack) {
      allEvents.push(
        ...(await this.offerPostSequenceReaction(encounterId, {
          attackerParticipantId: attacker.id,
          targetParticipantId: lastDamagingSubAttack.targetParticipantId,
          incomingDamage:
            lastDamagingSubAttack.damageRoll?.finalDamage ?? 0,
          damageType: lastDamagingSubAttack.damageRoll?.type ?? "",
          targetHpBefore: lastDamagingSubAttack.targetHpBefore,
          targetHpAfter: lastDamagingSubAttack.targetHpAfter ?? 0,
          targetDefeated: lastDamagingSubAttack.targetDefeated,
          ownerUserId: dto.ownerUserId,
          isMeleeAttack: true,
        })),
      );
    }

    allEvents.push({
      event_type: "multiattack_end",
      actor_participant_id: attacker.id,
      data: { subAttackCount: subAttacks.length, interruptedAt },
    });

    await this.eventService.emit(encounter.sessionId, encounterId, allEvents);

    await this.maybeAutoEndAfterDefeat(
      encounterId,
      subAttacks.some((s) => s.targetDefeated),
    );

    return success(
      { kind: "multiattack", actionConsumed: true, subAttacks, interruptedAt },
      allEvents,
    );
  }

  async offerPostSequenceReaction(
    encounterId: string,
    input: {
      attackerParticipantId: string;
      targetParticipantId: string;
      incomingDamage: number;
      damageType: string;
      targetHpBefore?: number;
      targetHpAfter: number;
      targetDefeated?: boolean;
      ownerUserId: string;
      actionName?: string;
      isMeleeAttack?: boolean;
      emitEvents?: boolean;
    },
  ): Promise<GameEventData[]> {
    if (input.incomingDamage <= 0) return [];

    const [encounter, attacker, reactionTarget] = await Promise.all([
      input.emitEvents
        ? this.encounterRepo.findOne({ where: { id: encounterId } })
        : Promise.resolve(null),
      this.encounterService.getParticipant(input.attackerParticipantId),
      this.encounterService.getParticipant(input.targetParticipantId),
    ]);
    if (reactionTarget.type !== "pc" || !reactionTarget.characterId) return [];
    if (
      (reactionTarget.effectInstances ?? []).some(
        (effect) =>
          effect.kind === "deflect_attacks_pending" ||
          effect.kind === "uncanny_dodge_pending",
      )
    ) {
      return [];
    }

    const incomingDamage = Math.max(0, input.incomingDamage);
    const hpAfter = Math.max(0, input.targetHpAfter);
    const hpBefore = Math.max(
      0,
      input.targetHpBefore ?? hpAfter + incomingDamage,
    );
    if (hpBefore <= 0) return [];
    const eligibilityTarget =
      reactionTarget.dyingState === "dying" ||
      reactionTarget.dyingState === "dead"
        ? Object.assign(
            Object.create(Object.getPrototypeOf(reactionTarget)),
            reactionTarget,
            { dyingState: "none", isDefeated: false },
          )
        : reactionTarget;
    const triggerEventId = randomUUID();
    const events: GameEventData[] = [];
    const monsterAction = (
      ((attacker.monster as { actions?: Array<{ name?: string; desc?: string }> })
        ?.actions ?? [])
    ).find(
      (action) =>
        this.slugifyName(action.name ?? "") ===
        this.slugifyName(input.actionName ?? ""),
    );
    const isMeleeAttack =
      input.isMeleeAttack ??
      !/\branged\b/i.test(monsterAction?.desc ?? "");
    const deflectOpp =
      await this.reactionOpportunity.shouldOfferDeflectAttacks(
        eligibilityTarget,
        input.damageType,
        input.ownerUserId,
      );

    if (deflectOpp) {
      await this.effectInstances.addEffect(reactionTarget, {
        kind: "deflect_attacks_pending",
        sourceFeatureSlug: "deflect-attacks",
        sourceCasterParticipantId: reactionTarget.id,
        payload: {
          triggerEventId,
          attackerParticipantId: attacker.id,
          turnParticipantIdAtTrigger: attacker.id,
          incomingDamage,
          damageType: input.damageType,
          hpBefore,
          hpAfter,
          isMeleeAttack,
          minimumReduction:
            1 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
          maximumReduction:
            10 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
          focusRemaining: deflectOpp.focusRemaining,
        },
        expiresAt: { kind: "until_consumed" },
        requiresConcentration: false,
      });
      events.push({
        event_type: "deflect_attacks_opportunity",
        actor_participant_id: attacker.id,
        target_participant_id: reactionTarget.id,
        data: {
          triggerEventId,
          attackerParticipantId: attacker.id,
          attackerName: attacker.displayName,
          reactorName: deflectOpp.reactorName,
          incomingDamage,
          damageType: input.damageType,
          minimumReduction:
            1 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
          maximumReduction:
            10 + deflectOpp.dexterityModifier + deflectOpp.monkLevel,
          focusRemaining: deflectOpp.focusRemaining,
          isMeleeAttack,
          timeoutSeconds: 20,
        },
      });
    } else {
      const uncannyDodgeOpp =
        await this.reactionOpportunity.shouldOfferUncannyDodge(
          eligibilityTarget,
          input.ownerUserId,
        );
      if (uncannyDodgeOpp) {
        await this.effectInstances.addEffect(reactionTarget, {
          kind: "uncanny_dodge_pending",
          sourceFeatureSlug: "uncanny-dodge",
          sourceCasterParticipantId: reactionTarget.id,
          payload: {
            triggerEventId,
            attackerParticipantId: attacker.id,
            turnParticipantIdAtTrigger: attacker.id,
            incomingDamage,
            damageType: input.damageType,
            hpBefore,
            hpAfter,
          },
          expiresAt: { kind: "until_consumed" },
          requiresConcentration: false,
        });
        events.push({
          event_type: "uncanny_dodge_opportunity",
          actor_participant_id: attacker.id,
          target_participant_id: reactionTarget.id,
          data: {
            triggerEventId,
            attackerParticipantId: attacker.id,
            attackerName: attacker.displayName,
            reactorName: uncannyDodgeOpp.reactorName,
            incomingDamage,
            damageAfter: Math.floor(incomingDamage / 2),
            damageType: input.damageType,
            timeoutSeconds: 20,
          },
        });
      }
    }

    if (input.emitEvents && encounter && events.length > 0) {
      await this.eventService.emit(
        encounter.sessionId,
        encounterId,
        events,
      );
    }
    return events;
  }



  async applyDamage(
    encounterId: string,
    dto: DamageDto,
    options?: { emitEvents?: boolean },
  ): Promise<
    GameResult<{
      hpAfter: number;
      damageApplied: number;
      resisted: boolean;
      immune: boolean;
      vulnerable: boolean;
      defeated: boolean;
      dyingState?: "none" | "dying" | "stable" | "dead";
      instantDeath?: boolean;
    }>
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );
    const resolvedOwnerUserId = await this.resolveParticipantOwner(
      target,
      dto.ownerUserId,
    );

    let hpAfter: number;
    let defeated: boolean;
    let dyingState: "none" | "dying" | "stable" | "dead" | undefined;
    let instantDeath = false;
    const events: GameEventData[] = [];
    const adjustedDamage = await this.resolveDamageAdjustments(
      target,
      dto.amount,
      dto.damageType,
      resolvedOwnerUserId,
    );
    const finalDamage = adjustedDamage.finalDamage;

    if (target.type === "pc" && target.characterId) {
      const wasDying = target.dyingState === "dying";



      if (wasDying && finalDamage > 0) {
        const failuresDelta = dto.fromCriticalHit ? 2 : 1;
        const ds = await this.stateService.updateDeathSaves(
          resolvedOwnerUserId,
          target.characterId,
          { failuresDelta },
        );
        hpAfter = 0;
        if (ds.dead) {
          target.dyingState = "dead";
          target.isDefeated = true;
          dyingState = "dead";
          defeated = true;
          events.push({
            event_type: "death_save_failed_from_damage",
            target_participant_id: target.id,
            data: {
              failuresAdded: failuresDelta,
              failures: ds.failures,
              dyingState: "dead",
            },
          });
        } else {
          dyingState = "dying";
          defeated = false;
          events.push({
            event_type: "death_save_failed_from_damage",
            target_participant_id: target.id,
            data: {
              failuresAdded: failuresDelta,
              failures: ds.failures,
              dyingState: "dying",
            },
          });
        }
        await this.participantRepo.save(target);
      } else if (wasDying) {
        hpAfter = 0;
        dyingState = "dying";
        defeated = false;
      } else {


        let formAbsorbed = 0;
        let formReverted = false;
        let usesOriginalHp = false;
        let overflowAmount = 0;
        let isDown = false;
        hpAfter = 0;
        if (target.transformationState) {
          const formRes = await this.transformation.applyDamageToForm(
            target.id,
            finalDamage,
          );
          formAbsorbed = formRes.absorbedByForm;
          formReverted = formRes.reverted;
          usesOriginalHp = formRes.usesOriginalHp === true;
          overflowAmount = formRes.overflowToOriginal;
          if (usesOriginalHp) {
            const result = await this.stateService.updateHp(
              resolvedOwnerUserId,
              target.characterId,
              { damage: finalDamage },
            );
            hpAfter = result.currentHp;
            instantDeath = result.instantDeath;
            isDown = result.isDown;
            events.push({
              event_type: "wild_shape_damage_applied",
              target_participant_id: target.id,
              data: {
                damage: finalDamage,
                hpAfter,
                tempHpAfter: result.tempHp,
                formName: target.transformationState.form.formName,
              },
            });
          } else if (!formReverted) {

            const formHpAfter = Math.max(
              0,
              target.transformationState.form.currentHp - formAbsorbed,
            );
            hpAfter = formHpAfter;
            instantDeath = false;
            events.push({
              event_type: "form_damage_absorbed",
              target_participant_id: target.id,
              data: {
                absorbedByForm: formAbsorbed,
                formHpAfter,
                formName: target.transformationState.form.formName,
              },
            });
          }
        }
        if ((!target.transformationState || formReverted) && !usesOriginalHp) {


          const effectiveDamage = formReverted ? 0 : finalDamage;
          const result = await this.stateService.updateHp(
            resolvedOwnerUserId,
            target.characterId,
            { damage: effectiveDamage },
          );
          hpAfter = result.currentHp;
          instantDeath = result.instantDeath;
          isDown = result.isDown;
          if (formReverted) {
            events.push({
              event_type: "transformation_reverted",
              target_participant_id: target.id,
              data: {
                reason: "form-hp-zero",
                absorbedByForm: formAbsorbed,
                overflowDamageToCaster: overflowAmount,
                hpAfter,
              },
            });
          }
        }

        if (instantDeath) {
          target.dyingState = "dead";
          target.isDefeated = true;
          dyingState = "dead";
          defeated = true;
          events.push({
            event_type: "instant_death",
            target_participant_id: target.id,
            data: { damage: finalDamage, dyingState: "dead" },
          });
          await this.participantRepo.save(target);
        } else if (isDown) {
          target.dyingState = "dying";
          target.isDefeated = false;
          dyingState = "dying";
          defeated = false;
          events.push({
            event_type: "fell_unconscious",
            target_participant_id: target.id,
            data: { dyingState: "dying" },
          });
          await this.participantRepo.save(target);
        } else {
          dyingState = target.dyingState;
          defeated = false;
        }
      }
    } else {
      const result = this.applyDamageToMonster(target, finalDamage);
      const survivalEvent = this.applyUndeadFortitude(
        target,
        finalDamage,
        dto.damageType,
        false,
      );
      if (survivalEvent) events.push(survivalEvent);
      hpAfter = target.currentHp ?? result.hpAfter;
      defeated = target.isDefeated;
      await this.participantRepo.save(target);
    }

    events.unshift({
      event_type: "hp_change",
      target_participant_id: target.id,
      data: {
        damage: dto.amount,
        type: dto.damageType,
        finalDamage,
        resisted: adjustedDamage.resisted,
        immune: adjustedDamage.immune,
        vulnerable: adjustedDamage.vulnerable,
        hpAfter,
        defeated,
        dyingState,
      },
    });

    if (finalDamage > 0) {
      events.push(
        ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
          target,
        )),
      );
    }

    if (target.isConcentrating && finalDamage > 0 && !defeated) {
      const dc = Math.max(10, Math.floor(finalDamage / 2));

      let conMod = 0;
      if (target.type === "pc" && target.characterId) {
        try {
          const sheet = await this.sheetService.computeSheet(
            resolvedOwnerUserId,
            target.characterId,
          );
          const conBlock = (sheet.abilityScores ?? []).find(
            (a: any) => a.slug === "con" || a.slug === "constitution",
          );
          conMod = conBlock?.modifier ?? 0;
        } catch {

        }
      } else if (target.type === "monster") {
        const conScore = (target.monster as any)?.stats?.con ?? 10;
        conMod = Math.floor((conScore - 10) / 2);
      }
      const roll = this.diceService.roll(20);
      const total = roll + conMod;
      const success = total >= dc;
      events.push({
        event_type: "concentration_check",
        target_participant_id: target.id,
        data: {
          dc,
          rolled: roll,
          modifier: conMod,
          total,
          success,
          spellName: target.concentratingOn,
        },
      });
      if (!success) {
        const breakRes = await this.concentration.break(target, "damage");
        events.push(...breakRes.events);
      }
    } else if (target.isConcentrating && defeated) {

      const breakRes = await this.concentration.breakDueToDeath(target);
      events.push(...breakRes.events);
    }

    if (defeated) {
      if (
        typeof this.persistentArea.releaseConjureElementalTarget ===
        "function"
      ) {
        const released =
          await this.persistentArea.releaseConjureElementalTarget(
            target,
            "target_defeated",
          );
        events.push(...released.events);
      }
      await this.removeDefeatedSummon(encounter, target, events, "hp-zero");
      const tetherCasters = await this.participantRepo.find({
        where: { encounterId, isDefeated: false },
      });
      for (const caster of tetherCasters) {
        const tether = findWitchBoltTether(caster);
        if (!tether || tether.targetParticipantId !== target.id) continue;
        const breakResult = await this.concentration.break(caster, "expired");
        events.push({
          event_type: "witch_bolt_ended",
          actor_participant_id: caster.id,
          target_participant_id: target.id,
          data: { reason: "target_defeated" },
        });
        events.push(...breakResult.events);
      }
    }

    if (options?.emitEvents !== false) {
      await this.eventService.emit(encounter.sessionId, encounterId, events);
    }

    await this.maybeAutoEndAfterDefeat(encounterId, defeated);

    return success(
      {
        hpAfter,
        damageApplied: finalDamage,
        resisted: adjustedDamage.resisted,
        immune: adjustedDamage.immune,
        vulnerable: adjustedDamage.vulnerable,
        defeated,
        dyingState,
        instantDeath,
      },
      events,
    );
  }

  private async throwTargetInRandomDirection(
    encounter: EncounterEntity,
    target: EncounterParticipantEntity,
    maximumDistanceFt: number,
    events: GameEventData[],
  ): Promise<
    | {
        from: { x: number; y: number };
        to: { x: number; y: number };
        distanceFt: number;
      }
    | undefined
  > {
    if (target.positionX == null || target.positionY == null) return undefined;
    const directions = [
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
    ];
    const direction = directions[this.diceService.roll(8) - 1];
    const bounds = {
      cols:
        encounter.mapData?.gridColumns ??
        encounter.mapData?.gridSize ??
        20,
      rows:
        encounter.mapData?.gridRows ??
        encounter.mapData?.gridSize ??
        20,
    };
    const participants = await this.participantRepo.find({
      where: { encounterId: encounter.id },
    });
    const occupied = new Set(
      participants
        .filter(
          (participant) =>
            participant.id !== target.id &&
            !participant.isDefeated &&
            participant.positionX != null &&
            participant.positionY != null,
        )
        .map(
          (participant) =>
            `${participant.positionX as number},${participant.positionY as number}`,
        ),
    );
    const from = { x: target.positionX, y: target.positionY };
    let to = from;
    const maximumCells = Math.max(1, Math.floor(maximumDistanceFt / 5));
    for (let step = 1; step <= maximumCells; step += 1) {
      const candidate = {
        x: from.x + direction.x * step,
        y: from.y + direction.y * step,
      };
      if (
        candidate.x < 0 ||
        candidate.x >= bounds.cols ||
        candidate.y < 0 ||
        candidate.y >= bounds.rows ||
        occupied.has(`${candidate.x},${candidate.y}`)
      ) {
        break;
      }
      to = candidate;
    }
    if (to.x === from.x && to.y === from.y) {
      return { from, to, distanceFt: 0 };
    }
    target.positionX = to.x;
    target.positionY = to.y;
    await this.participantRepo.update(target.id, {
      positionX: to.x,
      positionY: to.y,
    });
    const persistedTarget =
      (await this.participantRepo.findOne({ where: { id: target.id } })) ??
      target;
    persistedTarget.positionX = to.x;
    persistedTarget.positionY = to.y;
    const locationBoundConditionEvents =
      await this.persistentArea.removeLocationBoundConditionsOutsideAreas(
        persistedTarget,
        to,
      );
    target.conditions = persistedTarget.conditions;
    target.conditionInstances = persistedTarget.conditionInstances;
    events.push(...locationBoundConditionEvents);
    await this.persistentArea.relocateAurasByCaster(target.id, to);
    return {
      from,
      to,
      distanceFt: Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 5,
    };
  }

  async applyPersistentAreaDamageEvents(
    encounterId: string,
    sourceEvents: GameEventData[],
    requesterUserId: string,
  ): Promise<GameEventData[]> {
    const appliedEvents: GameEventData[] = [];
    for (const event of sourceEvents) {
      if (
        event.event_type !== "tile_effect_damage_applied" &&
        event.event_type !== "persistent_area_tick"
      ) {
        continue;
      }
      const targetParticipantId = event.target_participant_id;
      const rolledAmount = Number(event.data?.amount ?? 0);
      const damageType = String(
        event.data?.type ?? event.data?.damageType ?? "",
      );
      if (!targetParticipantId || rolledAmount <= 0 || !damageType) continue;

      const damageResult = await this.applyDamage(
        encounterId,
        {
          targetParticipantId,
          amount: rolledAmount,
          damageType,
          ownerUserId: requesterUserId,
        },
        { emitEvents: false },
      );
      if (!damageResult.ok) {
        event.data.damageApplicationError = damageResult.error;
        continue;
      }

      const target = await this.encounterService
        .getParticipant(targetParticipantId)
        .catch(() => null);
      Object.assign(event.data, {
        rolledAmount,
        amount: damageResult.value.damageApplied,
        finalDamage: damageResult.value.damageApplied,
        hpAfter: damageResult.value.hpAfter,
        resisted: damageResult.value.resisted,
        immune: damageResult.value.immune,
        vulnerable: damageResult.value.vulnerable,
        defeated: damageResult.value.defeated,
        positionX: target?.positionX,
        positionY: target?.positionY,
      });
      appliedEvents.push(...damageResult.events);
      if (
        event.data?.effectKind === "guardian-of-faith" &&
        typeof event.data?.areaId === "string"
      ) {
        appliedEvents.push(
          ...(await this.persistentArea.recordGuardianOfFaithDamage(
            event.data.areaId,
            damageResult.value.damageApplied,
            targetParticipantId,
          )),
        );
      }
    }
    return appliedEvents;
  }

  private async getEndOfTurnSaveModifier(
    participant: EncounterParticipantEntity,
    ability: SaveAbility,
  ): Promise<{
    modifier: number;
    advantage: boolean;
    disadvantage: boolean;
  }> {
    const conditionModifiers = this.conditionEffects.getSavingThrowModifiers(
      participant.conditions ?? [],
      ability,
    );
    let modifier = 0;

    if (participant.type === "pc" && participant.characterId) {
      const ownerId = await this.resolveParticipantOwner(participant, "");
      const sheet = await this.sheetService.computeSheet(
        ownerId,
        participant.characterId,
      );
      modifier =
        sheet.savingThrows.find((save) => save.slug === ability)?.bonus ?? 0;
    } else if (participant.type === "monster") {
      const hydratedParticipant = participant.monster
        ? participant
        : await this.encounterService
            .getParticipant(participant.id)
            .catch(() => participant);
      if (hydratedParticipant.monster) {
        modifier = getMonsterSavingThrowBonus(
          hydratedParticipant.monster as unknown as Record<string, unknown>,
          ability,
        );
      }
    }

    for (const effect of participant.effectInstances ?? []) {
      if (effect.kind !== "save_bonus" && effect.kind !== "save_penalty") {
        continue;
      }
      const scope = effect.payload?.scope;
      if (scope?.endsWith("-save") && !scope.startsWith(ability)) continue;
      const sign = effect.kind === "save_penalty" ? -1 : 1;
      modifier += sign * (effect.payload?.amount ?? 0);
      if (effect.payload?.diceExpression) {
        modifier +=
          sign *
          this.diceService.rollExpression(effect.payload.diceExpression).total;
      }
    }

    return {
      modifier,
      advantage:
        conditionModifiers.hasAdvantage ||
        hasHasteDexSaveAdvantage(participant, ability) ||
        hasBeaconWisdomSaveAdvantage(participant, ability),
      disadvantage: conditionModifiers.hasDisadvantage,
    };
  }

  async applyHealing(
    encounterId: string,
    dto: HealDto,
  ): Promise<
    GameResult<{
      hpAfter: number;
      healingApplied: number;
      healingPrevented: boolean;
      healingMaximized: boolean;
      defeated: boolean;
      dyingState?: "none" | "dying" | "stable" | "dead";
      deathSavesReset?: boolean;
    }>
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );
    const healingResolution = beaconHealingAmount(
      target,
      dto.amount,
      dto.maximumAmount,
    );
    const healingAmount = healingResolution.amount;

    let hpAfter: number;
    let deathSavesReset = false;
    let dyingState: "none" | "dying" | "stable" | "dead" | undefined;
    let defeated = false;




    const prevHp =
      target.type === "pc" &&
      target.characterId &&
      typeof this.stateService.getCurrentHp === "function"
        ? ((await this.stateService.getCurrentHp(target.characterId)) ?? 0)
        : (target.currentHp ?? 0);

    if (
      (target.effectInstances ?? []).some(
        (effect) => effect.kind === "healing_blocked",
      )
    ) {
      const events: GameEventData[] = [
        {
          event_type: "healing_prevented",
          target_participant_id: target.id,
          data: {
            attemptedHealing: dto.amount,
            maximumHealing: dto.maximumAmount,
            hpAfter: prevHp,
            sourceSpell: "chill-touch",
          },
        },
      ];
      await this.eventService.emit(encounter.sessionId, encounterId, events);
      return success(
        {
          hpAfter: prevHp,
          healingApplied: 0,
          healingPrevented: true,
          healingMaximized: false,
          defeated: target.isDefeated,
          dyingState: target.dyingState,
        },
        events,
      );
    }

    if (target.type === "pc" && target.characterId) {
      const wasDyingOrStable =
        target.dyingState === "dying" || target.dyingState === "stable";
      const isDead = target.dyingState === "dead";

      if (isDead) {
        return failure("Este participante ja esta morto.", "ALREADY_DEAD");
      }

      const result = await this.stateService.updateHp(
        dto.ownerUserId,
        target.characterId,
        { healing: healingAmount },
      );
      hpAfter = result.currentHp;

      if (wasDyingOrStable && result.currentHp > 0) {
        target.dyingState = "none";
        target.isDefeated = false;
        dyingState = "none";
        deathSavesReset = true;
        await this.participantRepo.save(target);
      } else {
        dyingState = target.dyingState;
      }
    } else {
      target.currentHp = Math.min(
        (target.currentHp ?? 0) + healingAmount,
        target.maxHp ?? 0,
      );
      if (target.currentHp > 0 && target.isDefeated) {
        target.isDefeated = false;
      }
      hpAfter = target.currentHp;
      defeated = target.isDefeated;
      await this.participantRepo.save(target);
    }

    const healingApplied = Math.max(0, hpAfter - prevHp);
    const events: GameEventData[] = [
      ...(healingResolution.maximized
        ? [
            {
              event_type: "healing_maximized_by_beacon_of_hope",
              target_participant_id: target.id,
              data: {
                sourceSpell: dto.sourceSpellSlug,
                rolledHealing: dto.amount,
                maximumHealing: healingAmount,
                healingApplied,
              },
            } as GameEventData,
          ]
        : []),
      {
        event_type: "hp_change",
        target_participant_id: target.id,
        data: {
          healing: healingApplied,
          healingRequested: healingAmount,
          healingRolled: dto.amount,
          healingMaximized: healingResolution.maximized,
          sourceSpell: dto.sourceSpellSlug,
          hpAfter,
          dyingState,
          deathSavesReset,
        },
      },
    ];




    if (typeof this.conditionLifecycle.revalidateAfterHpChange === "function") {
      const revalidation =
        await this.conditionLifecycle.revalidateAfterHpChange(
          target,
          prevHp,
          hpAfter,
        );
      events.push(...revalidation.events);
    }

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success(
      {
        hpAfter,
        healingApplied,
        healingPrevented: false,
        healingMaximized: healingResolution.maximized,
        defeated,
        dyingState,
        deathSavesReset,
      },
      events,
    );
  }




  async applyCondition(
    encounterId: string,
    dto: ConditionDto,
  ): Promise<GameResult<{ conditions: string[] }>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");

    const participant = await this.encounterService.getParticipant(
      dto.participantId,
    );

    const slug = dto.condition as ConditionSlug;
    const events: GameEventData[] = [];

    if (dto.apply) {

      const alreadyHas = (participant.conditionInstances ?? []).some(
        (ci) => ci.slug === slug,
      );
      if (!alreadyHas) {
        const res = await this.conditionLifecycle.applyCondition(participant, {
          slug,
          appliedBy: null,
          sourceSpell: null,
          durationRoundsRemaining: dto.durationRoundsRemaining,
        });
        events.push(...res.events);
      }
    } else {

      const match = (participant.conditionInstances ?? [])
        .filter((ci) => ci.slug === slug)
        .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0];
      if (match) {
        const res = await this.conditionLifecycle.removeConditionInstance(
          participant,
          match.id,
          "manual_remove",
        );
        events.push(...res.events);
      }
    }


    const refreshed = await this.encounterService.getParticipant(
      dto.participantId,
    );
    const conditions = refreshed.conditions;


    if (refreshed.type === "pc" && refreshed.characterId) {
      await this.stateService.updateConditions(
        dto.ownerUserId,
        refreshed.characterId,
        { conditions },
      );
    }

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success({ conditions }, events);
  }



  async resolveDeathSave(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<DeathSaveResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter)
      return failure("Encontro nao encontrado.", "ENCOUNTER_NOT_FOUND");

    const participant =
      await this.encounterService.getParticipant(participantId);

    if (participant.type !== "pc" || !participant.characterId) {
      return failure("Death saves so se aplicam a PCs.", "INVALID_PARTICIPANT");
    }

    if (participant.dyingState !== "dying") {
      return failure("NOT_DYING");
    }

    const beaconAdvantage = hasBeaconOfHope(participant);
    const advantage = beaconAdvantage
      ? this.diceService.rollWithAdvantage()
      : undefined;
    const roll = advantage?.chosen ?? this.diceService.roll(20);
    const naturalOne = roll === 1;
    const naturalTwenty = roll === 20;

    const dsResult = await this.stateService.updateDeathSaves(
      ownerUserId,
      participant.characterId,
      { rollValue: roll },
    );

    let dyingState: "none" | "dying" | "stable" | "dead" = "dying";
    let revivedHp: number | null = null;

    if (dsResult.revivedHp) {
      dyingState = "none";
      revivedHp = dsResult.revivedHp;
    } else if (dsResult.dead) {
      dyingState = "dead";
    } else if (dsResult.stabilized) {
      dyingState = "stable";
    }

    participant.dyingState = dyingState;
    participant.isDefeated = dyingState === "dead";
    await this.participantRepo.save(participant);

    const result: DeathSaveResult = {
      roll,
      advantage,
      hasAdvantage: beaconAdvantage,
      naturalOne,
      naturalTwenty,
      successes: dsResult.successes,
      failures: dsResult.failures,
      dyingState,
      stabilized: dyingState === "stable",
      dead: dyingState === "dead",
      revivedHp,
    };

    const events: GameEventData[] = [
      {
        event_type: "death_save",
        actor_participant_id: participantId,
        data: {
          ...result,
          sourceSpell: beaconAdvantage ? "beacon-of-hope" : undefined,
        },
      },
    ];

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success(result, events);
  }



  private async maybeOfferGiantAncestryOnHit(
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    ownerUserId: string,
    events: GameEventData[],
  ): Promise<GiantAncestryChoice | null> {
    const ancestry = await this.getAvailableGiantAncestry(
      attacker,
      ownerUserId,
    );
    if (
      !ancestry ||
      !["fires-burn", "frosts-chill", "hills-tumble"].includes(
        ancestry.choice,
      )
    ) {
      return null;
    }
    if (
      ancestry.choice === "hills-tumble" &&
      !this.isLargeOrSmallerForGiantAncestry(target)
    ) {
      return null;
    }

    for (const stale of (attacker.effectInstances ?? []).filter(
      (effect) => effect.kind === "giant_ancestry_hit_pending",
    )) {
      await this.effectInstances.removeEffect(attacker, stale.id, "manual");
    }
    await this.effectInstances.addEffect(attacker, {
      kind: "giant_ancestry_hit_pending",
      sourceFeatureSlug: ancestry.choice,
      sourceCasterParticipantId: attacker.id,
      payload: {
        requiredTargetId: target.id,
        usesRemaining: ancestry.usesRemaining,
        usesMax: ancestry.usesMax,
      },
      expiresAt: { kind: "caster_turn_ends", value: 1 },
      requiresConcentration: false,
    });
    events.push({
      event_type: "giant_ancestry_available",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        featureSlug: ancestry.choice,
        featureName: GIANT_ANCESTRY_DISPLAY_NAMES[ancestry.choice],
        targetParticipantId: target.id,
        targetName: target.displayName,
        usesRemaining: ancestry.usesRemaining,
        usesMax: ancestry.usesMax,
      },
    });
    return ancestry.choice;
  }

  private async maybeOfferDruidHitRiders(
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    ownerUserId: string,
    attack: {
      weaponOrWildShape: boolean;
      wildShape: boolean;
      critical: boolean;
    },
    events: GameEventData[],
  ): Promise<boolean> {
    if (
      attacker.type !== "pc" ||
      !attacker.characterId ||
      !attack.weaponOrWildShape
    ) {
      return false;
    }
    if (
      (attacker.effectInstances ?? []).some(
        (effect) => effect.kind === "druid_hit_rider_pending",
      )
    ) {
      return false;
    }

    try {
      const resolvedOwnerId = await this.resolveParticipantOwner(
        attacker,
        ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        resolvedOwnerId,
        attacker.characterId,
      );
      const druidLevel =
        sheet.classes.find(
          (characterClass) =>
            characterClass.slug.replace(/-phb$|-xphb$/, "") === "druid",
        )?.level ?? 0;
      if (druidLevel < 7) return false;

      const activeFeatures = sheet.features.filter(
        (feature) => feature.active !== false,
      );
      const hasPrimalStrike =
        activeFeatures.some((feature) =>
          feature.slug.startsWith("primal-strike-"),
        ) &&
        !(attacker.effectInstances ?? []).some(
          (effect) => effect.kind === "primal_strike_used_this_turn",
        );
      const hasLunarRadiance =
        attack.wildShape &&
        activeFeatures.some((feature) =>
          feature.slug.startsWith("lunar-form-druid-moon-"),
        ) &&
        !(attacker.effectInstances ?? []).some(
          (effect) => effect.kind === "lunar_radiance_used_this_turn",
        );
      if (!hasPrimalStrike && !hasLunarRadiance) return false;

      const primalStrikeDice = druidLevel >= 15 ? "2d8" : "1d8";
      await this.effectInstances.addEffect(attacker, {
        kind: "druid_hit_rider_pending",
        sourceFeatureSlug: "druid-hit-riders",
        sourceCasterParticipantId: attacker.id,
        payload: {
          requiredTargetId: target.id,
          hitWasCritical: attack.critical,
          damageTypes: hasPrimalStrike
            ? ["cold", "fire", "lightning", "thunder"]
            : [],
          diceExpression: primalStrikeDice,
          primalStrikeAvailable: hasPrimalStrike,
          lunarRadianceAvailable: hasLunarRadiance,
          lunarRadianceDice: "2d10",
        },
        expiresAt: { kind: "caster_turn_ends", value: 1 },
        requiresConcentration: false,
      });
      events.push({
        event_type: "druid_hit_riders_available",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          targetParticipantId: target.id,
          targetName: target.displayName,
          critical: attack.critical,
          primalStrikeAvailable: hasPrimalStrike,
          primalStrikeDice,
          primalStrikeDamageTypes: hasPrimalStrike
            ? ["cold", "fire", "lightning", "thunder"]
            : [],
          lunarRadianceAvailable: hasLunarRadiance,
          lunarRadianceDice: "2d10",
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async maybeOfferGiantAncestryReaction(
    encounter: EncounterEntity,
    attacker: EncounterParticipantEntity,
    target: EncounterParticipantEntity,
    ownerUserId: string,
    triggerEventId: string,
    hpBefore: number,
    hpAfter: number,
    tempHpBefore: number,
    incomingDamage: number,
    damageType: string,
    events: GameEventData[],
  ): Promise<boolean> {
    if (
      target.reactionsUsed > 0 ||
      !canTakeReactionFromConditions(target.conditions)
    ) {
      return false;
    }
    const ancestry = await this.getAvailableGiantAncestry(
      target,
      ownerUserId,
    );
    if (
      !ancestry ||
      !["stones-endurance", "storms-thunder"].includes(ancestry.choice)
    ) {
      return false;
    }
    const targetPosition = this.positionOf(target);
    const attackerPosition = this.positionOf(attacker);
    const distanceFt =
      targetPosition && attackerPosition
        ? chebyshevDistanceFt(targetPosition, attackerPosition)
        : Number.POSITIVE_INFINITY;
    if (
      ancestry.choice === "storms-thunder" &&
      (!Number.isFinite(distanceFt) || distanceFt > 60)
    ) {
      return false;
    }

    for (const stale of (target.effectInstances ?? []).filter(
      (effect) => effect.kind === "giant_ancestry_reaction_pending",
    )) {
      await this.effectInstances.removeEffect(target, stale.id, "manual");
    }
    await this.effectInstances.addEffect(target, {
      kind: "giant_ancestry_reaction_pending",
      sourceFeatureSlug: ancestry.choice,
      sourceCasterParticipantId: target.id,
      payload: {
        triggerEventId,
        attackerParticipantId: attacker.id,
        turnParticipantIdAtTrigger:
          encounter.turnOrder[encounter.currentTurnIndex],
        incomingDamage,
        damageType,
        hpBefore,
        hpAfter,
        tempHpBefore,
        usesRemaining: ancestry.usesRemaining,
        usesMax: ancestry.usesMax,
      },
      expiresAt: { kind: "until_consumed" },
      requiresConcentration: false,
    });
    events.push({
      event_type: "giant_ancestry_reaction_opportunity",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        featureSlug: ancestry.choice,
        featureName: GIANT_ANCESTRY_DISPLAY_NAMES[ancestry.choice],
        triggerEventId,
        attackerParticipantId: attacker.id,
        attackerName: attacker.displayName,
        reactorName: target.displayName,
        incomingDamage,
        damageType,
        distanceFt,
        constitutionModifier:
          ancestry.choice === "stones-endurance"
            ? ancestry.constitutionModifier
            : undefined,
        usesRemaining: ancestry.usesRemaining,
        usesMax: ancestry.usesMax,
        timeoutSeconds: 20,
      },
    });
    return true;
  }

  private async getAvailableGiantAncestry(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<{
    choice: GiantAncestryChoice;
    usesRemaining: number;
    usesMax: number;
    constitutionModifier: number;
  } | null> {
    if (participant.type !== "pc" || !participant.characterId) return null;
    try {
      const resolvedOwnerId = await this.resolveParticipantOwner(
        participant,
        ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        resolvedOwnerId,
        participant.characterId,
      );
      if (sheet.race?.slug !== "goliath") return null;
      const choice = findGiantAncestryChoice(
        sheet.originDetails?.raceTraitChoices,
      );
      if (!choice) return null;
      const usesMax = sheet.proficiencyBonus ?? 2;
      const used = (
        await this.stateService.getFeatureUsesUsed(participant.characterId)
      )["giant-ancestry"] ?? 0;
      if (used >= usesMax) return null;
      const constitutionModifier =
        sheet.abilityScores.find((ability) => ability.slug === "con")
          ?.modifier ?? 0;
      return {
        choice,
        usesRemaining: usesMax - used,
        usesMax,
        constitutionModifier,
      };
    } catch {
      return null;
    }
  }

  private isLargeOrSmallerForGiantAncestry(
    target: EncounterParticipantEntity,
  ): boolean {
    const size = (target.effectInstances ?? []).some(
      (effect) =>
        effect.sourceFeatureSlug === "large-form" &&
        effect.payload?.size === "large",
    )
      ? "large"
      : String(target.monster?.size ?? "medium").toLowerCase();
    const order = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
    const index = order.indexOf(size);
    return index >= 0 && index <= order.indexOf("large");
  }

  private async resolveDamageAdjustments(
    target: EncounterParticipantEntity,
    amount: number,
    damageType?: string | null,
    ownerUserId?: string,
  ): Promise<{
    finalDamage: number;
    resisted: boolean;
    immune: boolean;
    vulnerable: boolean;
  }> {
    const typeKey = this.normalizeDamageType(damageType);
    let immune = false;
    let resisted = false;
    let vulnerable = false;

    if (typeKey) {
      const monster = target.monster;
      const summonStatBlock = getSummonStatBlock(target);
      const immunities = summonStatBlock
        ? summonStatBlock.damageImmunities
        : this.extractDamageList(monster?.damage_immunities);
      const resistances = summonStatBlock
        ? summonStatBlock.damageResistances
        : this.extractDamageList(monster?.damage_resistances);
      const vulnerabilities = this.extractDamageList(
        monster?.damage_vulnerabilities,
      );

      immune = immunities.some((entry) => this.damageTypeMatches(entry, typeKey));
      resisted = resistances.some((entry) =>
        this.damageTypeMatches(entry, typeKey),
      );
      vulnerable = vulnerabilities.some((entry) =>
        this.damageTypeMatches(entry, typeKey),
      );

      if (!immune && this.hasEffectResistance(target, typeKey)) {
        resisted = true;
      }

      if (
        !immune &&
        !resisted &&
        target.type === "pc" &&
        target.characterId &&
        ownerUserId
      ) {
        try {
          const resolvedOwnerId = await this.resolveParticipantOwner(
            target,
            ownerUserId,
          );
          const sheet = await this.sheetService.computeSheet(
            resolvedOwnerId,
            target.characterId,
          );
          resisted = getCharacterDamageResistances(sheet).some((entry) =>
            this.damageTypeMatches(entry, typeKey),
          );
        } catch {
          // A failed sheet lookup must not abort the originating damage event.
        }
      }
    }

    if (immune) {
      return { finalDamage: 0, resisted: false, immune: true, vulnerable: false };
    }
    if (resisted) {
      return {
        finalDamage: Math.floor(amount / 2),
        resisted: true,
        immune: false,
        vulnerable: false,
      };
    }
    if (vulnerable) {
      return {
        finalDamage: amount * 2,
        resisted: false,
        immune: false,
        vulnerable: true,
      };
    }
    return { finalDamage: amount, resisted: false, immune: false, vulnerable: false };
  }

  private hasEffectResistance(
    target: EncounterParticipantEntity,
    typeKey: string,
  ): boolean {
    return (target.effectInstances ?? []).some((effect) => {
      if (effect.kind !== "damage_resistance") return false;
      const damageTypes = Array.isArray(effect.payload?.damageTypes)
        ? effect.payload.damageTypes
        : [];
      if (damageTypes.length === 0) return true;
      return damageTypes.some((entry) => this.damageTypeMatches(entry, typeKey));
    });
  }

  private extractDamageList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof value === "string") return [value];
    return [];
  }

  private normalizeDamageType(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const normalized = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    return normalized.length > 0 ? normalized : null;
  }

  private damageTypeMatches(entry: string, typeKey: string): boolean {
    return this.normalizeDamageType(entry)?.includes(typeKey) ?? false;
  }

  private applyDamageToMonster(
    participant: EncounterParticipantEntity,
    amount: number,
  ): { hpAfter: number; defeated: boolean } {
    let remaining = amount;


    if (participant.tempHp > 0) {
      if (remaining <= participant.tempHp) {
        participant.tempHp -= remaining;
        remaining = 0;
      } else {
        remaining -= participant.tempHp;
        participant.tempHp = 0;
      }
    }

    participant.currentHp = Math.max(
      (participant.currentHp ?? 0) - remaining,
      0,
    );

    const defeated = participant.currentHp <= 0;
    if (defeated) {
      participant.isDefeated = true;
    }

    return { hpAfter: participant.currentHp, defeated };
  }

  private applyUndeadFortitude(
    participant: EncounterParticipantEntity,
    damageTaken: number,
    damageType: string | null | undefined,
    critical: boolean,
  ): GameEventData | null {
    if (
      !participant.isDefeated ||
      (participant.currentHp ?? 0) > 0 ||
      !participant.monster
    ) {
      return null;
    }

    const resolution = resolveUndeadFortitude({
      specialAbilities: participant.monster.special_abilities,
      constitutionScore: participant.monster.constitution,
      damageTaken,
      damageType,
      critical,
      roll: this.diceService.roll(20),
    });
    if (!resolution.attempted) return null;

    if (resolution.success) {
      participant.currentHp = 1;
      participant.isDefeated = false;
    }

    return {
      event_type: "undead_fortitude",
      target_participant_id: participant.id,
      data: {
        targetName: participant.displayName,
        damageTaken,
        damageType,
        dc: resolution.dc,
        roll: resolution.roll,
        modifier: resolution.modifier,
        total: resolution.total,
        success: resolution.success,
        hpAfter: participant.currentHp,
      },
    };
  }

  private async concentrationCheck(
    participant: EncounterParticipantEntity,
    damageTaken: number,
  ): Promise<ConcentrationCheckResult> {
    const dc = Math.max(10, Math.floor(damageTaken / 2));
    let conMod = 0;

    if (participant.type === "monster" && participant.monster) {
      conMod = getAbilityModifier(participant.monster.constitution);
    } else if (participant.type === "pc" && participant.characterId) {


      try {
        const ownerId = await this.resolveParticipantOwner(participant, "");
        if (ownerId) {
          const sheet = await this.sheetService.computeSheet(
            ownerId,
            participant.characterId,
          );
          const conSave = sheet.savingThrows?.find(
            (s: any) => s.slug === "con",
          );
          if (conSave) conMod = conSave.bonus;
        }
      } catch {

      }
    }

    const roll = this.diceService.roll(20);
    const total = roll + conMod;
    const maintained = total >= dc;
    const spellName = participant.concentratingOn ?? undefined;




    return {
      dc,
      roll,
      modifier: conMod,
      total,
      maintained,
      spellName,
    };
  }
}
