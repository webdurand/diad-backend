import { Inject, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { EffectInstanceService } from "./effect-instance.service";
import { DiceService } from "./dice.service";
import { TransformationService } from "./transformation.service";
import { BardFeaturesService } from "./bard-features.service";
import type { GameEventData } from "../interfaces/result.type";
import {
  getWildShapeUses,
  getWildShapeDurationRounds,
  getWildShapeMaxCr,
} from "src/shared/druid-rules";
import { SummoningService } from "./summoning.service";
import {
  buildOtherworldlySteedStatBlock,
  type SteedAppearance,
  type SteedCreatureType,
} from "./summon-stat-block";
import {
  applyEffectSpeedModifiers,
  reconcileRemainingMovement,
} from "./movement.service";
import { PersistentAreaService } from "./persistent-area.service";


export interface ClassFeatureInvokedPayload {
  featureSlug: string;
  encounterId?: string;
  actionCost?: string;
  targets?: string[];
  options?: Record<string, unknown>;
  saveDc?: number;
  saveAbility?: "str" | "dex" | "con" | "int" | "wis" | "cha";
  caster?: {
    abilityMods?: Record<string, number>;
    profBonus?: number;
    classSlug?: string;
    classLevel?: number;
    speed?: number;
    is2024Rules?: boolean;
    isMoonDruid?: boolean;
    currentHp?: number;
    maxHp?: number;
    spellSlots?: Array<{
      level: number;
      total: number;
      used: number;
      kind?: string;
    }>;
  };
  triggerEventId?: string;
  status?: string;
}


@Injectable()
export class ClassFeatureResolverService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStates: Repository<CharacterStateEntity>,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly effectInstances: EffectInstanceService,
    private readonly dice: DiceService,
    private readonly transformation: TransformationService,
    private readonly bard: BardFeaturesService,
    @Inject(SummoningService)
    private readonly summoning: SummoningService,
    @Inject(PersistentAreaService)
    private readonly persistentArea?: PersistentAreaService,
  ) {}

  async resolveInvocation(
    sourceParticipantId: string,
    payload: ClassFeatureInvokedPayload,
  ): Promise<{
    resolved: boolean;
    events: GameEventData[];
    resolutionPayload?: Record<string, unknown>;
  }> {
    const events: GameEventData[] = [];
    const slug = payload.featureSlug;

    switch (slug) {
      case "turn-undead":
        return this.handleTurnUndead(sourceParticipantId, payload, events);
      case "rage":
        return this.handleRage(sourceParticipantId, payload, events);
      case "grapple":
        return this.handleGrapple(sourceParticipantId, payload, events);
      case "shove":
        return this.handleShove(sourceParticipantId, payload, events);
      case "wild-shape":
        return this.handleWildShape(sourceParticipantId, payload, events);
      case "wild-companion":
        return this.handleWildCompanion(sourceParticipantId, payload, events);
      case "faithful-steed":
        return this.handleFaithfulSteed(sourceParticipantId, payload, events);
      case "wild-resurgence":
        return this.handleWildResurgence(sourceParticipantId, payload, events);
      case "large-form":
        return this.handleLargeForm(sourceParticipantId, payload, events);
      case "large-form-end":
        return this.handleLargeFormEnd(sourceParticipantId, payload, events);
      case "clouds-jaunt":
        return this.handleCloudsJaunt(sourceParticipantId, payload, events);
      case "moonlight-step":
        return this.handleMoonlightStep(sourceParticipantId, payload, events);
      case "moonlight-step-recover":
        return this.handleMoonlightStepRecovery(
          sourceParticipantId,
          payload,
          events,
        );
      case "druid-hit-riders":
        return this.handleDruidHitRiders(
          sourceParticipantId,
          payload,
          events,
        );
      case "fires-burn":
      case "frosts-chill":
      case "hills-tumble":
        return this.handleGiantAncestryOnHit(
          sourceParticipantId,
          payload,
          events,
        );
      case "stones-endurance":
        return this.handleStonesEndurance(
          sourceParticipantId,
          payload,
          events,
        );
      case "storms-thunder":
        return this.handleStormsThunder(sourceParticipantId, payload, events);
      case "channel-divinity":
        return this.handleChannelDivinity(sourceParticipantId, payload, events);
      case "arcane-recovery":
        return this.handleArcaneRecovery(sourceParticipantId, payload, events);
      case "divine-sense":
        return this.handleDivineSense(sourceParticipantId, payload, events);
      case "healing-hands":
        return this.handleHealingHands(sourceParticipantId, payload, events);
      case "celestial-revelation":
        return this.handleCelestialRevelation(
          sourceParticipantId,
          payload,
          events,
        );
      case "abjure-foes":
        return this.handleAbjureFoes(sourceParticipantId, payload, events);
      case "bardic-inspiration":
        return this.handleBardicInspiration(
          sourceParticipantId,
          payload,
          events,
        );
      case "cutting-words":
        return this.handleCuttingWords(sourceParticipantId, payload, events);
      case "countercharm":
        return this.handleCountercharm(sourceParticipantId, payload, events);
      case "dark-ones-blessing":
        return this.handleDarkOnesBlessing(
          sourceParticipantId,
          payload,
          events,
        );
      case "dark-ones-own-luck":
        return this.handleDarkOnesOwnLuck(sourceParticipantId, payload, events);
      case "martial-arts-bonus":
        return this.handleBonusUnarmedStrike(sourceParticipantId, events);
      case "flurry-of-blows":
        return this.handleFlurryOfBlows(sourceParticipantId, payload, events);
      case "patient-defense-disengage":
        return this.handlePatientDefenseDisengage(
          sourceParticipantId,
          events,
        );
      case "patient-defense":
        return this.handlePatientDefense(sourceParticipantId, payload, events);
      case "step-of-the-wind-dash":
        return this.handleStepOfTheWindDash(sourceParticipantId, events);
      case "step-of-the-wind":
        return this.handleStepOfTheWind(sourceParticipantId, payload, events);
      case "stunning-strike":
        return this.handleStunningStrike(sourceParticipantId, payload, events);
      case "deflect-attacks":
        return this.handleDeflectAttacks(sourceParticipantId, payload, events);
      case "open-hand-technique-addle":
      case "open-hand-technique-push":
      case "open-hand-technique-topple":
        return this.handleOpenHandTechnique(
          sourceParticipantId,
          payload,
          events,
        );
      case "steady-aim":
        return this.handleSteadyAim(sourceParticipantId, payload, events);
      case "cunning-strike":
        return this.handleCunningStrike(sourceParticipantId, payload, events);
      case "uncanny-dodge":
        return this.handleUncannyDodge(sourceParticipantId, payload, events);
      case "tireless":
        return this.handleTireless(sourceParticipantId, payload, events);
      case "natures-veil":
        return this.handleNaturesVeil(sourceParticipantId, payload, events);
      case "natural-recovery":
        return this.handleNaturalRecovery(sourceParticipantId, payload, events);
      case "favored-enemy":
        return this.handleFavoredEnemy(sourceParticipantId, payload, events);
      default:
        return { resolved: false, events };
    }
  }






  private async handleLargeForm(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const alreadyActive = (source.effectInstances ?? []).some(
      (effect) => effect.sourceFeatureSlug === "large-form",
    );
    if (alreadyActive) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "large-form",
          error: "Forma Grande já está ativa.",
        },
      });
      return { resolved: false, events };
    }

    const baseSpeed = payload.caster?.speed ?? 30;
    const previousSpeed = applyEffectSpeedModifiers(
      baseSpeed,
      source.effectInstances,
    );
    const durationRounds = 100;
    const advantage = await this.effectInstances.addEffect(source, {
      kind: "self_advantage",
      sourceFeatureSlug: "large-form",
      sourceCasterParticipantId: sourceId,
      payload: { scope: "str-check", size: "large" },
      expiresAt: { kind: "rounds", value: durationRounds },
      requiresConcentration: false,
    });
    const speed = await this.effectInstances.addEffect(source, {
      kind: "speed_bonus",
      sourceFeatureSlug: "large-form",
      sourceCasterParticipantId: sourceId,
      payload: { amount: 10, size: "large" },
      expiresAt: { kind: "rounds", value: durationRounds },
      requiresConcentration: false,
    });
    const newSpeed = applyEffectSpeedModifiers(
      baseSpeed,
      source.effectInstances,
    );
    source.movementRemaining = reconcileRemainingMovement(
      source.movementRemaining,
      previousSpeed,
      newSpeed,
    );
    await this.participants.save(source);

    events.push(...advantage.events, ...speed.events, {
      event_type: "large_form_activated",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "large-form",
        durationRounds,
        previousSpeed,
        newSpeed,
        movementRemaining: source.movementRemaining,
        size: "large",
        strengthChecksHaveAdvantage: true,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        durationRounds,
        previousSpeed,
        newSpeed,
        movementRemaining: source.movementRemaining,
        size: "large",
        strengthChecksHaveAdvantage: true,
      },
    };
  }

  private async handleLargeFormEnd(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const activeEffects = (source.effectInstances ?? []).filter(
      (effect) => effect.sourceFeatureSlug === "large-form",
    );
    if (activeEffects.length === 0) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "large-form-end",
          error: "Forma Grande não está ativa.",
        },
      });
      return { resolved: false, events };
    }

    const baseSpeed = payload.caster?.speed ?? 30;
    const previousSpeed = applyEffectSpeedModifiers(
      baseSpeed,
      source.effectInstances,
    );
    for (const effect of activeEffects) {
      const removal = await this.effectInstances.removeEffect(
        source,
        effect.id,
        "manual",
      );
      events.push(...removal.events);
    }
    const newSpeed = applyEffectSpeedModifiers(
      baseSpeed,
      source.effectInstances,
    );
    source.movementRemaining = reconcileRemainingMovement(
      source.movementRemaining,
      previousSpeed,
      newSpeed,
    );
    await this.participants.save(source);

    events.push({
      event_type: "large_form_ended",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "large-form",
        previousSpeed,
        newSpeed,
        movementRemaining: source.movementRemaining,
        size: "medium",
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        previousSpeed,
        newSpeed,
        movementRemaining: source.movementRemaining,
        size: "medium",
      },
    };
  }

  private async handleCloudsJaunt(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const destinationX = Number(payload.options?.destinationX);
    const destinationY = Number(payload.options?.destinationY);
    const requestedGridColumns = Number(payload.options?.gridColumns ?? 20);
    const requestedGridRows = Number(payload.options?.gridRows ?? 20);
    const gridColumns =
      Number.isInteger(requestedGridColumns) && requestedGridColumns > 0
        ? requestedGridColumns
        : 20;
    const gridRows =
      Number.isInteger(requestedGridRows) && requestedGridRows > 0
        ? requestedGridRows
        : 20;
    if (
      !source ||
      source.positionX == null ||
      source.positionY == null ||
      !Number.isInteger(destinationX) ||
      !Number.isInteger(destinationY)
    ) {
      return this.giantAncestryError(
        sourceId,
        "clouds-jaunt",
        "Escolha uma célula válida para o Salto das Nuvens.",
        events,
      );
    }
    const distanceFt =
      Math.max(
        Math.abs(destinationX - source.positionX),
        Math.abs(destinationY - source.positionY),
      ) * 5;
    if (
      distanceFt <= 0 ||
      distanceFt > 30 ||
      destinationX < 0 ||
      destinationX >= gridColumns ||
      destinationY < 0 ||
      destinationY >= gridRows
    ) {
      return this.giantAncestryError(
        sourceId,
        "clouds-jaunt",
        "O Salto das Nuvens alcança uma célula desocupada a até 30 pés.",
        events,
      );
    }
    const occupants = await this.participants.find({
      where: { encounterId: source.encounterId },
    });
    if (
      occupants.some(
        (participant) =>
          participant.id !== source.id &&
          !participant.isDefeated &&
          participant.positionX === destinationX &&
          participant.positionY === destinationY,
      )
    ) {
      return this.giantAncestryError(
        sourceId,
        "clouds-jaunt",
        "O espaço de destino do Salto das Nuvens está ocupado.",
        events,
      );
    }

    const from = { x: source.positionX, y: source.positionY };
    source.positionX = destinationX;
    source.positionY = destinationY;
    await this.participants.save(source);
    events.push({
      event_type: "clouds_jaunt_resolved",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "clouds-jaunt",
        from,
        to: { x: destinationX, y: destinationY },
        distanceFt,
        movementSpent: 0,
        opportunityAttacksTriggered: 0,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        from,
        to: { x: destinationX, y: destinationY },
        distanceFt,
        movementSpent: 0,
      },
    };
  }

  private async handleMoonlightStep(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const destinationX = Number(payload.options?.destinationX);
    const destinationY = Number(payload.options?.destinationY);
    const sharedCompanionParticipantId =
      typeof payload.options?.sharedCompanionParticipantId === "string"
        ? payload.options.sharedCompanionParticipantId
        : undefined;
    const sharedCompanionDestinationX = Number(
      payload.options?.sharedCompanionDestinationX,
    );
    const sharedCompanionDestinationY = Number(
      payload.options?.sharedCompanionDestinationY,
    );
    const sharedMoonlightRequested =
      sharedCompanionParticipantId !== undefined ||
      Number.isFinite(sharedCompanionDestinationX) ||
      Number.isFinite(sharedCompanionDestinationY);
    const requestedGridColumns = Number(payload.options?.gridColumns ?? 20);
    const requestedGridRows = Number(payload.options?.gridRows ?? 20);
    const gridColumns =
      Number.isInteger(requestedGridColumns) && requestedGridColumns > 0
        ? requestedGridColumns
        : 20;
    const gridRows =
      Number.isInteger(requestedGridRows) && requestedGridRows > 0
        ? requestedGridRows
        : 20;
    if (
      !source?.characterId ||
      source.positionX == null ||
      source.positionY == null ||
      !Number.isInteger(destinationX) ||
      !Number.isInteger(destinationY)
    ) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step",
        "Escolha uma célula válida para o Passo ao Luar.",
        events,
      );
    }

    const wisdomModifier = payload.caster?.abilityMods?.wis ?? 0;
    const maxUses = Math.max(1, wisdomModifier);
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step",
        "O estado do personagem não está disponível.",
        events,
      );
    }
    const usedBefore = state.feature_uses_used?.["moonlight-step"] ?? 0;
    if (usedBefore >= maxUses) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step",
        "Não restam usos de Passo ao Luar.",
        events,
      );
    }

    const distanceFt =
      Math.max(
        Math.abs(destinationX - source.positionX),
        Math.abs(destinationY - source.positionY),
      ) * 5;
    if (
      distanceFt <= 0 ||
      distanceFt > 30 ||
      destinationX < 0 ||
      destinationX >= gridColumns ||
      destinationY < 0 ||
      destinationY >= gridRows
    ) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step",
        "O Passo ao Luar alcança uma célula desocupada a até 30 pés.",
        events,
      );
    }
    const occupants = await this.participants.find({
      where: { encounterId: source.encounterId },
    });
    if (
      occupants.some(
        (participant) =>
          participant.id !== source.id &&
          !participant.isDefeated &&
          participant.positionX === destinationX &&
          participant.positionY === destinationY,
      )
    ) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step",
        "O espaço de destino do Passo ao Luar está ocupado.",
        events,
      );
    }

    let sharedCompanion:
      | {
          participant: EncounterParticipantEntity;
          from: { x: number; y: number };
          to: { x: number; y: number };
        }
      | undefined;
    if (sharedMoonlightRequested) {
      if (
        payload.caster?.classLevel == null ||
        payload.caster.classLevel < 14 ||
        payload.caster.isMoonDruid !== true
      ) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "Luar Compartilhado exige Forma Lunar no nível 14 do Círculo da Lua.",
          events,
        );
      }
      if (
        !sharedCompanionParticipantId ||
        !Number.isInteger(sharedCompanionDestinationX) ||
        !Number.isInteger(sharedCompanionDestinationY)
      ) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "Escolha a criatura e o destino dela para usar Luar Compartilhado.",
          events,
        );
      }
      const companion = occupants.find(
        (participant) => participant.id === sharedCompanionParticipantId,
      );
      if (
        !companion ||
        companion.id === source.id ||
        companion.isDefeated ||
        companion.positionX == null ||
        companion.positionY == null ||
        companion.faction !== source.faction
      ) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "Luar Compartilhado exige uma criatura aliada e consciente.",
          events,
        );
      }
      const companionDistanceFromSource =
        Math.max(
          Math.abs(companion.positionX - source.positionX),
          Math.abs(companion.positionY - source.positionY),
        ) * 5;
      if (companionDistanceFromSource > 10) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "A criatura de Luar Compartilhado deve estar a até 10 pés de você.",
          events,
        );
      }
      const companionDistanceFromDestination =
        Math.max(
          Math.abs(sharedCompanionDestinationX - destinationX),
          Math.abs(sharedCompanionDestinationY - destinationY),
        ) * 5;
      if (
        companionDistanceFromDestination <= 0 ||
        companionDistanceFromDestination > 10 ||
        sharedCompanionDestinationX < 0 ||
        sharedCompanionDestinationX >= gridColumns ||
        sharedCompanionDestinationY < 0 ||
        sharedCompanionDestinationY >= gridRows
      ) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "O destino da criatura deve estar desocupado e a até 10 pés do seu destino.",
          events,
        );
      }
      if (
        occupants.some(
          (participant) =>
            participant.id !== source.id &&
            participant.id !== companion.id &&
            !participant.isDefeated &&
            participant.positionX === sharedCompanionDestinationX &&
            participant.positionY === sharedCompanionDestinationY,
        )
      ) {
        return this.classFeatureError(
          sourceId,
          "moonlight-step",
          "O destino da criatura de Luar Compartilhado está ocupado.",
          events,
        );
      }
      sharedCompanion = {
        participant: companion,
        from: { x: companion.positionX, y: companion.positionY },
        to: {
          x: sharedCompanionDestinationX,
          y: sharedCompanionDestinationY,
        },
      };
    }

    const from = { x: source.positionX, y: source.positionY };
    source.positionX = destinationX;
    source.positionY = destinationY;
    if (sharedCompanion) {
      sharedCompanion.participant.positionX = sharedCompanion.to.x;
      sharedCompanion.participant.positionY = sharedCompanion.to.y;
    }
    const advantage = await this.effectInstances.addEffect(source, {
      kind: "self_advantage_next_attack" as never,
      sourceFeatureSlug: "moonlight-step",
      sourceCasterParticipantId: sourceId,
      payload: {
        reason: "moonlight-step",
        consumeOn: "targeted_by_attack",
      },
      expiresAt: { kind: "caster_turn_ends", value: 1 },
      requiresConcentration: false,
    });
    await this.participants.save(source);
    if (sharedCompanion) {
      await this.participants.save(sharedCompanion.participant);
    }
    state.feature_uses_used = {
      ...(state.feature_uses_used ?? {}),
      "moonlight-step": usedBefore + 1,
    };
    await this.charStates.save(state);
    const usesRemaining = Math.max(0, maxUses - usedBefore - 1);
    events.push(...advantage.events, {
      event_type: "moonlight_step_resolved",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "moonlight-step",
        from,
        to: { x: destinationX, y: destinationY },
        distanceFt,
        movementSpent: 0,
        opportunityAttacksTriggered: 0,
        advantageOnNextAttack: true,
        sharedCompanion: sharedCompanion
          ? {
              participantId: sharedCompanion.participant.id,
              name: sharedCompanion.participant.displayName,
              from: sharedCompanion.from,
              to: sharedCompanion.to,
            }
          : undefined,
        usesRemaining,
        maxUses,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        from,
        to: { x: destinationX, y: destinationY },
        distanceFt,
        movementSpent: 0,
        advantageOnNextAttack: true,
        sharedCompanion: sharedCompanion
          ? {
              participantId: sharedCompanion.participant.id,
              name: sharedCompanion.participant.displayName,
              from: sharedCompanion.from,
              to: sharedCompanion.to,
            }
          : undefined,
        usesRemaining,
        maxUses,
      },
    };
  }

  private async handleMoonlightStepRecovery(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const slotLevel = Number(payload.options?.slotLevel);
    if (!source?.characterId) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step-recover",
        "O personagem do Passo ao Luar não está disponível.",
        events,
      );
    }
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step-recover",
        "O estado do personagem não está disponível.",
        events,
      );
    }
    const usedBefore = state.feature_uses_used?.["moonlight-step"] ?? 0;
    if (usedBefore <= 0) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step-recover",
        "Nenhum uso de Passo ao Luar está gasto.",
        events,
      );
    }
    const slot = payload.caster?.spellSlots?.find(
      (candidate) =>
        candidate.level === slotLevel && candidate.kind !== "pact",
    );
    const slotUsedBefore =
      state.spell_slots_used?.[String(slotLevel)] ?? slot?.used ?? 0;
    if (
      !Number.isInteger(slotLevel) ||
      slotLevel < 2 ||
      !slot ||
      slotUsedBefore >= slot.total
    ) {
      return this.classFeatureError(
        sourceId,
        "moonlight-step-recover",
        `Não há slot de magia de nível ${slotLevel || "?"} disponível para recuperar Passo ao Luar.`,
        events,
      );
    }

    state.feature_uses_used = {
      ...(state.feature_uses_used ?? {}),
      "moonlight-step": usedBefore - 1,
    };
    state.spell_slots_used = {
      ...(state.spell_slots_used ?? {}),
      [String(slotLevel)]: slotUsedBefore + 1,
    };
    await this.charStates.save(state);
    events.push({
      event_type: "moonlight_step_recovered",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "moonlight-step",
        slotLevel,
        slotUsedBefore,
        slotUsedAfter: slotUsedBefore + 1,
        usesRecovered: 1,
        usesSpentAfter: usedBefore - 1,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        slotLevel,
        slotUsedAfter: slotUsedBefore + 1,
        usesRecovered: 1,
        usesSpentAfter: usedBefore - 1,
      },
    };
  }

  private async handleDruidHitRiders(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const targetId = payload.targets?.[0];
    if (!source || !targetId) {
      return { resolved: false, events };
    }
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "druid_hit_rider_pending" &&
        effect.payload?.requiredTargetId === targetId,
    );
    if (!pending) {
      return this.druidHitRiderError(
        sourceId,
        "Os efeitos deste acerto do Druida expiraram.",
        events,
      );
    }
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target || target.isDefeated) {
      return this.druidHitRiderError(
        sourceId,
        "O alvo deste acerto não está mais disponível.",
        events,
      );
    }

    const usePrimalStrike =
      payload.options?.usePrimalStrike === true &&
      pending.payload?.primalStrikeAvailable === true;
    const useLunarRadiance =
      payload.options?.useLunarRadiance === true &&
      pending.payload?.lunarRadianceAvailable === true;
    const primalDamageType = String(
      payload.options?.primalDamageType ?? "",
    ).toLowerCase();
    const allowedDamageTypes = pending.payload?.damageTypes ?? [];
    if (
      usePrimalStrike &&
      !allowedDamageTypes.includes(primalDamageType)
    ) {
      return this.druidHitRiderError(
        sourceId,
        "Escolha frio, fogo, elétrico ou trovejante para Ataque Primordial.",
        events,
      );
    }

    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participants.save(source);

    if (!usePrimalStrike && !useLunarRadiance) {
      events.push({
        event_type: "druid_hit_riders_declined",
        actor_participant_id: sourceId,
        target_participant_id: targetId,
        data: {
          featureSlug: "druid-hit-riders",
          primalStrikeAvailable:
            pending.payload?.primalStrikeAvailable === true,
          lunarRadianceAvailable:
            pending.payload?.lunarRadianceAvailable === true,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: {
          targetParticipantId: targetId,
          declined: true,
          targetDefeated: false,
        },
      };
    }

    const critical = pending.payload?.hitWasCritical === true;
    const components: Array<{
      featureSlug: "primal-strike" | "lunar-form";
      dice: string;
      rolls: number[];
      rawDamage: number;
      finalDamage: number;
      damageType: string;
      resisted: boolean;
      immune: boolean;
      vulnerable: boolean;
    }> = [];

    if (usePrimalStrike) {
      const baseDice = pending.payload?.diceExpression ?? "1d8";
      const diceExpression = critical
        ? this.doubleDiceExpression(baseDice)
        : baseDice;
      const roll = this.dice.rollExpression(diceExpression);
      const damage = await this.applyFeatureDamage(
        sourceId,
        target,
        roll.total,
        primalDamageType,
        "primal-strike",
        events,
      );
      components.push({
        featureSlug: "primal-strike",
        dice: diceExpression,
        rolls: roll.rolls ?? [],
        rawDamage: damage.rawDamage,
        finalDamage: damage.finalDamage,
        damageType: primalDamageType,
        resisted: damage.resisted,
        immune: damage.immune,
        vulnerable: damage.vulnerable,
      });
      const marker = await this.effectInstances.addEffect(source, {
        kind: "primal_strike_used_this_turn",
        sourceFeatureSlug: "primal-strike",
        sourceCasterParticipantId: sourceId,
        payload: { usedThisTurn: true },
        expiresAt: { kind: "caster_turn_ends", value: 1 },
        requiresConcentration: false,
      });
      events.push(...marker.events);
    }

    if (useLunarRadiance) {
      const baseDice = pending.payload?.lunarRadianceDice ?? "2d10";
      const diceExpression = critical
        ? this.doubleDiceExpression(baseDice)
        : baseDice;
      const roll = this.dice.rollExpression(diceExpression);
      const damage = await this.applyFeatureDamage(
        sourceId,
        target,
        roll.total,
        "radiant",
        "lunar-form",
        events,
      );
      components.push({
        featureSlug: "lunar-form",
        dice: diceExpression,
        rolls: roll.rolls ?? [],
        rawDamage: damage.rawDamage,
        finalDamage: damage.finalDamage,
        damageType: "radiant",
        resisted: damage.resisted,
        immune: damage.immune,
        vulnerable: damage.vulnerable,
      });
      const marker = await this.effectInstances.addEffect(source, {
        kind: "lunar_radiance_used_this_turn",
        sourceFeatureSlug: "lunar-form",
        sourceCasterParticipantId: sourceId,
        payload: { usedThisTurn: true },
        expiresAt: { kind: "caster_turn_ends", value: 1 },
        requiresConcentration: false,
      });
      events.push(...marker.events);
    }

    const totalFinalDamage = components.reduce(
      (sum, component) => sum + component.finalDamage,
      0,
    );
    events.push({
      event_type: "druid_hit_riders_resolved",
      actor_participant_id: sourceId,
      target_participant_id: targetId,
      data: {
        featureSlug: "druid-hit-riders",
        critical,
        components,
        totalFinalDamage,
        hpAfter: target.currentHp ?? 0,
        targetDefeated: target.isDefeated,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        targetParticipantId: targetId,
        critical,
        components,
        totalFinalDamage,
        hpAfter: target.currentHp ?? 0,
        targetDefeated: target.isDefeated,
      },
    };
  }

  private doubleDiceExpression(expression: string): string {
    const match = expression.trim().match(/^(\d+)d(\d+)$/i);
    if (!match) return expression;
    return `${Number(match[1]) * 2}d${match[2]}`;
  }

  private druidHitRiderError(
    sourceId: string,
    error: string,
    events: GameEventData[],
  ) {
    events.push({
      event_type: "class_feature_error",
      actor_participant_id: sourceId,
      data: { featureSlug: "druid-hit-riders", error },
    });
    return { resolved: false, events };
  }

  private async handleGiantAncestryOnHit(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const targetId = payload.targets?.[0];
    if (!source || !targetId) {
      return { resolved: false, events };
    }
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "giant_ancestry_hit_pending" &&
        effect.sourceFeatureSlug === payload.featureSlug &&
        effect.payload?.requiredTargetId === targetId,
    );
    if (!pending) {
      return this.giantAncestryError(
        sourceId,
        payload.featureSlug,
        "A oportunidade da Ancestralidade Gigante expirou.",
        events,
      );
    }
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target || target.isDefeated) {
      return this.giantAncestryError(
        sourceId,
        payload.featureSlug,
        "O alvo da Ancestralidade Gigante não está mais disponível.",
        events,
      );
    }

    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participants.save(source);

    if (payload.featureSlug === "hills-tumble") {
      if (!this.isLargeOrSmaller(target)) {
        return this.giantAncestryError(
          sourceId,
          payload.featureSlug,
          "Queda da Colina afeta apenas criaturas Grandes ou menores.",
          events,
        );
      }
      const prone = await this.conditionLifecycle.applyCondition(target, {
        slug: "prone",
        appliedBy: sourceId,
        source: "feature:hills-tumble",
        sourceConcentration: false,
        durationRoundsRemaining: null,
      } as unknown as Parameters<
        typeof this.conditionLifecycle.applyCondition
      >[1]);
      events.push(...prone.events, {
        event_type: "giant_ancestry_resolved",
        actor_participant_id: sourceId,
        target_participant_id: targetId,
        data: {
          featureSlug: payload.featureSlug,
          condition: "prone",
          targetSize: this.participantSize(target),
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: {
          featureSlug: payload.featureSlug,
          targetParticipantId: targetId,
          proneApplied: true,
        },
      };
    }

    const dieSize = payload.featureSlug === "fires-burn" ? 10 : 6;
    const damageType = payload.featureSlug === "fires-burn" ? "fire" : "cold";
    const roll = this.dice.roll(dieSize);
    const damage = await this.applyFeatureDamage(
      sourceId,
      target,
      roll,
      damageType,
      payload.featureSlug,
      events,
    );
    let speedReduced = false;
    if (
      payload.featureSlug === "frosts-chill" &&
      !target.isDefeated
    ) {
      const slowed = await this.effectInstances.addEffect(target, {
        kind: "speed_reduction",
        sourceFeatureSlug: "frosts-chill",
        sourceCasterParticipantId: sourceId,
        payload: { amount: 10 },
        expiresAt: { kind: "until_caster_turn", value: 1 },
        requiresConcentration: false,
      });
      events.push(...slowed.events);
      speedReduced = true;
    }
    events.push({
      event_type: "giant_ancestry_resolved",
      actor_participant_id: sourceId,
      target_participant_id: targetId,
      data: {
        featureSlug: payload.featureSlug,
        roll,
        die: `1d${dieSize}`,
        damageType,
        ...damage,
        speedReducedBy: speedReduced ? 10 : 0,
        expiresAt: speedReduced ? "start-of-caster-next-turn" : undefined,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        featureSlug: payload.featureSlug,
        targetParticipantId: targetId,
        roll,
        damageType,
        ...damage,
        speedReducedBy: speedReduced ? 10 : 0,
      },
    };
  }

  private async handleStonesEndurance(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const triggerEventId = payload.options?.triggerEventId as
      | string
      | undefined;
    if (!source?.characterId || !triggerEventId) {
      return { resolved: false, events };
    }
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "giant_ancestry_reaction_pending" &&
        effect.sourceFeatureSlug === "stones-endurance" &&
        effect.payload?.triggerEventId === triggerEventId,
    );
    if (!pending) {
      return this.giantAncestryError(
        sourceId,
        "stones-endurance",
        "A reação de Resistência da Pedra expirou.",
        events,
      );
    }

    const incomingDamage = Math.max(
      0,
      Number(pending.payload?.incomingDamage ?? 0),
    );
    const constitutionModifier = payload.caster?.abilityMods?.con ?? 0;
    const reductionRoll = this.dice.roll(12);
    const reductionTotal = Math.max(0, reductionRoll + constitutionModifier);
    const damagePrevented = Math.min(incomingDamage, reductionTotal);
    const damageAfter = Math.max(0, incomingDamage - reductionTotal);
    const hpBefore = Number(pending.payload?.hpBefore ?? 0);
    const tempHpBefore = Math.max(
      0,
      Number(pending.payload?.tempHpBefore ?? 0),
    );
    const tempHpAfter = Math.max(0, tempHpBefore - damageAfter);
    const damageToHp = Math.max(0, damageAfter - tempHpBefore);
    const hpAfter = Math.max(0, hpBefore - damageToHp);
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) return { resolved: false, events };
    state.current_hp = hpAfter;
    state.temp_hp = tempHpAfter;
    source.currentHp = hpAfter;
    source.tempHp = tempHpAfter;
    if (hpAfter > 0) {
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
      source.dyingState = "none";
      source.isDefeated = false;
    }
    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.charStates.save(state);
    await this.participants.save(source);
    events.push({
      event_type: "giant_ancestry_resolved",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "stones-endurance",
        triggerEventId,
        incomingDamage,
        reductionRoll,
        constitutionModifier,
        reductionTotal,
        damagePrevented,
        damageAfter,
        tempHpBefore,
        tempHpAfter,
        hpAfter,
        damageType: pending.payload?.damageType,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        incomingDamage,
        reductionRoll,
        constitutionModifier,
        reductionTotal,
        damagePrevented,
        damageAfter,
        tempHpBefore,
        tempHpAfter,
        hpAfter,
      },
    };
  }

  private async handleStormsThunder(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const triggerEventId = payload.options?.triggerEventId as
      | string
      | undefined;
    if (!source || !triggerEventId) return { resolved: false, events };
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "giant_ancestry_reaction_pending" &&
        effect.sourceFeatureSlug === "storms-thunder" &&
        effect.payload?.triggerEventId === triggerEventId,
    );
    const attackerId = pending?.payload?.attackerParticipantId as
      | string
      | undefined;
    if (!pending || !attackerId) {
      return this.giantAncestryError(
        sourceId,
        "storms-thunder",
        "A reação de Trovão da Tempestade expirou.",
        events,
      );
    }
    const attacker = await this.participants.findOne({
      where: { id: attackerId },
      relations: ["monster"],
    });
    const distanceFt =
      attacker &&
      source.positionX != null &&
      source.positionY != null &&
      attacker.positionX != null &&
      attacker.positionY != null
        ? Math.max(
            Math.abs(source.positionX - attacker.positionX),
            Math.abs(source.positionY - attacker.positionY),
          ) * 5
        : Number.POSITIVE_INFINITY;
    if (!attacker || attacker.isDefeated || distanceFt > 60) {
      return this.giantAncestryError(
        sourceId,
        "storms-thunder",
        "O agressor não está mais a até 60 pés.",
        events,
      );
    }
    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participants.save(source);
    const roll = this.dice.roll(8);
    const damage = await this.applyFeatureDamage(
      sourceId,
      attacker,
      roll,
      "thunder",
      "storms-thunder",
      events,
    );
    events.push({
      event_type: "giant_ancestry_resolved",
      actor_participant_id: sourceId,
      target_participant_id: attacker.id,
      data: {
        featureSlug: "storms-thunder",
        triggerEventId,
        roll,
        die: "1d8",
        damageType: "thunder",
        distanceFt,
        ...damage,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        targetParticipantId: attacker.id,
        roll,
        damageType: "thunder",
        distanceFt,
        ...damage,
      },
    };
  }

  private giantAncestryError(
    sourceId: string,
    featureSlug: string,
    error: string,
    events: GameEventData[],
  ) {
    return this.classFeatureError(sourceId, featureSlug, error, events);
  }

  private classFeatureError(
    sourceId: string,
    featureSlug: string,
    error: string,
    events: GameEventData[],
  ) {
    events.push({
      event_type: "class_feature_error",
      actor_participant_id: sourceId,
      data: { featureSlug, error },
    });
    return { resolved: false, events };
  }

  private participantSize(
    participant: EncounterParticipantEntity,
  ): string {
    const activeLargeForm = (participant.effectInstances ?? []).some(
      (effect) =>
        effect.sourceFeatureSlug === "large-form" &&
        effect.payload?.size === "large",
    );
    if (activeLargeForm) return "large";
    return String(participant.monster?.size ?? "medium").toLowerCase();
  }

  private isLargeOrSmaller(
    participant: EncounterParticipantEntity,
  ): boolean {
    const order = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
    const sizeIndex = order.indexOf(this.participantSize(participant));
    return sizeIndex >= 0 && sizeIndex <= order.indexOf("large");
  }

  private async applyFeatureDamage(
    sourceId: string,
    target: EncounterParticipantEntity,
    rawDamage: number,
    damageType: string,
    featureSlug: string,
    events: GameEventData[],
  ): Promise<{
    rawDamage: number;
    finalDamage: number;
    resisted: boolean;
    immune: boolean;
    vulnerable: boolean;
    hpAfter: number;
    targetDefeated: boolean;
  }> {
    const monsterText = (value: unknown) =>
      JSON.stringify(value ?? "").toLowerCase();
    const immunityText = monsterText(target.monster?.damage_immunities);
    const resistanceText = monsterText(target.monster?.damage_resistances);
    const vulnerabilityText = monsterText(
      target.monster?.damage_vulnerabilities,
    );
    const effectResistance = (target.effectInstances ?? []).some(
      (effect) =>
        effect.kind === "damage_resistance" &&
        (effect.payload?.damageTypes ?? []).some(
          (type) => type.toLowerCase() === damageType.toLowerCase(),
        ),
    );
    const immune = immunityText.includes(damageType.toLowerCase());
    const resisted =
      !immune &&
      (resistanceText.includes(damageType.toLowerCase()) || effectResistance);
    const vulnerable =
      !immune &&
      !resisted &&
      vulnerabilityText.includes(damageType.toLowerCase());
    const finalDamage = immune
      ? 0
      : resisted
        ? Math.floor(rawDamage / 2)
        : vulnerable
          ? rawDamage * 2
          : rawDamage;

    if (target.characterId) {
      const state = await this.charStates.findOne({
        where: { character_id: target.characterId },
      });
      if (state) {
        let remaining = finalDamage;
        const tempHp = Math.max(0, state.temp_hp ?? 0);
        const absorbed = Math.min(tempHp, remaining);
        state.temp_hp = tempHp - absorbed;
        remaining -= absorbed;
        state.current_hp = Math.max(0, state.current_hp - remaining);
        target.tempHp = state.temp_hp;
        target.currentHp = state.current_hp;
        if (state.current_hp === 0) {
          target.dyingState = "dying";
        }
        await this.charStates.save(state);
      }
    } else {
      target.currentHp = Math.max(0, (target.currentHp ?? 0) - finalDamage);
      target.isDefeated = target.currentHp === 0;
    }
    await this.participants.save(target);
    if (finalDamage > 0) {
      events.push(
        ...(await this.conditionLifecycle.removeConditionsEndedByDamage(
          target,
        )),
      );
    }
    events.push({
      event_type: "damage_applied",
      actor_participant_id: sourceId,
      target_participant_id: target.id,
      data: {
        source: `feature:${featureSlug}`,
        type: damageType,
        total: rawDamage,
        rawDamage,
        finalDamage,
        resisted,
        immune,
        vulnerable,
      },
    });
    return {
      rawDamage,
      finalDamage,
      resisted,
      immune,
      vulnerable,
      hpAfter: target.currentHp ?? 0,
      targetDefeated: target.isDefeated,
    };
  }




  private async handleFavoredEnemy(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const rangerLevel = payload.caster?.classLevel ?? 1;
    const freeCasts =
      rangerLevel >= 17
        ? 6
        : rangerLevel >= 13
          ? 5
          : rangerLevel >= 9
            ? 4
            : rangerLevel >= 5
              ? 3
              : 2;
    events.push({
      event_type: "favored_enemy_ready",
      actor_participant_id: sourceId,
      data: { freeCasts, rangerLevel, spellSlug: "hunter-mark" },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { freeCasts, rangerLevel },
    };
  }




  private async handleNaturalRecovery(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const classLevel = payload.caster?.classLevel ?? 2;
    const budget = Math.floor(classLevel / 2);
    const assignments = (opts.slotAssignments as Record<string, number>) ?? {
      level1: 1,
    };

    let spent = 0;
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const st = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!st) return { resolved: false, events };

    const slots =
      (st as unknown as { spell_slots?: Record<string, number> }).spell_slots ??
      {};
    const regained: Record<string, number> = {};
    for (const [lvlKey, count] of Object.entries(assignments)) {
      const lvl = parseInt(lvlKey.replace("level", ""), 10);
      if (lvl > 5 || count <= 0) continue;
      const addBudget = lvl * count;
      if (spent + addBudget > budget) continue;
      const currentUsed = slots[lvlKey] ?? 0;
      const toRegain = Math.min(currentUsed, count);
      if (toRegain <= 0) continue;
      slots[lvlKey] = currentUsed - toRegain;
      regained[lvlKey] = toRegain;
      spent += lvl * toRegain;
    }
    (st as unknown as { spell_slots?: Record<string, number> }).spell_slots =
      slots;
    await this.charStates.save(st);

    events.push({
      event_type: "natural_recovery_used",
      actor_participant_id: sourceId,
      data: { budgetSpent: spent, budgetTotal: budget, regained },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { budgetSpent: spent, regained },
    };
  }




  private async handleTireless(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const wisMod = payload.caster?.abilityMods?.wis ?? 0;
    const rolled = this.dice.roll(8);
    const total = rolled + wisMod;
    if (source.characterId) {
      const st = await this.charStates.findOne({
        where: { character_id: source.characterId },
      });
      if (st) {
        st.current_hp = st.current_hp + total;
        await this.charStates.save(st);
      }
    } else {
      source.currentHp = Math.min(
        source.maxHp ?? 0,
        (source.currentHp ?? 0) + total,
      );
      await this.participants.save(source);
    }
    events.push({
      event_type: "tireless_heal",
      actor_participant_id: sourceId,
      data: { rolled, wisMod, total },
    });
    return { resolved: true, events, resolutionPayload: { healAmount: total } };
  }




  private async handleNaturesVeil(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const r = await this.conditionLifecycle.applyCondition(source, {
      slug: "invisible",
      appliedBy: sourceId,
      source: "feature:natures-veil",
      sourceConcentration: false,
      durationRoundsRemaining: 1,
    } as unknown as Parameters<
      typeof this.conditionLifecycle.applyCondition
    >[1]);
    events.push(...r.events, {
      event_type: "natures_veil_activated",
      actor_participant_id: sourceId,
      data: { durationRounds: 1 },
    });
    return { resolved: true, events };
  }




  private async handleSteadyAim(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.movementRemaining = 0;
    const res = await this.effectInstances.addEffect(source, {
      kind: "self_advantage_next_attack" as never,
      sourceCasterParticipantId: sourceId,
      sourceFeatureSlug: "steady-aim",
      payload: { reason: "steady-aim" },
      expiresAt: { kind: "caster_turn_ends", value: 1 },
      requiresConcentration: false,
    });
    await this.participants.save(source);
    events.push(...res.events, {
      event_type: "steady_aim_armed",
      actor_participant_id: sourceId,
      data: { advantageNextAttack: true, movementSpent: true },
    });
    return { resolved: true, events };
  }




  private async handleUncannyDodge(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const triggerEventId = payload.options?.triggerEventId as
      | string
      | undefined;
    if (!source?.characterId || !triggerEventId) {
      return { resolved: false, events };
    }
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "uncanny_dodge_pending" &&
        effect.payload?.triggerEventId === triggerEventId,
    );
    if (!pending) return { resolved: false, events };

    const incomingDamage = Math.max(
      0,
      Number(pending.payload?.incomingDamage ?? 0),
    );
    const damageAfter = Math.floor(incomingDamage / 2);
    const damagePrevented = incomingDamage - damageAfter;
    const hpBefore = Number(pending.payload?.hpBefore ?? 0);
    const hpAfter = Math.max(0, hpBefore - damageAfter);
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) return { resolved: false, events };
    state.current_hp = hpAfter;
    if (hpAfter > 0) {
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
      source.dyingState = "none";
      source.isDefeated = false;
    }
    source.currentHp = hpAfter;
    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.charStates.save(state);
    await this.participants.save(source);
    events.push({
      event_type: "uncanny_dodge_resolved",
      actor_participant_id: sourceId,
      data: {
        triggerEventId,
        incomingDamage,
        damagePrevented,
        damageAfter,
        hpAfter,
        damageType: pending.payload?.damageType,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        incomingDamage,
        damagePrevented,
        damageAfter,
        hpAfter,
      },
    };
  }

  private async handleWildCompanion(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({
      where: { id: sourceId },
    });
    const encounterId = payload.encounterId;
    const options = payload.options ?? {};
    const nested = options.options as Record<string, unknown> | undefined;
    const form = String(
      options.form ?? options.familiarForm ?? nested?.form ?? "",
    );
    const resourceKind = String(
      options.resourceKind ?? nested?.resourceKind ?? "",
    );
    const slotLevel = Number(
      options.slotLevel ?? nested?.slotLevel ?? 0,
    );
    const allowedForms = new Set([
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
    ]);
    const fail = (error: string) => {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "wild-companion", error },
      });
      return {
        resolved: false,
        events,
        resolutionPayload: { error },
      };
    };

    if (
      !source?.characterId ||
      !encounterId
    ) {
      return fail("Não foi possível identificar o vínculo do Druida.");
    }
    if (!allowedForms.has(form)) {
      return fail("Escolha uma forma válida para o familiar.");
    }
    if (!["wild-shape", "spell-slot"].includes(resourceKind)) {
      return fail("Escolha um slot de magia ou um uso de Forma Selvagem.");
    }

    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) {
      return fail("Estado da ficha não encontrado.");
    }

    const classLevel = payload.caster?.classLevel ?? 2;
    const wildShapeMax = getWildShapeUses(
      classLevel,
      payload.caster?.is2024Rules !== false,
    );
    const wildShapeUsed = state.feature_uses_used?.["wild-shape"] ?? 0;
    if (resourceKind === "wild-shape" && wildShapeUsed >= wildShapeMax) {
      return fail("Não há usos de Forma Selvagem disponíveis.");
    }

    const slot = payload.caster?.spellSlots?.find(
      (candidate) =>
        candidate.level === slotLevel &&
        candidate.kind !== "pact",
    );
    const slotUsed =
      state.spell_slots_used?.[String(slotLevel)] ?? slot?.used ?? 0;
    if (
      resourceKind === "spell-slot" &&
      (!Number.isInteger(slotLevel) ||
        slotLevel < 1 ||
        !slot ||
        slotUsed >= slot.total)
    ) {
      return fail(`Não há slot de nível ${slotLevel || "?"} disponível.`);
    }

    try {
      const existingFamiliars = (
        await this.summoning.getSummonsOf(sourceId)
      ).filter(
        (candidate) =>
          candidate.appliedEffects?.some(
            (effect) =>
              effect.kind === "summon" &&
              (effect.metadata?.source ?? effect.refId) ===
                "find-familiar-spell",
          ) === true,
      );
      for (const existing of existingFamiliars) {
        const dismissed = await this.summoning.dismissSummon(
          existing.id,
          "form-change",
        );
        events.push(...dismissed.events);
      }

      const labels: Record<string, string> = {
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
      const summon = await this.summoning.spawnSummon(encounterId, {
        casterParticipantId: sourceId,
        monsterSlug: form,
        displayName: `Companheiro Selvagem — ${labels[form]}`,
        position:
          source.positionX != null && source.positionY != null
            ? { x: source.positionX + 1, y: source.positionY }
            : undefined,
        faction: source.faction ?? "ally",
        controlMode: "own-initiative",
        durationRoundsTotal: null,
        concentrationLinked: false,
        source: "find-familiar-spell",
        metadata: {
          familiarForm: form,
          familiarCreatureType: "fey",
          wildCompanion: true,
          expiresOnLongRest: true,
          cannotAttack: true,
          telepathyRangeFt: 100,
        },
      });

      if (resourceKind === "wild-shape") {
        state.feature_uses_used = {
          ...(state.feature_uses_used ?? {}),
          "wild-shape": wildShapeUsed + 1,
        };
      } else {
        state.spell_slots_used = {
          ...(state.spell_slots_used ?? {}),
          [String(slotLevel)]: slotUsed + 1,
        };
      }
      await this.charStates.save(state);

      events.push({
        event_type: "wild_companion_summoned",
        actor_participant_id: sourceId,
        target_participant_id: summon.id,
        data: {
          featureSlug: "wild-companion",
          summonId: summon.id,
          displayName: summon.displayName,
          familiarForm: form,
          familiarCreatureType: "fey",
          resourceKind,
          slotLevel:
            resourceKind === "spell-slot" ? slotLevel : undefined,
          wildShapeUsed:
            resourceKind === "wild-shape" ? wildShapeUsed + 1 : wildShapeUsed,
          wildShapeMax,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: {
          summonId: summon.id,
          displayName: summon.displayName,
          resourceKind,
          slotLevel:
            resourceKind === "spell-slot" ? slotLevel : undefined,
        },
      };
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Falha ao invocar o Companheiro Selvagem.",
      );
    }
  }

  private async handleFaithfulSteed(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({
      where: { id: sourceId },
    });
    const encounterId = payload.encounterId;
    const options = payload.options ?? {};
    const appearance = String(options.appearance ?? "") as SteedAppearance;
    const creatureType = String(
      options.creatureType ?? "",
    ) as SteedCreatureType;
    const resourceKind = String(options.resourceKind ?? "");
    const slotLevel = Number(options.slotLevel ?? 2);
    const allowedAppearances = new Set<SteedAppearance>([
      "horse",
      "camel",
      "dire-wolf",
      "elk",
    ]);
    const allowedCreatureTypes = new Set<SteedCreatureType>([
      "celestial",
      "fey",
      "fiend",
    ]);
    const fail = (error: string) => {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "faithful-steed", error },
      });
      return {
        resolved: false,
        events,
        resolutionPayload: { error },
      };
    };

    if (!source?.characterId || !encounterId) {
      return fail("Não foi possível identificar o vínculo do Paladino.");
    }
    if (!allowedAppearances.has(appearance)) {
      return fail("Escolha uma aparência válida para o corcel.");
    }
    if (!allowedCreatureTypes.has(creatureType)) {
      return fail("Escolha Celestial, Feérico ou Corruptor.");
    }
    if (!["free-cast", "spell-slot"].includes(resourceKind)) {
      return fail("Escolha a conjuração gratuita ou um slot de magia.");
    }

    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) return fail("Estado da ficha não encontrado.");

    const freeCastUsed =
      (state.feature_uses_used?.["faithful-steed-free-cast"] ?? 0) > 0;
    if (resourceKind === "free-cast" && freeCastUsed) {
      return fail(
        "A conjuração gratuita de Corcel Fiel já foi usada neste descanso longo.",
      );
    }

    const slot = payload.caster?.spellSlots?.find(
      (candidate) =>
        candidate.level === slotLevel && candidate.kind !== "pact",
    );
    const slotUsed =
      state.spell_slots_used?.[String(slotLevel)] ?? slot?.used ?? 0;
    if (
      resourceKind === "spell-slot" &&
      (!Number.isInteger(slotLevel) ||
        slotLevel < 2 ||
        !slot ||
        slotUsed >= slot.total)
    ) {
      return fail(`Não há slot de nível ${slotLevel || "?"} disponível.`);
    }

    const effectiveSlotLevel =
      resourceKind === "spell-slot" ? slotLevel : 2;
    const proficiencyBonus = payload.caster?.profBonus ?? 2;
    const charismaModifier = payload.caster?.abilityMods?.cha ?? 0;
    const spellAttackBonus = proficiencyBonus + charismaModifier;
    const spellSaveDc = 8 + spellAttackBonus;
    const statBlock = buildOtherworldlySteedStatBlock({
      appearance,
      creatureType,
      slotLevel: effectiveSlotLevel,
      spellAttackBonus,
      spellSaveDc,
    });
    const monsterSlugByAppearance: Record<SteedAppearance, string> = {
      horse: "warhorse",
      camel: "camel",
      "dire-wolf": "dire-wolf",
      elk: "elk",
    };
    const appearanceLabels: Record<SteedAppearance, string> = {
      horse: "Cavalo",
      camel: "Camelo",
      "dire-wolf": "Lobo Atroz",
      elk: "Alce",
    };
    const creatureTypeLabels: Record<SteedCreatureType, string> = {
      celestial: "Celestial",
      fey: "Feérico",
      fiend: "Corruptor",
    };

    try {
      const existingSteeds = (
        await this.summoning.getSummonsOf(sourceId)
      ).filter(
        (candidate) =>
          candidate.appliedEffects?.some(
            (effect) =>
              effect.kind === "summon" &&
              (effect.metadata?.source ?? effect.refId) ===
                "find-steed-spell",
          ) === true,
      );
      for (const existing of existingSteeds) {
        const dismissed = await this.summoning.dismissSummon(
          existing.id,
          "form-change",
        );
        events.push(...dismissed.events);
      }

      const summon = await this.summoning.spawnSummon(encounterId, {
        casterParticipantId: sourceId,
        monsterSlug: monsterSlugByAppearance[appearance],
        displayName: `Corcel Extraplanar — ${appearanceLabels[appearance]} ${creatureTypeLabels[creatureType]}`,
        position:
          source.positionX != null && source.positionY != null
            ? { x: source.positionX + 1, y: source.positionY }
            : undefined,
        faction: source.faction ?? "ally",
        controlMode: "own-initiative",
        durationRoundsTotal: null,
        concentrationLinked: false,
        source: "find-steed-spell",
        statBlock,
        metadata: {
          steedAppearance: appearance,
          steedCreatureType: creatureType,
          sharedInitiativeWithCaster: true,
          controlledMount: true,
          telepathyRangeFt: 5280,
          lifeBond: true,
        },
      });

      if (resourceKind === "free-cast") {
        state.feature_uses_used = {
          ...(state.feature_uses_used ?? {}),
          "faithful-steed-free-cast": 1,
        };
      } else {
        state.spell_slots_used = {
          ...(state.spell_slots_used ?? {}),
          [String(slotLevel)]: slotUsed + 1,
        };
      }
      await this.charStates.save(state);

      events.push({
        event_type: "faithful_steed_summoned",
        actor_participant_id: sourceId,
        target_participant_id: summon.id,
        data: {
          featureSlug: "faithful-steed",
          spellSlug: "find-steed",
          summonId: summon.id,
          displayName: summon.displayName,
          appearance,
          creatureType,
          resourceKind,
          slotLevel: effectiveSlotLevel,
          armorClass: statBlock.armorClass,
          maxHp: statBlock.maxHp,
          speed: statBlock.speed,
          flySpeed: statBlock.movementModes.fly ?? null,
          attackBonus: statBlock.attack.attackBonus,
          damageDice: statBlock.attack.damageDice,
          damageBonus: statBlock.attack.damageBonus,
          damageType: statBlock.attack.damageType,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: {
          summonId: summon.id,
          displayName: summon.displayName,
          resourceKind,
          slotLevel: effectiveSlotLevel,
          statBlock,
        },
      };
    } catch (error) {
      return fail(
        error instanceof Error
          ? error.message
          : "Falha ao invocar o Corcel Fiel.",
      );
    }
  }

  private async handleWildResurgence(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({
      where: { id: sourceId },
    });
    const options = payload.options ?? {};
    const direction = String(options.direction ?? "");
    const slotLevel = Number(options.slotLevel ?? 0);
    const fail = (error: string) => {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "wild-resurgence", error },
      });
      return {
        resolved: false,
        events,
        resolutionPayload: { error },
      };
    };
    if (!source?.characterId) {
      return fail("Não foi possível identificar a ficha do Druida.");
    }
    if (
      !["slot-to-wild-shape", "wild-shape-to-slot"].includes(direction)
    ) {
      return fail("Escolha uma conversão válida de Ressurgência Selvagem.");
    }
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) return fail("Estado da ficha não encontrado.");

    const classLevel = payload.caster?.classLevel ?? 5;
    const wildShapeMax = getWildShapeUses(
      classLevel,
      payload.caster?.is2024Rules !== false,
    );
    const wildShapeUsed = state.feature_uses_used?.["wild-shape"] ?? 0;

    if (direction === "slot-to-wild-shape") {
      if (wildShapeUsed < wildShapeMax) {
        return fail(
          "Só é possível recuperar Forma Selvagem quando não resta nenhum uso.",
        );
      }
      const alreadyUsedThisTurn = (source.effectInstances ?? []).some(
        (effect) =>
          String(effect.kind) ===
          "wild_resurgence_slot_to_wild_shape_used_turn",
      );
      if (alreadyUsedThisTurn) {
        return fail(
          "A conversão de slot em Forma Selvagem já foi usada neste turno.",
        );
      }
      const slot = payload.caster?.spellSlots?.find(
        (candidate) =>
          candidate.level === slotLevel && candidate.kind !== "pact",
      );
      const slotUsed =
        state.spell_slots_used?.[String(slotLevel)] ?? slot?.used ?? 0;
      if (
        !Number.isInteger(slotLevel) ||
        slotLevel < 1 ||
        !slot ||
        slotUsed >= slot.total
      ) {
        return fail(`Não há slot de nível ${slotLevel || "?"} disponível.`);
      }
      state.spell_slots_used = {
        ...(state.spell_slots_used ?? {}),
        [String(slotLevel)]: slotUsed + 1,
      };
      state.feature_uses_used = {
        ...(state.feature_uses_used ?? {}),
        "wild-shape": wildShapeUsed - 1,
      };
      source.effectInstances = [
        ...(source.effectInstances ?? []),
        {
          id: require("crypto").randomUUID(),
          kind: "wild_resurgence_slot_to_wild_shape_used_turn" as never,
          sourceFeatureSlug: "wild-resurgence",
          sourceCasterParticipantId: sourceId,
          payload: { slotLevel },
          expiresAt: { kind: "caster_turn_ends", value: 1 },
          requiresConcentration: false,
          appliedAt: new Date().toISOString(),
        },
      ];
      await this.charStates.save(state);
      await this.participants.save(source);
      events.push({
        event_type: "wild_resurgence_used",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "wild-resurgence",
          direction,
          slotLevel,
          wildShapeRemaining: 1,
          wildShapeMax,
          slotUsedAfter: slotUsed + 1,
          slotTotal: slot.total,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { direction, slotLevel },
      };
    }

    if (wildShapeUsed >= wildShapeMax) {
      return fail("Não há uso de Forma Selvagem disponível para converter.");
    }
    const recoveryUsed =
      state.feature_uses_used?.["wild-resurgence-slot-recovery"] ?? 0;
    if (recoveryUsed >= 1) {
      return fail(
        "A recuperação de slot por Ressurgência Selvagem já foi usada neste descanso longo.",
      );
    }
    const levelOneSlot = payload.caster?.spellSlots?.find(
      (candidate) => candidate.level === 1 && candidate.kind !== "pact",
    );
    const levelOneUsed =
      state.spell_slots_used?.["1"] ?? levelOneSlot?.used ?? 0;
    if (!levelOneSlot || levelOneUsed <= 0) {
      return fail("Nenhum slot de nível 1 está gasto.");
    }
    state.feature_uses_used = {
      ...(state.feature_uses_used ?? {}),
      "wild-shape": wildShapeUsed + 1,
      "wild-resurgence-slot-recovery": 1,
    };
    state.spell_slots_used = {
      ...(state.spell_slots_used ?? {}),
      "1": levelOneUsed - 1,
    };
    await this.charStates.save(state);
    events.push({
      event_type: "wild_resurgence_used",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "wild-resurgence",
        direction,
        slotLevel: 1,
        wildShapeRemaining: wildShapeMax - (wildShapeUsed + 1),
        wildShapeMax,
        slotUsedAfter: levelOneUsed - 1,
        slotTotal: levelOneSlot.total,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { direction, slotLevel: 1 },
    };
  }

  private async handleCunningStrike(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const targetId =
      (payload.options?.targetParticipantId as string | undefined) ??
      payload.targets?.[0];
    const choice = String(payload.options?.choice ?? "").toLowerCase();
    if (!source || !targetId) return { resolved: false, events };
    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "cunning_strike_pending" &&
        effect.payload?.requiredTargetId === targetId,
    );
    if (!pending) return { resolved: false, events };
    const allowed = pending.payload?.cunningStrikeOptions ?? [];
    if (!allowed.includes(choice)) return { resolved: false, events };

    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target) return { resolved: false, events };

    const rolls = [...(pending.payload?.sneakAttackRolls ?? [])];
    const diceCost = pending.payload?.sneakAttackCritical ? 2 : 1;
    const removedRolls = rolls.slice(Math.max(0, rolls.length - diceCost));
    const damageForgone = removedRolls.reduce((sum, roll) => sum + roll, 0);
    const hpAfterAttack = Number(
      pending.payload?.targetHpAfterAttack ?? target.currentHp ?? 0,
    );
    const restoredHp = Math.min(
      target.maxHp ?? hpAfterAttack + damageForgone,
      hpAfterAttack + damageForgone,
    );
    if (target.type === "pc" && target.characterId) {
      const targetState = await this.charStates.findOne({
        where: { character_id: target.characterId },
      });
      if (targetState) {
        targetState.current_hp = restoredHp;
        if (restoredHp > 0) {
          targetState.death_saves_success = 0;
          targetState.death_saves_fail = 0;
        }
        await this.charStates.save(targetState);
      }
    }
    target.currentHp = restoredHp;
    if (restoredHp > 0) {
      target.isDefeated = false;
      target.dyingState = "none";
    }

    const saveDc = payload.saveDc ?? 8;
    let saved: boolean | undefined;
    let applied = false;
    let blockedByImmunity = false;
    if (choice === "poison" || choice === "trip") {
      const ability = choice === "poison" ? "con" : "dex";
      const tooLarge =
        choice === "trip" &&
        ["huge", "gargantuan"].includes(
          String(target.monster?.size ?? "").toLowerCase(),
        );
      if (!tooLarge) {
        const modifier = this.getAbilityMod(target, ability);
        const roll = this.dice.roll(20);
        const total = roll + modifier;
        saved = total >= saveDc;
        events.push({
          event_type: "save_rolled",
          actor_participant_id: sourceId,
          target_participant_id: target.id,
          data: {
            source: `cunning-strike:${choice}`,
            ability,
            dc: saveDc,
            roll,
            modifier,
            total,
            success: saved,
          },
        });
        if (!saved) {
          const condition = choice === "poison" ? "poisoned" : "prone";
          const conditionResult = await this.conditionLifecycle.applyCondition(
            target,
            {
              slug: condition,
              appliedBy: sourceId,
              source: `feature:cunning-strike:${choice}`,
              sourceConcentration: false,
              saveAbility: choice === "poison" ? "con" : undefined,
              saveDc,
              repeatSaveTiming:
                choice === "poison" ? "end_of_turn" : "never",
              durationRoundsRemaining: choice === "poison" ? 10 : null,
            } as unknown as Parameters<
              typeof this.conditionLifecycle.applyCondition
            >[1],
          );
          events.push(...conditionResult.events);
          blockedByImmunity = conditionResult.events.some(
            (event) => event.event_type === "condition_blocked_by_immunity",
          );
          applied = !blockedByImmunity;
        }
      } else {
        saved = true;
      }
    } else if (choice === "withdraw") {
      const extraMovement = Math.floor((payload.caster?.speed ?? 30) / 2);
      source.movementRemaining =
        (source.movementRemaining ?? 0) + extraMovement;
      source.hasDisengaged = true;
      applied = true;
    } else if (choice === "stealth") {
      if (
        pending.payload?.wasHiddenBeforeAttack === true &&
        !(source.conditions ?? []).includes("hidden")
      ) {
        source.conditions = [...(source.conditions ?? []), "hidden"];
        applied = true;
      }
    }

    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participants.save(target);
    await this.participants.save(source);
    events.push({
      event_type: "cunning_strike_resolved",
      actor_participant_id: sourceId,
      target_participant_id: targetId,
      data: {
        choice,
        diceCost: 1,
        removedRolls,
        damageForgone,
        targetHpAfter: restoredHp,
        saveDc,
        saved,
        applied,
        blockedByImmunity,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        choice,
        damageForgone,
        targetHpAfter: restoredHp,
        saved,
        applied,
        blockedByImmunity,
      },
    };
  }




  private async handleFlurryOfBlows(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.bonusUnarmedAttacksRemainingThisTurn =
      (source.bonusUnarmedAttacksRemainingThisTurn ?? 0) + 2;
    source.effectInstances = [
      ...(source.effectInstances ?? []).filter(
        (effect) => effect.kind !== "open_hand_flurry_attacks",
      ),
      {
        id: `open-hand-flurry-${Date.now()}-${source.id}`,
        kind: "open_hand_flurry_attacks",
        sourceFeatureSlug: "flurry-of-blows",
        sourceCasterParticipantId: source.id,
        payload: { amount: 2 },
        expiresAt: { kind: "caster_turn_ends", value: 1 },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      },
    ];
    await this.participants.save(source);
    events.push({
      event_type: "flurry_of_blows_armed",
      actor_participant_id: sourceId,
      data: { extraAttacks: 2, focusPointsCost: 1 },
    });
    return { resolved: true, events, resolutionPayload: { extraAttacks: 2 } };
  }

  private async handleBonusUnarmedStrike(
    sourceId: string,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.bonusUnarmedAttacksRemainingThisTurn =
      (source.bonusUnarmedAttacksRemainingThisTurn ?? 0) + 1;
    await this.participants.save(source);
    events.push({
      event_type: "bonus_unarmed_strike_armed",
      actor_participant_id: sourceId,
      data: { extraAttacks: 1 },
    });
    return { resolved: true, events, resolutionPayload: { extraAttacks: 1 } };
  }

  private async handlePatientDefenseDisengage(
    sourceId: string,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.hasDisengaged = true;
    await this.participants.save(source);
    events.push({
      event_type: "patient_defense_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 0, disengaged: true, dodging: false },
    });
    return { resolved: true, events };
  }




  private async handlePatientDefense(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.dodgingUntilTurnOfParticipantId = sourceId;
    source.hasDisengaged = true;
    await this.participants.save(source);
    events.push({
      event_type: "patient_defense_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 1, dodgeUntil: sourceId, disengaged: true },
    });
    return { resolved: true, events };
  }




  private async handleStepOfTheWind(
    sourceId: string,
    _payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.hasDashed = true;
    source.hasDisengaged = true;
    if (source.movementRemaining != null) {
      source.movementRemaining *= 2;
    }
    await this.participants.save(source);
    events.push({
      event_type: "step_of_the_wind_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 1, dashed: true, disengaged: true },
    });
    return { resolved: true, events };
  }

  private async handleStepOfTheWindDash(
    sourceId: string,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    source.hasDashed = true;
    if (source.movementRemaining != null) {
      source.movementRemaining *= 2;
    }
    await this.participants.save(source);
    events.push({
      event_type: "step_of_the_wind_activated",
      actor_participant_id: sourceId,
      data: { focusPointsCost: 0, dashed: true, disengaged: false },
    });
    return { resolved: true, events };
  }

  private async handleDeflectAttacks(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({
      where: { id: sourceId },
    });
    const triggerEventId = payload.options?.triggerEventId as
      | string
      | undefined;
    if (!source || !source.characterId || !triggerEventId) {
      return { resolved: false, events };
    }

    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "deflect_attacks_pending" &&
        effect.payload?.triggerEventId === triggerEventId,
    );
    if (!pending) return { resolved: false, events };

    const incomingDamage = Number(pending.payload?.incomingDamage ?? 0);
    const hpBefore = Number(pending.payload?.hpBefore ?? 0);
    const dexterityModifier = payload.caster?.abilityMods?.dex ?? 0;
    const monkLevel = payload.caster?.classLevel ?? 3;
    const reductionRoll = this.dice.roll(10);
    const reductionTotal = Math.max(
      0,
      reductionRoll + dexterityModifier + monkLevel,
    );
    const damagePrevented = Math.min(incomingDamage, reductionTotal);
    const damageAfter = Math.max(0, incomingDamage - reductionTotal);
    const fullyDeflected = damageAfter === 0;
    const state = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!state) return { resolved: false, events };

    const hpAfter = Math.max(0, hpBefore - damageAfter);
    state.current_hp = hpAfter;
    if (hpAfter > 0) {
      state.death_saves_success = 0;
      state.death_saves_fail = 0;
      source.dyingState = "none";
      source.isDefeated = false;
    }

    let redirected = false;
    let redirectSaved: boolean | undefined;
    let redirectDamage = 0;
    let redirectTargetId: string | undefined;
    const redirectRequested =
      payload.options?.redirectToAttacker === true && fullyDeflected;
    const attackerId = pending.payload?.attackerParticipantId as
      | string
      | undefined;
    if (
      redirectRequested &&
      attackerId &&
      state.ki_points_used < monkLevel
    ) {
      const redirectTarget = await this.participants.findOne({
        where: { id: attackerId },
        relations: ["monster"],
      });
      const maximumRange = pending.payload?.isMeleeAttack === true ? 5 : 60;
      const distance =
        source.positionX != null &&
        source.positionY != null &&
        redirectTarget?.positionX != null &&
        redirectTarget.positionY != null
          ? Math.max(
              Math.abs(source.positionX - redirectTarget.positionX),
              Math.abs(source.positionY - redirectTarget.positionY),
            ) * 5
          : Number.POSITIVE_INFINITY;
      if (redirectTarget && !redirectTarget.isDefeated && distance <= maximumRange) {
        state.ki_points_used += 1;
        const dexteritySaveModifier = this.getAbilityMod(
          redirectTarget,
          "dex",
        );
        const saveRoll = this.dice.roll(20);
        const saveTotal = saveRoll + dexteritySaveModifier;
        const saveDc = payload.saveDc ?? 10;
        redirectSaved = saveTotal >= saveDc;
        redirectTargetId = redirectTarget.id;
        events.push({
          event_type: "save_rolled",
          target_participant_id: redirectTarget.id,
          data: {
            ability: "dex",
            dc: saveDc,
            roll: saveRoll,
            modifier: dexteritySaveModifier,
            total: saveTotal,
            success: redirectSaved,
            source: "deflect-attacks-redirect",
          },
        });

        if (!redirectSaved) {
          const martialArtsDie =
            monkLevel >= 17 ? 12 : monkLevel >= 11 ? 10 : monkLevel >= 5 ? 8 : 6;
          redirectDamage =
            this.dice.roll(martialArtsDie) +
            this.dice.roll(martialArtsDie) +
            dexterityModifier;
          if (redirectTarget.type === "pc" && redirectTarget.characterId) {
            const redirectState = await this.charStates.findOne({
              where: { character_id: redirectTarget.characterId },
            });
            if (redirectState) {
              redirectState.current_hp = Math.max(
                0,
                redirectState.current_hp - redirectDamage,
              );
              await this.charStates.save(redirectState);
              redirectTarget.currentHp = redirectState.current_hp;
              if (redirectState.current_hp === 0) {
                redirectTarget.dyingState = "dying";
              }
            }
          } else {
            redirectTarget.currentHp = Math.max(
              0,
              (redirectTarget.currentHp ?? 0) - redirectDamage,
            );
            redirectTarget.isDefeated = redirectTarget.currentHp === 0;
          }
          await this.participants.save(redirectTarget);
          events.push({
            event_type: "damage_applied",
            actor_participant_id: sourceId,
            target_participant_id: redirectTarget.id,
            data: {
              source: "deflect-attacks-redirect",
              type: pending.payload?.damageType ?? "bludgeoning",
              total: redirectDamage,
              finalDamage: redirectDamage,
            },
          });
        }
        redirected = true;
      }
    }

    source.currentHp = hpAfter;
    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.charStates.save(state);
    await this.participants.save(source);
    events.push({
      event_type: "deflect_attacks_resolved",
      actor_participant_id: sourceId,
      target_participant_id: redirectTargetId,
      data: {
        triggerEventId,
        incomingDamage,
        reductionRoll,
        dexterityModifier,
        monkLevel,
        reductionTotal,
        damagePrevented,
        damageAfter,
        hpAfter,
        fullyDeflected,
        redirected,
        redirectSaved,
        redirectDamage,
        damageType: pending.payload?.damageType,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        incomingDamage,
        reductionRoll,
        reductionTotal,
        damagePrevented,
        damageAfter,
        hpAfter,
        fullyDeflected,
        redirected,
        redirectSaved,
        redirectDamage,
      },
    };
  }





  private async handleStunningStrike(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const targetId =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target) return { resolved: false, events };
    const saveDc =
      payload.saveDc ??
      8 +
        (payload.caster?.profBonus ?? 2) +
        (payload.caster?.abilityMods?.wis ?? 0);
    const conMod = this.getAbilityMod(target, "con");
    const rolled = this.dice.roll(20);
    const total = rolled + conMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "con",
        dc: saveDc,
        rolled,
        modifier: conMod,
        total,
        success: saved,
        source: "stunning-strike",
      },
    });
    if (!saved) {
      const r = await this.conditionLifecycle.applyCondition(target, {
        slug: "stunned",
        appliedBy: sourceId,
        source: "feature:stunning-strike",
        sourceConcentration: false,
        saveAbility: "con",
        saveDc,
        repeatSaveTiming: "end_of_turn",
        durationRoundsRemaining: 1,
      } as unknown as Parameters<
        typeof this.conditionLifecycle.applyCondition
      >[1]);
      events.push(...r.events);
    } else {
      const slowed = await this.effectInstances.addEffect(target, {
        kind: "speed_multiplier",
        sourceFeatureSlug: "stunning-strike",
        sourceCasterParticipantId: sourceId,
        payload: { amount: 0.5 },
        expiresAt: { kind: "until_caster_turn", value: 1 },
        requiresConcentration: false,
      });
      events.push(...slowed.events);

      const exposed = await this.effectInstances.addEffect(target, {
        kind: "grant_advantage_to_attackers",
        sourceFeatureSlug: "stunning-strike",
        sourceCasterParticipantId: sourceId,
        payload: { consumeOn: "targeted_by_attack" },
        expiresAt: { kind: "until_caster_turn", value: 1 },
        requiresConcentration: false,
      });
      events.push(...exposed.events);
    }
    return {
      resolved: true,
      events,
      resolutionPayload: { saved, rolled, total, saveDc },
    };
  }

  private async handleOpenHandTechnique(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const targetId = payload.targets?.[0];
    if (!source || !targetId) return { resolved: false, events };
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target || target.isDefeated) return { resolved: false, events };

    const pending = (source.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "open_hand_technique_pending" &&
        effect.payload?.requiredTargetId === targetId,
    );
    if (!pending) return { resolved: false, events };
    source.effectInstances = (source.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participants.save(source);

    const technique = payload.featureSlug.replace(
      "open-hand-technique-",
      "",
    );
    if (technique === "addle") {
      const applied = await this.effectInstances.addEffect(target, {
        kind: "opportunity_attacks_blocked",
        sourceFeatureSlug: "open-hand-technique-addle",
        sourceCasterParticipantId: sourceId,
        payload: {},
        expiresAt: { kind: "until_target_turn", value: 1 },
        requiresConcentration: false,
      });
      events.push(...applied.events, {
        event_type: "open_hand_technique_resolved",
        actor_participant_id: sourceId,
        target_participant_id: targetId,
        data: { technique, opportunityAttacksBlocked: true },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: {
          technique,
          targetParticipantId: targetId,
          opportunityAttacksBlocked: true,
        },
      };
    }

    const saveAbility = technique === "push" ? "str" : "dex";
    const modifier = this.getAbilityMod(target, saveAbility);
    const rolled = this.dice.roll(20);
    const total = rolled + modifier;
    const saveDc = payload.saveDc ?? 10;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: saveAbility,
        dc: saveDc,
        roll: rolled,
        modifier,
        total,
        success: saved,
        source: payload.featureSlug,
      },
    });

    if (technique === "topple" && !saved) {
      const prone = await this.conditionLifecycle.applyCondition(target, {
        slug: "prone",
        appliedBy: sourceId,
        source: "feature:open-hand-technique-topple",
        sourceConcentration: false,
        durationRoundsRemaining: null,
      } as unknown as Parameters<
        typeof this.conditionLifecycle.applyCondition
      >[1]);
      events.push(...prone.events);
    }

    let forcedMovement:
      | {
          from: { x: number; y: number };
          to: { x: number; y: number };
          distanceFt: number;
        }
      | undefined;
    if (technique === "push" && !saved) {
      forcedMovement = await this.pushTargetAway(source, target, 15, events);
      if (forcedMovement) {
        events.push({
          event_type: "movement_forced",
          actor_participant_id: sourceId,
          target_participant_id: targetId,
          data: {
            sourceSpell: "Técnica da Mão Aberta: Empurrar",
            ...forcedMovement,
          },
        });
      }
    }

    events.push({
      event_type: "open_hand_technique_resolved",
      actor_participant_id: sourceId,
      target_participant_id: targetId,
      data: {
        technique,
        saved,
        saveAbility,
        saveDc,
        forcedMovement,
        proneApplied: technique === "topple" && !saved,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        technique,
        targetParticipantId: targetId,
        saved,
        saveAbility,
        saveDc,
        forcedMovement,
        proneApplied: technique === "topple" && !saved,
      },
    };
  }

  private async pushTargetAway(
    source: EncounterParticipantEntity,
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
    if (
      source.positionX == null ||
      source.positionY == null ||
      target.positionX == null ||
      target.positionY == null
    ) {
      return undefined;
    }
    const direction = {
      x: Math.sign(target.positionX - source.positionX),
      y: Math.sign(target.positionY - source.positionY),
    };
    if (direction.x === 0 && direction.y === 0) return undefined;

    const participants = await this.participants.find({
      where: { encounterId: target.encounterId },
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
    const cells = Math.max(1, Math.floor(maximumDistanceFt / 5));
    for (let step = 1; step <= cells; step += 1) {
      const candidate = {
        x: from.x + direction.x * step,
        y: from.y + direction.y * step,
      };
      if (
        candidate.x < 0 ||
        candidate.x >= 20 ||
        candidate.y < 0 ||
        candidate.y >= 20 ||
        occupied.has(`${candidate.x},${candidate.y}`)
      ) {
        break;
      }
      to = candidate;
    }

    target.positionX = to.x;
    target.positionY = to.y;
    await this.participants.save(target);
    if (this.persistentArea) {
      events.push(
        ...(await this.persistentArea.removeLocationBoundConditionsOutsideAreas(
          target,
          to,
        )),
      );
    }
    return {
      from,
      to,
      distanceFt:
        Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 5,
    };
  }




  private async handleDarkOnesBlessing(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const chaMod = payload.caster?.abilityMods?.cha ?? 0;
    const warlockLevel = payload.caster?.classLevel ?? 3;
    const tempHp = Math.max(1, chaMod + warlockLevel);




    if (source.characterId) {
      const st = await this.charStates.findOne({
        where: { character_id: source.characterId },
      });
      if (st) {
        st.temp_hp = Math.max(st.temp_hp ?? 0, tempHp);
        await this.charStates.save(st);
      }
    }
    source.tempHp = Math.max(source.tempHp ?? 0, tempHp);
    await this.participants.save(source);

    events.push({
      event_type: "dark_ones_blessing_granted",
      actor_participant_id: sourceId,
      data: { tempHp, chaMod, warlockLevel },
    });
    return { resolved: true, events, resolutionPayload: { tempHp } };
  }




  private async handleDarkOnesOwnLuck(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const rolled = this.dice.roll(10);
    events.push({
      event_type: "dark_ones_own_luck_rolled",
      actor_participant_id: sourceId,
      data: { bonus: rolled },
    });
    return { resolved: true, events, resolutionPayload: { bonus: rolled } };
  }






  private async handleBardicInspiration(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!target) return { resolved: false, events };

    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const bardLevel = payload.caster?.classLevel ?? 1;
    try {
      const res = await this.bard.grantBardicInspiration(
        sourceId,
        target,
        bardLevel,
      );
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: {
          dieSize: res.dieSize,
          targetParticipantId: target,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "bardic-inspiration", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleCuttingWords(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ?? (payload.targets?.[0] as string);
    if (!target) return { resolved: false, events };
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const bardLevel = payload.caster?.classLevel ?? 3;
    try {
      const res = await this.bard.applyCuttingWords(
        sourceId,
        target,
        bardLevel,
      );
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: {
          dieSize: res.dieSize,
          targetParticipantId: target,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "cutting-words", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleCountercharm(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const target =
      (opts.targetParticipantId as string) ??
      (payload.targets?.[0] as string) ??
      sourceId;
    try {
      const res = await this.bard.applyCountercharm(sourceId, target);
      events.push(...res.events);
      return {
        resolved: true,
        events,
        resolutionPayload: { targetParticipantId: target },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "countercharm", error: msg },
      });
      return { resolved: true, events };
    }
  }




  private async handleWildShape(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const sourceBeforeTransformation = await this.participants.findOne({
      where: { id: sourceId },
    });


    const nested = opts.options as Record<string, unknown> | undefined;
    const monsterSlug =
      (opts.monsterSlug as string) ??
      (opts.targetMonsterSlug as string) ??
      (nested?.monsterSlug as string | undefined) ??
      (nested?.targetMonsterSlug as string | undefined);
    if (!monsterSlug) {
      return { resolved: false, events };
    }
    const classLevel = payload.caster?.classLevel ?? 2;
    const isMoonDruid = payload.caster?.isMoonDruid === true;
    const is2024Rules = payload.caster?.is2024Rules !== false;
    const maxCr = getWildShapeMaxCr(classLevel, isMoonDruid);
    try {
      const updated = await this.transformation.enterForm(sourceId, {
        source: "wild-shape",
        monsterSlug,
        durationRoundsTotal: getWildShapeDurationRounds(classLevel),
        rulesMode: is2024Rules
          ? "xphb-wild-shape"
          : "legacy-form-hp",
        maxChallengeRating: maxCr,
        druidLevel: classLevel,
        wisdomModifier: payload.caster?.abilityMods?.wis ?? 0,
        isMoonDruid,
        originalMaxHp: payload.caster?.maxHp,
        originalWalkSpeed: payload.caster?.speed,
        retainedAbilities:
          classLevel >= 18
            ? [
                "mental-stats",
                "speech",
                "class-features",
                "spellcasting",
              ]
            : ["mental-stats", "speech", "class-features"],
        equipmentHandling: "merge",
        revertTriggers: {
          hpZero: !is2024Rules,
          durationEnd: true,
          playerDismiss: true,
          concentrationBroken: false,
        },
      });

      const form = updated.transformationState?.form;
      events.push({
        event_type: "wild_shape_entered",
        actor_participant_id: sourceId,
        data: {
          actorName: sourceBeforeTransformation?.displayName,
          monsterSlug,
          formName: form?.formName,
          maxHp: form?.maxHp,
          tempHp: form?.tempHp,
          ac: form?.ac,
          speed: form?.speed.walk,
          maxCr,
          rulesMode: updated.transformationState?.rulesMode,
        },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { transformedInto: form?.formName },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: { featureSlug: "wild-shape", error: msg },
      });
      return {
        resolved: false,
        events,
        resolutionPayload: { error: msg },
      };
    }
  }







  private async handleChannelDivinity(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const choice =
      (opts.choice as string) ?? (opts.variant as string) ?? "turn-undead";

    if (choice === "turn-undead") {

      return this.handleTurnUndead(sourceId, payload, events);
    }

    if (choice === "preserve-life") {


      const classLevel = payload.caster?.classLevel ?? 2;
      const pool = 5 * classLevel;
      const assignments = (opts.assignments as Record<string, number>) ?? {};
      let spent = 0;
      for (const [tid, amt] of Object.entries(assignments)) {
        if (amt <= 0 || spent + amt > pool) continue;
        const target = await this.participants.findOne({ where: { id: tid } });
        if (!target) continue;
        if (target.characterId) {
          const st = await this.charStates.findOne({
            where: { character_id: target.characterId },
          });
          if (st) {
            st.current_hp = st.current_hp + amt;
            await this.charStates.save(st);
          }
        } else {
          target.currentHp = Math.min(
            target.maxHp ?? 0,
            (target.currentHp ?? 0) + amt,
          );
          await this.participants.save(target);
        }
        spent += amt;
        events.push({
          event_type: "preserve_life_applied",
          actor_participant_id: sourceId,
          target_participant_id: tid,
          data: { amount: amt, poolRemaining: pool - spent },
        });
      }
      return {
        resolved: true,
        events,
        resolutionPayload: { poolSpent: spent, poolTotal: pool },
      };
    }

    if (choice === "harness-divine-power") {

      const classLevel = payload.caster?.classLevel ?? 2;
      const maxSlotLevel = Math.min(5, Math.floor(classLevel / 2));
      const slotLevel = Math.min((opts.slotLevel as number) ?? 1, maxSlotLevel);
      const source = await this.participants.findOne({
        where: { id: sourceId },
      });
      if (source?.characterId) {
        const st = await this.charStates.findOne({
          where: { character_id: source.characterId },
        });
        if (st) {
          const used =
            (st as unknown as { spell_slots?: Record<string, number> })
              .spell_slots ?? {};
          const key = `level${slotLevel}`;
          if (used[key] > 0) {
            used[key] -= 1;
            (
              st as unknown as { spell_slots?: Record<string, number> }
            ).spell_slots = used;
            await this.charStates.save(st);
            events.push({
              event_type: "harness_divine_power_used",
              actor_participant_id: sourceId,
              data: { slotLevelRegained: slotLevel },
            });
          }
        }
      }
      return { resolved: true, events };
    }


    return { resolved: false, events };
  }




  private async handleArcaneRecovery(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const opts = payload.options ?? {};
    const classLevel = payload.caster?.classLevel ?? 1;
    const budget = Math.ceil(classLevel / 2);
    const assignments = (opts.slotAssignments as Record<string, number>) ?? {
      level1: 1,
    };

    let spent = 0;
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source?.characterId) return { resolved: false, events };
    const st = await this.charStates.findOne({
      where: { character_id: source.characterId },
    });
    if (!st) return { resolved: false, events };

    const slots =
      (st as unknown as { spell_slots?: Record<string, number> }).spell_slots ??
      {};
    const regained: Record<string, number> = {};
    for (const [lvlKey, count] of Object.entries(assignments)) {
      const lvl = parseInt(lvlKey.replace("level", ""), 10);
      if (lvl > 5 || count <= 0) continue;
      const addBudget = lvl * count;
      if (spent + addBudget > budget) continue;
      const currentUsed = slots[lvlKey] ?? 0;
      const toRegain = Math.min(currentUsed, count);
      if (toRegain <= 0) continue;
      slots[lvlKey] = currentUsed - toRegain;
      regained[lvlKey] = toRegain;
      spent += lvl * toRegain;
    }
    (st as unknown as { spell_slots?: Record<string, number> }).spell_slots =
      slots;
    await this.charStates.save(st);

    events.push({
      event_type: "arcane_recovery_used",
      actor_participant_id: sourceId,
      data: { budgetSpent: spent, budgetTotal: budget, regained },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: { budgetSpent: spent, regained },
    };
  }




  private async handleDivineSense(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };
    const allInEncounter = await this.participants.find({
      where: { encounterId: source.encounterId },
      relations: ["monster"],
    });
    const px = source.positionX ?? 0;
    const py = source.positionY ?? 0;
    const detected: Array<{
      id: string;
      type: string;
      displayName: string;
      distance: number;
    }> = [];
    for (const p of allInEncounter) {
      if (p.id === source.id) continue;
      const mType = (p.monster as unknown as { type?: string })?.type ?? "";
      if (!/undead|celestial|fiend/i.test(mType)) continue;
      const dx = (p.positionX ?? 0) - px;
      const dy = (p.positionY ?? 0) - py;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      const ft = chebyshev * 5;
      if (ft <= 60) {
        detected.push({
          id: p.id,
          type: mType,
          displayName: p.displayName,
          distance: ft,
        });
      }
    }
    events.push({
      event_type: "divine_sense_detected",
      actor_participant_id: sourceId,
      data: { detected, rangeFt: 60 },
    });
    return { resolved: true, events, resolutionPayload: { detected } };
  }

  private async handleHealingHands(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    const targetId = payload.targets?.[0];
    const target = targetId
      ? await this.participants.findOne({ where: { id: targetId } })
      : null;
    if (!source || !target || source.encounterId !== target.encounterId) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        target_participant_id: targetId,
        data: {
          featureSlug: "healing-hands",
          error: "Escolha uma criatura válida para Mãos Curativas.",
        },
      });
      return { resolved: false, events };
    }

    const distanceFt =
      source.positionX == null ||
      source.positionY == null ||
      target.positionX == null ||
      target.positionY == null
        ? Number.POSITIVE_INFINITY
        : Math.max(
            Math.abs(source.positionX - target.positionX),
            Math.abs(source.positionY - target.positionY),
          ) * 5;
    if (distanceFt > 5) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        target_participant_id: target.id,
        data: {
          featureSlug: "healing-hands",
          error: `Mãos Curativas exige toque; o alvo está a ${distanceFt} pés.`,
        },
      });
      return { resolved: false, events };
    }

    const proficiencyBonus = Math.max(2, payload.caster?.profBonus ?? 2);
    const rolls = Array.from(
      { length: proficiencyBonus },
      () => this.dice.roll(4),
    );
    const rolled = rolls.reduce((sum, roll) => sum + roll, 0);
    const previousHp = target.characterId
      ? (
          await this.charStates.findOne({
            where: { character_id: target.characterId },
          })
        )?.current_hp ?? target.currentHp ?? 0
      : target.currentHp ?? 0;
    const maxHp = target.maxHp ?? previousHp;
    const healingApplied = Math.min(rolled, Math.max(0, maxHp - previousHp));
    if (healingApplied <= 0) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        target_participant_id: target.id,
        data: {
          featureSlug: "healing-hands",
          error: `${target.displayName} já está com os PV máximos.`,
        },
      });
      return { resolved: false, events };
    }

    const newHp = previousHp + healingApplied;
    if (target.characterId) {
      const state = await this.charStates.findOne({
        where: { character_id: target.characterId },
      });
      if (state) {
        state.current_hp = newHp;
        await this.charStates.save(state);
      }
    }
    target.currentHp = newHp;
    if (newHp > 0) {
      target.isDefeated = false;
      target.dyingState = "none";
    }
    await this.participants.save(target);

    events.push({
      event_type: "healing_hands_used",
      actor_participant_id: sourceId,
      target_participant_id: target.id,
      data: {
        featureSlug: "healing-hands",
        diceExpression: `${proficiencyBonus}d4`,
        rolls,
        rolled,
        healingApplied,
        previousHp,
        newHp,
        maxHp,
        distanceFt,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        targetId: target.id,
        diceExpression: `${proficiencyBonus}d4`,
        rolls,
        rolled,
        healingApplied,
        previousHp,
        newHp,
        maxHp,
      },
    };
  }

  private async handleCelestialRevelation(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const rawForm = String(payload.options?.form ?? "");
    const validForms = new Set([
      "heavenly-wings",
      "inner-radiance",
      "necrotic-shroud",
    ]);
    if (!validForms.has(rawForm)) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "celestial-revelation",
          error:
            "Escolha Asas Celestiais, Radiância Interior ou Manto Necrótico.",
        },
      });
      return { resolved: false, events };
    }
    const form = rawForm as
      | "heavenly-wings"
      | "inner-radiance"
      | "necrotic-shroud";
    if (
      (source.effectInstances ?? []).some(
        (effect) => effect.kind === "celestial_revelation",
      )
    ) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "celestial-revelation",
          error: "Revelação Celestial já está ativa.",
        },
      });
      return { resolved: false, events };
    }

    const proficiencyBonus = Math.max(2, payload.caster?.profBonus ?? 2);
    const charismaModifier = payload.caster?.abilityMods?.cha ?? 0;
    const saveDc = 8 + proficiencyBonus + charismaModifier;
    const durationRounds = 10;
    const damageType =
      form === "necrotic-shroud" ? "necrotic" : "radiant";
    const marker = await this.effectInstances.addEffect(source, {
      kind: "celestial_revelation",
      sourceFeatureSlug: "celestial-revelation",
      sourceCasterParticipantId: sourceId,
      payload: {
        form,
        extraDamageAmount: proficiencyBonus,
        damageType,
        saveDc,
        brightLightRadiusFt: form === "inner-radiance" ? 10 : undefined,
        dimLightRadiusFt: form === "inner-radiance" ? 20 : undefined,
      },
      expiresAt: { kind: "rounds", value: durationRounds },
      requiresConcentration: false,
    });
    events.push(...marker.events);

    let flightEffectId: string | null = null;
    if (form === "heavenly-wings") {
      const flight = await this.effectInstances.addEffect(source, {
        kind: "flight_speed",
        sourceFeatureSlug: "celestial-revelation",
        sourceCasterParticipantId: sourceId,
        payload: { amount: payload.caster?.speed ?? 30, form },
        expiresAt: { kind: "rounds", value: durationRounds },
        requiresConcentration: false,
      });
      flightEffectId = flight.effect.id;
      events.push(...flight.events);
    }

    const frightenedTargets: string[] = [];
    const saves: Array<{
      targetId: string;
      rolled: number;
      modifier: number;
      total: number;
      success: boolean;
    }> = [];
    if (form === "necrotic-shroud") {
      const participants = await this.participants.find({
        where: { encounterId: source.encounterId },
        relations: ["monster"],
      });
      for (const target of participants) {
        if (
          target.id === source.id ||
          target.faction === source.faction ||
          target.isDefeated ||
          source.positionX == null ||
          source.positionY == null ||
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

        const rolled = this.dice.roll(20);
        const modifier = this.getAbilityMod(target, "cha");
        const total = rolled + modifier;
        const success = total >= saveDc;
        saves.push({
          targetId: target.id,
          rolled,
          modifier,
          total,
          success,
        });
        events.push({
          event_type: "save_rolled",
          actor_participant_id: sourceId,
          target_participant_id: target.id,
          data: {
            ability: "cha",
            dc: saveDc,
            rolled,
            modifier,
            total,
            success,
            source: "celestial-revelation:necrotic-shroud",
          },
        });
        if (!success) {
          const condition =
            await this.conditionLifecycle.applyCondition(target, {
              slug: "frightened",
              appliedBy: sourceId,
              source: "feature:celestial-revelation",
              sourceConcentration: false,
              repeatSaveTiming: "never",
              durationRoundsRemaining: null,
            });
          events.push(...condition.events);
          if (condition.instance.durationRoundsRemaining !== 0) {
            frightenedTargets.push(target.id);
          }
        }
      }
      marker.effect.payload = {
        ...(marker.effect.payload ?? {}),
        frightenedTargetIds: frightenedTargets,
        fearSourceTurnsRemaining:
          frightenedTargets.length > 0 ? 2 : undefined,
      };
    }

    await this.participants.save(source);
    events.push({
      event_type: "celestial_revelation_activated",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "celestial-revelation",
        form,
        durationRounds,
        extraDamageAmount: proficiencyBonus,
        damageType,
        saveDc,
        flightSpeed:
          form === "heavenly-wings" ? payload.caster?.speed ?? 30 : null,
        frightenedTargets,
        saves,
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        form,
        durationRounds,
        markerEffectId: marker.effect.id,
        flightEffectId,
        extraDamageAmount: proficiencyBonus,
        damageType,
        saveDc,
        frightenedTargets,
        saves,
      },
    };
  }

  private async handleAbjureFoes(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({
      where: { id: sourceId },
    });
    if (!source) return { resolved: false, events };

    const charismaModifier = payload.caster?.abilityMods?.cha ?? 0;
    const maxTargets = Math.max(1, charismaModifier);
    const requestedTargetIds = Array.from(
      new Set((payload.targets ?? []).filter(Boolean)),
    );
    if (
      requestedTargetIds.length === 0 ||
      requestedTargetIds.length > maxTargets
    ) {
      events.push({
        event_type: "class_feature_error",
        actor_participant_id: sourceId,
        data: {
          featureSlug: "abjure-foes",
          error:
            requestedTargetIds.length === 0
              ? "Escolha ao menos um inimigo para Abjurar."
              : `Abjurar Inimigos permite no máximo ${maxTargets} alvo(s).`,
          maxTargets,
        },
      });
      return { resolved: false, events };
    }

    const targets = await this.participants.find({
      where: requestedTargetIds.map((id) => ({ id })),
      relations: ["monster"],
    });
    const targetsById = new Map(targets.map((target) => [target.id, target]));
    const validTargets: EncounterParticipantEntity[] = [];
    for (const targetId of requestedTargetIds) {
      const target = targetsById.get(targetId);
      const distanceFt =
        target &&
        source.positionX != null &&
        source.positionY != null &&
        target.positionX != null &&
        target.positionY != null
          ? Math.max(
              Math.abs(source.positionX - target.positionX),
              Math.abs(source.positionY - target.positionY),
            ) * 5
          : Number.POSITIVE_INFINITY;
      if (
        !target ||
        target.encounterId !== source.encounterId ||
        target.id === source.id ||
        target.faction === source.faction ||
        target.isDefeated ||
        distanceFt > 60
      ) {
        events.push({
          event_type: "class_feature_error",
          actor_participant_id: sourceId,
          target_participant_id: targetId,
          data: {
            featureSlug: "abjure-foes",
            error: "O alvo deve ser um inimigo ativo a até 60 pés.",
            distanceFt:
              Number.isFinite(distanceFt) ? distanceFt : null,
          },
        });
        return { resolved: false, events };
      }
      validTargets.push(target);
    }

    const saveDc = payload.saveDc ?? 8 + (payload.caster?.profBonus ?? 2) +
      charismaModifier;
    const results: Array<{
      targetId: string;
      rolled: number;
      modifier: number;
      total: number;
      success: boolean;
      conditionInstanceId?: string;
    }> = [];
    for (const target of validTargets) {
      const rolled = this.dice.roll(20);
      const modifier = this.getAbilityMod(target, "wis");
      const total = rolled + modifier;
      const success = total >= saveDc;
      events.push({
        event_type: "save_rolled",
        actor_participant_id: sourceId,
        target_participant_id: target.id,
        data: {
          ability: "wis",
          dc: saveDc,
          rolled,
          modifier,
          total,
          success,
          source: "abjure-foes",
        },
      });
      let conditionInstanceId: string | undefined;
      if (!success) {
        const applied = await this.conditionLifecycle.applyCondition(target, {
          slug: "frightened",
          appliedBy: sourceId,
          source: "feature:abjure-foes",
          sourceConcentration: false,
          repeatSaveTiming: "never",
          durationRoundsRemaining: 10,
        });
        events.push(...applied.events);
        if (applied.instance.durationRoundsRemaining !== 0) {
          conditionInstanceId = applied.instance.id;
        }
      }
      results.push({
        targetId: target.id,
        rolled,
        modifier,
        total,
        success,
        conditionInstanceId,
      });
    }

    events.push({
      event_type: "abjure_foes_resolved",
      actor_participant_id: sourceId,
      data: {
        featureSlug: "abjure-foes",
        saveDc,
        maxTargets,
        targets: results,
        frightenedTargetIds: results
          .filter((result) => Boolean(result.conditionInstanceId))
          .map((result) => result.targetId),
      },
    });
    return {
      resolved: true,
      events,
      resolutionPayload: {
        saveDc,
        maxTargets,
        results,
        frightenedTargetIds: results
          .filter((result) => Boolean(result.conditionInstanceId))
          .map((result) => result.targetId),
      },
    };
  }



  private async handleTurnUndead(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const saveDc = payload.saveDc ?? 10;
    const targets = payload.targets ?? [];
    const results: Array<{ targetId: string; rolled: number; saved: boolean }> =
      [];

    for (const tid of targets) {
      const target = await this.participants.findOne({
        where: { id: tid },
        relations: ["monster"],
      });
      if (!target) continue;

      const wisMod = this.getAbilityMod(target, "wis");
      const rolled = this.dice.roll(20);
      const total = rolled + wisMod;
      const saved = total >= saveDc;
      results.push({ targetId: tid, rolled, saved });
      events.push({
        event_type: "save_rolled",
        target_participant_id: tid,
        data: {
          ability: "wis",
          dc: saveDc,
          rolled,
          modifier: wisMod,
          total,
          success: saved,
          source: "turn-undead",
        },
      });
      if (!saved) {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: "frightened",
          appliedBy: sourceId,
          sourceSpell: "turn-undead",
          sourceConcentration: false,
          saveAbility: "wis",
          saveDc,
          repeatSaveTiming: "end_of_turn",
          durationRoundsRemaining: 10,
        });
        events.push(...r.events);
      }
    }

    return {
      resolved: true,
      events,
      resolutionPayload: { saves: results },
    };
  }

  private async handleRage(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const source = await this.participants.findOne({ where: { id: sourceId } });
    if (!source) return { resolved: false, events };

    const classLevel = payload.caster?.classLevel ?? 1;
    const rageDamage = this.getRageDamageByLevel(classLevel);


    const r1 = await this.effectInstances.addEffect(source, {
      kind: "damage_resistance",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { damageTypes: ["bludgeoning", "piercing", "slashing"] },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r1.events);


    const r2 = await this.effectInstances.addEffect(source, {
      kind: "self_advantage",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { scope: "str-check" },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r2.events);


    const r3 = await this.effectInstances.addEffect(source, {
      kind: "damage_bonus",
      sourceFeatureSlug: "rage",
      sourceCasterParticipantId: sourceId,
      payload: { amount: rageDamage, scope: "melee" },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    events.push(...r3.events);





    if (!(source.conditions ?? []).includes("raging")) {
      source.conditions = [...(source.conditions ?? []), "raging"];
      await this.participants.save(source);
    }

    return {
      resolved: true,
      events,
      resolutionPayload: {
        effectIds: [r1.effect.id, r2.effect.id, r3.effect.id],
        rageDamage,
      },
    };
  }

  private async handleGrapple(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, "str");
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "str",
        dc: saveDc,
        rolled,
        modifier: strMod,
        total,
        success: saved,
        source: "grapple",
      },
    });

    if (!saved) {
      const r = await this.conditionLifecycle.applyCondition(target, {
        slug: "grappled",
        appliedBy: sourceId,
        sourceSpell: null,
        sourceConcentration: false,
      });
      events.push(...r.events);
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, conditionInstanceId: r.instance.id },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }

  private async handleShove(
    sourceId: string,
    payload: ClassFeatureInvokedPayload,
    events: GameEventData[],
  ) {
    const targetId = payload.targets?.[0];
    if (!targetId) return { resolved: false, events };
    const target = await this.participants.findOne({
      where: { id: targetId },
      relations: ["monster"],
    });
    if (!target) return { resolved: false, events };

    const saveDc = payload.saveDc ?? 10;
    const strMod = this.getAbilityMod(target, "str");
    const rolled = this.dice.roll(20);
    const total = rolled + strMod;
    const saved = total >= saveDc;
    events.push({
      event_type: "save_rolled",
      target_participant_id: targetId,
      data: {
        ability: "str",
        dc: saveDc,
        rolled,
        modifier: strMod,
        total,
        success: saved,
        source: "shove",
      },
    });

    if (!saved) {
      const outcome =
        (payload.options?.outcome as string | undefined) ?? "prone";
      if (outcome === "prone" || outcome === "pending") {
        const r = await this.conditionLifecycle.applyCondition(target, {
          slug: "prone",
          appliedBy: sourceId,
          sourceSpell: null,
          sourceConcentration: false,
        });
        events.push(...r.events);
        return {
          resolved: true,
          events,
          resolutionPayload: {
            saved: false,
            outcome: "prone",
            conditionInstanceId: r.instance.id,
          },
        };
      }

      events.push({
        event_type: "movement_forced",
        target_participant_id: targetId,
        data: { source: "shove", distanceFt: 5, by: sourceId },
      });
      return {
        resolved: true,
        events,
        resolutionPayload: { saved: false, outcome: "push-5ft" },
      };
    }
    return { resolved: true, events, resolutionPayload: { saved: true } };
  }



  private getAbilityMod(
    p: EncounterParticipantEntity,
    ability: string,
  ): number {
    if (p.type === "monster" && p.monster) {
      const abilityProperty: Record<string, string> = {
        str: "strength",
        dex: "dexterity",
        con: "constitution",
        int: "intelligence",
        wis: "wisdom",
        cha: "charisma",
      };
      const property = abilityProperty[ability] ?? ability;
      const score =
        (p.monster as unknown as Record<string, number>)[property] ??
        (p.monster as any)?.stats?.[ability] ??
        10;
      return Math.floor((score - 10) / 2);
    }



    return 0;
  }

  private getRageDamageByLevel(level: number): number {

    if (level >= 16) return 4;
    if (level >= 9) return 3;
    return 2;
  }
}
