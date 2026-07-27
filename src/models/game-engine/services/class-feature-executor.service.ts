import { Injectable } from "@nestjs/common";
import { getSecondWindMaxUses } from "src/shared/fighter-rules";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import { canTakeReactionFromConditions } from "./condition-effects.service";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { EncounterService } from "./encounter.service";
import { EventService } from "./event.service";
import { DiceService } from "./dice.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";
import {
  CLASS_FEATURE_CATALOG,
  matchesClass,
  type FeatureSpec,
} from "./action-resolvers/class-feature-catalog";
import { GenericActionsService } from "./generic-actions.service";
import { ClassFeatureResolverService } from "./class-feature-resolver.service";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { findGiantAncestryChoice } from "src/shared/goliath-rules";
import { EncounterEndDetectorService } from "./encounter-end-detector.service";
import {
  abjureFoesChoiceError,
  chooseAbjureFoesTurnOption,
} from "./abjure-foes";
import { ConcentrationService } from "./concentration.service";

type RelentlessEnduranceAtomicOutcome =
  | {
      kind: "failure";
      result: GameResult<unknown>;
    }
  | {
      kind: "accepted" | "declined";
      events: GameEventData[];
      value: Record<string, unknown>;
    };

@Injectable()
export class ClassFeatureExecutorService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly encounterService: EncounterService,
    private readonly eventService: EventService,
    private readonly sheetService: CharacterSheetService,
    private readonly stateService: CharacterStateService,
    private readonly diceService: DiceService,
    private readonly genericActionsService: GenericActionsService,
    private readonly classFeatureResolver: ClassFeatureResolverService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    private readonly encounterEndDetector: EncounterEndDetectorService,
    private readonly concentration: ConcentrationService,
  ) {}


  async execute(
    encounterId: string,
    participantId: string,
    featureSlug: string,
    body: Record<string, unknown>,
    ownerUserId: string,
  ): Promise<GameResult<unknown>> {
    if (featureSlug.startsWith("cunning-action-")) {
      const subAction = featureSlug.slice("cunning-action-".length);
      featureSlug = "cunning-action";
      body = { ...body, subAction };
    }

    let spec = CLASS_FEATURE_CATALOG.find((s) => s.slug === featureSlug);
    if (!spec) {
      return failure(
        `Feature '${featureSlug}' nao esta catalogada.`,
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");
    }

    const participant = await this.encounterService
      .getParticipant(participantId)
      .catch(() => null);
    if (!participant) {
      return failure("Participante nao encontrado.", "PARTICIPANT_NOT_FOUND");
    }
    if (participant.type !== "pc" || !participant.characterId) {
      return failure("Feature ativavel apenas para PC.", "INVALID_PARTICIPANT");
    }

    const pcOwnerId = await this.resolveOwner(participant, ownerUserId);
    const sheet = await this.sheetService.computeSheet(
      pcOwnerId,
      participant.characterId,
    );
    if (
      sheet.source?.code === "PHB" &&
      (spec.slug === "divine-sense" || spec.slug === "lay-on-hands")
    ) {
      spec = { ...spec, actionCost: "action" };
    }
    if (
      ["moonlight-step", "moonlight-step-recover"].includes(spec.slug) &&
      !sheet.features.some(
        (feature) =>
          feature.active !== false &&
          /^moonlight-step-druid(?:-moon)?-\d+$/.test(feature.slug),
      )
    ) {
      return failure(
        "Passo ao Luar exige a característica do Círculo da Lua.",
        "PREREQUISITE_NOT_MET",
      );
    }
    if (
      spec.slug === "faithful-steed" &&
      !sheet.features.some(
        (feature) =>
          feature.active !== false &&
          /^faithful-steed-paladin-\d+$/.test(feature.slug),
      )
    ) {
      return failure(
        "Corcel Fiel exige a característica de Paladino de nível 5.",
        "PREREQUISITE_NOT_MET",
      );
    }


    const { matches, classLevel } = matchesClass(
      spec,
      sheet.classes.map((c) => ({ slug: c.slug, level: c.level })),
      undefined,
      sheet.race?.slug,
      sheet.totalLevel,
    );
    if (!matches) {
      return failure(
        spec.raceSlug
          ? `Feature '${featureSlug}' exige espécie ${spec.raceSlug}.`
          : `Feature '${featureSlug}' exige classe ${spec.classSlug}.`,
        "WRONG_CLASS",
      );
    }
    if (classLevel < spec.requiredLevel) {
      return failure(
        `Feature '${featureSlug}' exige nivel ${spec.requiredLevel} (atual ${classLevel}).`,
        "BELOW_REQUIRED_LEVEL",
      );
    }
    if (spec.requiredRaceTraitChoice) {
      const selectedChoice = findGiantAncestryChoice(
        sheet.originDetails?.raceTraitChoices,
      );
      if (selectedChoice !== spec.requiredRaceTraitChoice) {
        return failure(
          `Feature '${featureSlug}' não foi escolhida na Ancestralidade Gigante desta ficha.`,
          "PREREQUISITE_NOT_MET",
        );
      }
    }

    if (spec.slug === "relentless-endurance") {
      return this.resolveRelentlessEnduranceAtomically(
        encounter,
        participant.id,
        body.triggerEventId as string | undefined,
        body.decline === true,
      );
    }

    const is2024Rules = sheet.source?.code !== "PHB";

    if (
      ["fires-burn", "frosts-chill", "hills-tumble"].includes(spec.slug) &&
      body.decline === true
    ) {
      const targetParticipantId = body.targetParticipantId as
        | string
        | undefined;
      const pending = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "giant_ancestry_hit_pending" &&
          effect.sourceFeatureSlug === spec.slug &&
          effect.payload?.requiredTargetId === targetParticipantId,
      );
      if (!pending) {
        return failure(
          "A oportunidade da Ancestralidade Gigante não está mais disponível.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect) => effect.id !== pending.id,
      );
      await this.participantRepo.save(participant);
      const event: GameEventData = {
        event_type: "giant_ancestry_declined",
        actor_participant_id: participant.id,
        target_participant_id: targetParticipantId,
        data: { featureSlug: spec.slug, reactionConsumed: false },
      };
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);
      return success(
        { featureSlug: spec.slug, declined: true, resourceConsumed: false },
        [event],
      );
    }

    if (
      ["stones-endurance", "storms-thunder"].includes(spec.slug) &&
      body.decline === true
    ) {
      const triggerEventId = body.triggerEventId as string | undefined;
      const pending = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "giant_ancestry_reaction_pending" &&
          effect.sourceFeatureSlug === spec.slug &&
          effect.payload?.triggerEventId === triggerEventId,
      );
      if (!triggerEventId || !pending) {
        return failure(
          "A reação da Ancestralidade Gigante não está mais disponível.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect) => effect.id !== pending.id,
      );
      await this.participantRepo.save(participant);
      const event: GameEventData = {
        event_type: "giant_ancestry_declined",
        actor_participant_id: participant.id,
        data: {
          featureSlug: spec.slug,
          triggerEventId,
          reactionConsumed: false,
        },
      };
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);
      return success(
        { featureSlug: spec.slug, declined: true, reactionConsumed: false },
        [event],
      );
    }

    if (spec.slug === "deflect-attacks" && body.decline === true) {
      const triggerEventId = body.triggerEventId as string | undefined;
      const pendingTrigger = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "deflect_attacks_pending" &&
          effect.payload?.triggerEventId === triggerEventId,
      );
      if (!triggerEventId || !pendingTrigger) {
        return failure(
          "A oportunidade de Desviar Ataques não está mais disponível.",
          "FEATURE_NOT_AVAILABLE",
        );
      }

      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect) => effect.id !== pendingTrigger.id,
      );
      await this.participantRepo.save(participant);

      const event: GameEventData = {
        event_type: "deflect_attacks_declined",
        actor_participant_id: participant.id,
        data: {
          featureSlug: spec.slug,
          triggerEventId,
          reactionConsumed: false,
        },
      };
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

      return success(
        {
          featureSlug: spec.slug,
          declined: true,
          reactionConsumed: false,
        },
        [event],
      );
    }

    if (spec.slug === "uncanny-dodge" && body.decline === true) {
      const triggerEventId = body.triggerEventId as string | undefined;
      const pendingTrigger = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "uncanny_dodge_pending" &&
          effect.payload?.triggerEventId === triggerEventId,
      );
      if (!triggerEventId || !pendingTrigger) {
        return failure(
          "A oportunidade de Esquiva Sobrenatural não está mais disponível.",
          "FEATURE_NOT_AVAILABLE",
        );
      }

      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect) => effect.id !== pendingTrigger.id,
      );
      await this.participantRepo.save(participant);

      const event: GameEventData = {
        event_type: "uncanny_dodge_declined",
        actor_participant_id: participant.id,
        data: {
          featureSlug: spec.slug,
          triggerEventId,
          reactionConsumed: false,
        },
      };
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

      return success(
        {
          featureSlug: spec.slug,
          declined: true,
          reactionConsumed: false,
        },
        [event],
      );
    }

    if (spec.slug === "cunning-strike" && body.decline === true) {
      const targetParticipantId = body.targetParticipantId as
        | string
        | undefined;
      const pending = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "cunning_strike_pending" &&
          effect.payload?.requiredTargetId === targetParticipantId,
      );
      if (!pending) {
        return failure(
          "A oportunidade de Golpe Ardiloso não está mais disponível.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
      participant.effectInstances = (participant.effectInstances ?? []).filter(
        (effect) => effect.id !== pending.id,
      );
      await this.participantRepo.save(participant);
      const event: GameEventData = {
        event_type: "cunning_strike_declined",
        actor_participant_id: participant.id,
        target_participant_id: targetParticipantId,
        data: { featureSlug: spec.slug },
      };
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);
      return success({ featureSlug: spec.slug, declined: true }, [event]);
    }


    if (
      spec.slug === "adrenaline-rush" &&
      !canTakeReactionFromConditions(participant.conditions)
    ) {
      return failure(
        "A condição atual impede Adrenaline Rush.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (spec.actionCost === "reaction") {
      if (!canTakeReactionFromConditions(participant.conditions)) {
        return failure(
          "A condição atual impede reactions.",
          "CONDITION_PREVENTS_REACTION",
        );
      }
      if (participant.reactionsUsed > 0) {
        return failure("Reacao ja utilizada.", "REACTION_ALREADY_USED");
      }
    } else {
      const isOnTurn =
        encounter.turnOrder[encounter.currentTurnIndex] === participant.id;
      if (!isOnTurn) {
        return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
      }
      if (spec.actionCost === "action" && participant.actionUsed) {
        return failure("Acao ja utilizada.", "ACTION_ALREADY_USED");
      }
      if (spec.actionCost === "bonus" && participant.bonusActionUsed) {
        return failure("Acao bonus ja utilizada.", "BONUS_ACTION_ALREADY_USED");
      }
    }




    const usesKey = spec.usesSharedWith ?? spec.slug;
    const usesSource =
      spec.usesSharedWith !== undefined
        ? CLASS_FEATURE_CATALOG.find((s) => s.slug === spec.usesSharedWith)
        : spec;
    const maxUsesFormula = spec.maxUsesByLevel ?? usesSource?.maxUsesByLevel;
    const featureUses = await this.stateService.getFeatureUsesUsed(
      participant.characterId,
    );
    const used = featureUses[usesKey] ?? 0;
    let maxUses =
      maxUsesFormula !== undefined
        ? maxUsesFormula(classLevel)
        : Number.POSITIVE_INFINITY;
    if (usesKey === "wild-shape" && !is2024Rules) {
      maxUses = classLevel >= 20 ? Number.POSITIVE_INFINITY : 2;
    }

    if (usesKey === "second-wind") {
      maxUses = getSecondWindMaxUses(
        classLevel,
        sheet.source?.code !== "PHB",
      );
    }



    if (usesKey === "bardic-inspiration") {

      const chaMod =
        sheet.abilityScores.find(
          (a: { slug: string; modifier: number }) => a.slug === "cha",
        )?.modifier ?? 0;
      maxUses = Math.max(1, chaMod);
    }

    if (usesKey === "divine-sense") {
      const chaMod =
        sheet.abilityScores.find(
          (a: { slug: string; modifier: number }) => a.slug === "cha",
        )?.modifier ?? 0;
      maxUses = Math.max(1, 1 + chaMod);
    }


    if (spec.slug !== "lay-on-hands" && used >= maxUses) {
      return failure(
        `Sem usos restantes de '${usesKey}' (${used}/${maxUses}).`,
        "NO_USES_REMAINING",
      );
    }

    if (
      spec.slug === "stunning-strike" &&
      !body.targetParticipantId &&
      !(Array.isArray(body.targets) && body.targets.length > 0)
    ) {
      return failure(
        "Golpe Atordoante exige o alvo atingido.",
        "ACTION_SUBOPTION_REQUIRED",
      );
    }

    const isOpenHandTechnique = spec.slug.startsWith(
      "open-hand-technique-",
    );
    const openHandTargetId =
      (body.targetParticipantId as string | undefined) ??
      (Array.isArray(body.targets)
        ? (body.targets[0] as string | undefined)
        : undefined);
    if (isOpenHandTechnique && !openHandTargetId) {
      return failure(
        "A Técnica da Mão Aberta exige o alvo atingido pela Rajada.",
        "ACTION_SUBOPTION_REQUIRED",
      );
    }
    if (
      isOpenHandTechnique &&
      !(participant.effectInstances ?? []).some(
        (effect) =>
          effect.kind === "open_hand_technique_pending" &&
          effect.payload?.requiredTargetId === openHandTargetId,
      )
    ) {
      return failure(
        "A Técnica da Mão Aberta só pode ser aplicada após acertar um ataque concedido pela Rajada de Golpes.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    if (spec.slug === "deflect-attacks") {
      const triggerEventId = body.triggerEventId as string | undefined;
      const hasPendingTrigger = (participant.effectInstances ?? []).some(
        (effect) =>
          effect.kind === "deflect_attacks_pending" &&
          effect.payload?.triggerEventId === triggerEventId,
      );
      if (!triggerEventId || !hasPendingTrigger) {
        return failure(
          "Desviar Ataques só pode ser usado em resposta ao ataque que acabou de causar dano.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
    }

    if (spec.slug === "uncanny-dodge") {
      const triggerEventId = body.triggerEventId as string | undefined;
      const hasPendingTrigger = (participant.effectInstances ?? []).some(
        (effect) =>
          effect.kind === "uncanny_dodge_pending" &&
          effect.payload?.triggerEventId === triggerEventId,
      );
      if (!triggerEventId || !hasPendingTrigger) {
        return failure(
          "Esquiva Sobrenatural só pode ser usada em resposta ao ataque que acabou de acertar.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
    }

    if (
      spec.slug === "steady-aim" &&
      participant.movementRemaining != null &&
      participant.movementRemaining < (sheet.speed ?? 30)
    ) {
      return failure(
        "Mira Firme só pode ser usada antes de se mover neste turno.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    if (spec.slug === "cunning-strike") {
      const targetParticipantId = body.targetParticipantId as
        | string
        | undefined;
      const choice = String(body.choice ?? "").toLowerCase();
      const pending = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "cunning_strike_pending" &&
          effect.payload?.requiredTargetId === targetParticipantId,
      );
      if (
        !targetParticipantId ||
        !pending ||
        !(pending.payload?.cunningStrikeOptions ?? []).includes(choice)
      ) {
        return failure(
          "Golpe Ardiloso exige uma opção válida após aplicar Ataque Furtivo.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
    }
    if (spec.slug === "druid-hit-riders") {
      const targetParticipantId = body.targetParticipantId as
        | string
        | undefined;
      const pending = (participant.effectInstances ?? []).find(
        (effect) =>
          effect.kind === "druid_hit_rider_pending" &&
          effect.payload?.requiredTargetId === targetParticipantId,
      );
      if (!targetParticipantId || !pending) {
        return failure(
          "Os efeitos deste acerto do Druida não estão mais disponíveis.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
    }

    const spendsMonkFocus = [
      "flurry-of-blows",
      "patient-defense",
      "step-of-the-wind",
      "stunning-strike",
    ].includes(spec.slug);
    const reactionTriggerTurnParticipantId =
      spec.slug === "deflect-attacks" || spec.slug === "uncanny-dodge"
        ? (participant.effectInstances ?? []).find(
            (effect) =>
              effect.kind ===
                (spec.slug === "deflect-attacks"
                  ? "deflect_attacks_pending"
                  : "uncanny_dodge_pending") &&
              effect.payload?.triggerEventId === body.triggerEventId,
          )?.payload?.turnParticipantIdAtTrigger
        : undefined;
    if (
      spendsMonkFocus &&
      (!sheet.kiPoints ||
        sheet.kiPoints.used >= sheet.kiPoints.total)
    ) {
      return failure(
        "Sem pontos de Foco restantes.",
        "NO_USES_REMAINING",
      );
    }
    if (spec.actionCost === "action" || spec.actionCost === "bonus") {
      const abjureChoice = chooseAbjureFoesTurnOption(
        participant,
        spec.actionCost,
        `${encounter.currentRound}:${encounter.currentTurnIndex}`,
      );
      if (!abjureChoice.allowed) {
        return failure(
          abjureFoesChoiceError(abjureChoice.currentChoice),
          "CONDITION_PREVENTS_ACTION",
        );
      }
    }

    switch (spec.slug) {
      case "second-wind":
        return this.handleSecondWind(
          participant,
          classLevel,
          encounter,
          pcOwnerId,
        );
      case "action-surge":
        return this.handleActionSurge(participant, encounter);
      case "indomitable":
        return this.handleIndomitable(participant, classLevel, encounter);
      case "reckless-attack":
        return this.handleRecklessAttack(participant, encounter);
      case "lay-on-hands":
        return this.handleLayOnHands(
          participant,
          body,
          classLevel,
          encounter,
          pcOwnerId,
          spec.actionCost,
        );
      case "cunning-action":
        return this.handleCunningAction(
          participant,
          body,
          encounter,
          ownerUserId,
        );
      default:
        {
          const result = await this.handleStub(
            spec,
            participant,
            body,
            sheet,
            encounter,
          );
          const resolved =
            result.ok &&
            (result.value as { resolved?: boolean } | undefined)?.resolved ===
              true;
          if (resolved && spendsMonkFocus) {
            const spent = await this.stateService.spendKiPoints(
              participant.characterId,
              sheet.kiPoints?.total ?? classLevel,
              1,
            );
            if (!spent) {
              return failure(
                "Sem pontos de Foco restantes.",
                "NO_USES_REMAINING",
              );
            }
          }
          if (
            resolved &&
            (spec.slug === "deflect-attacks" ||
              spec.slug === "uncanny-dodge") &&
            reactionTriggerTurnParticipantId !== participant.id &&
            encounter.turnOrder[encounter.currentTurnIndex] === participant.id
          ) {
            const refreshedParticipant = await this.participantRepo.findOne({
              where: { id: participant.id },
            });
            if (refreshedParticipant) {
              refreshedParticipant.reactionsUsed = Math.max(
                0,
                refreshedParticipant.reactionsUsed - 1,
              );
              await this.participantRepo.save(refreshedParticipant);
            }
          }
          if (
            resolved &&
            (
              result.value as {
                resolutionPayload?: { targetDefeated?: boolean };
              }
            )?.resolutionPayload?.targetDefeated === true
          ) {
            try {
              await this.encounterEndDetector.tryAutoEnd(encounterId);
            } catch {
              // O rider já foi resolvido; a detecção de encerramento é best-effort.
            }
          }
          return result;
        }
    }
  }



  private async handleSecondWind(
    participant: EncounterParticipantEntity,
    fighterLevel: number,
    encounter: EncounterEntity,
    pcOwnerId: string,
  ): Promise<GameResult<unknown>> {

    const roll = this.diceService.rollExpression("1d10");
    const healAmount = roll.total + fighterLevel;
    const sheet = await this.sheetService.computeSheet(
      pcOwnerId,
      participant.characterId!,
    );
    const prevHp = sheet.currentHp ?? participant.currentHp ?? 0;



    const hpResult = await this.stateService.updateHp(
      pcOwnerId,
      participant.characterId!,
      { healing: healAmount },
    );
    const newHp = hpResult.currentHp;




    let tacticalShiftMoveFt = 0;
    if (fighterLevel >= 5) {
      const hasShift = (
        (
          sheet as unknown as {
            features?: Array<{ slug: string; active?: boolean }>;
          }
        ).features ?? []
      )
        .filter((f) => f.active !== false)
        .some((f) => f.slug.startsWith("tactical-shift"));
      if (hasShift) {
        tacticalShiftMoveFt = Math.floor((sheet.speed ?? 30) / 2);

        participant.movementRemaining =
          (participant.movementRemaining ?? 0) + tacticalShiftMoveFt;
      }
    }



    participant.currentHp = newHp;
    participant.bonusActionUsed = true;
    await this.participantRepo.save(participant);

    await this.stateService.incrementFeatureUses(
      participant.characterId!,
      "second-wind",
      1,
    );

    const event: GameEventData = {
      event_type: "class_feature_used",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "second-wind",
        healRoll: roll,
        healAmount,
        hpBefore: prevHp,
        hpAfter: newHp,
        tacticalShiftMoveFt,
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

    return success(
      {
        featureSlug: "second-wind",
        healRoll: roll,
        healAmount,
        hpBefore: prevHp,
        hpAfter: newHp,
        tacticalShiftMoveFt,
      },
      [event],
    );
  }

  private async handleActionSurge(
    participant: EncounterParticipantEntity,
    encounter: EncounterEntity,
  ): Promise<GameResult<unknown>> {

    participant.actionUsed = false;
    participant.attacksUsedThisTurn = 0;
    await this.participantRepo.save(participant);

    await this.stateService.incrementFeatureUses(
      participant.characterId!,
      "action-surge",
      1,
    );

    const event: GameEventData = {
      event_type: "class_feature_used",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "action-surge",
        actionReset: true,
        attacksReset: participant.attacksMaxThisTurn,
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

    return success(
      {
        featureSlug: "action-surge",
        actionReset: true,
        attacksAvailableAgain: participant.attacksMaxThisTurn,
      },
      [event],
    );
  }


  private async handleIndomitable(
    participant: EncounterParticipantEntity,
    fighterLevel: number,
    encounter: EncounterEntity,
  ): Promise<GameResult<unknown>> {
    participant.indomitableArmed = true;
    await this.participantRepo.save(participant);

    await this.stateService.incrementFeatureUses(
      participant.characterId!,
      "indomitable",
      1,
    );

    const event: GameEventData = {
      event_type: "class_feature_used",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "indomitable",
        armed: true,
        fighterLevelBonus: fighterLevel,
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

    return success(
      {
        featureSlug: "indomitable",
        armed: true,
        fighterLevelBonus: fighterLevel,
      },
      [event],
    );
  }

  private async handleRecklessAttack(
    participant: EncounterParticipantEntity,
    encounter: EncounterEntity,
  ): Promise<GameResult<unknown>> {
    participant.recklessAttackActive = true;
    await this.participantRepo.save(participant);

    const event: GameEventData = {
      event_type: "class_feature_used",
      actor_participant_id: participant.id,
      data: {
        featureSlug: "reckless-attack",
        recklessAttackActive: true,
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

    return success(
      { featureSlug: "reckless-attack", recklessAttackActive: true },
      [event],
    );
  }

  private async handleLayOnHands(
    paladin: EncounterParticipantEntity,
    body: Record<string, unknown>,
    paladinLevel: number,
    encounter: EncounterEntity,
    ownerUserId: string,
    actionCost: FeatureSpec["actionCost"],
  ): Promise<GameResult<unknown>> {
    const targetId = body.targetParticipantId as string | undefined;
    const hpAmount = Number(body.hpAmount ?? 0);
    const requestedConditions = Array.from(
      new Set(
        (Array.isArray(body.removeConditions) ? body.removeConditions : [])
          .map((condition) => String(condition).toLowerCase())
          .filter(Boolean),
      ),
    );
    if (
      !targetId ||
      !Number.isInteger(hpAmount) ||
      hpAmount < 0 ||
      (hpAmount === 0 && requestedConditions.length === 0)
    ) {
      return failure(
        "Lay on Hands exige um alvo e pelo menos 1 PV de cura ou uma condição para remover.",
        "INVALID_PAYLOAD",
      );
    }
    const baseRemovable = new Set(["poisoned"]);
    const restoringTouchRemovable = new Set([
      "blinded",
      "charmed",
      "deafened",
      "frightened",
      "paralyzed",
      "stunned",
    ]);
    const sheet = await this.sheetService.computeSheet(
      ownerUserId,
      paladin.characterId!,
    );
    const hasRestoringTouch =
      (sheet as unknown as { hasRestoringTouch?: boolean })
        .hasRestoringTouch === true;
    const invalidCondition = requestedConditions.find(
      (condition) =>
        !baseRemovable.has(condition) &&
        !(hasRestoringTouch && restoringTouchRemovable.has(condition)),
    );
    if (invalidCondition) {
      return failure(
        `Lay on Hands não pode remover '${invalidCondition}' neste nível.`,
        "INVALID_PAYLOAD",
      );
    }
    const poolMax = paladinLevel * 5;
    const featureUses = await this.stateService.getFeatureUsesUsed(
      paladin.characterId!,
    );
    const used = featureUses["lay-on-hands"] ?? 0;

    const target = await this.encounterService
      .getParticipant(targetId)
      .catch(() => null);
    if (!target) {
      return failure("Alvo nao encontrado.", "PARTICIPANT_NOT_FOUND");
    }
    const distanceFt =
      Math.max(
        Math.abs((paladin.positionX ?? 0) - (target.positionX ?? 0)),
        Math.abs((paladin.positionY ?? 0) - (target.positionY ?? 0)),
      ) * 5;
    if (distanceFt > 5) {
      return failure(
        `Lay on Hands exige toque; alvo está a ${distanceFt} pés.`,
        "OUT_OF_RANGE",
      );
    }
    const creatureType = String(target.monster?.type ?? "").toLowerCase();
    if (creatureType.includes("undead") || creatureType.includes("construct")) {
      return failure(
        "Lay on Hands não afeta Mortos-Vivos nem Constructos.",
        "INVALID_TARGET",
      );
    }
    const inactiveCondition = requestedConditions.find(
      (condition) => !(target.conditions ?? []).includes(condition),
    );
    if (inactiveCondition) {
      return failure(
        `O alvo não está sob a condição '${inactiveCondition}'.`,
        "INVALID_PAYLOAD",
      );
    }

    const conditionCost = requestedConditions.length * 5;
    const totalSpent = hpAmount + conditionCost;
    if (used + totalSpent > poolMax) {
      return failure(
        `Pool insuficiente: ${poolMax - used}/${poolMax} restantes.`,
        "LAY_ON_HANDS_INSUFFICIENT_POOL",
      );
    }

    const persistedTargetHp =
      target.type === "pc" && target.characterId
        ? await this.stateService.getCurrentHp(target.characterId)
        : null;
    const prevHp = persistedTargetHp ?? target.currentHp ?? 0;
    const maxHp = target.maxHp ?? prevHp + hpAmount;
    const missingHp = Math.max(0, maxHp - prevHp);
    if (hpAmount > missingHp) {
      return failure(
        `O alvo só perdeu ${missingHp} PV; reduza a cura para evitar gasto sem efeito.`,
        "INVALID_PAYLOAD",
      );
    }
    let newHp = prevHp;
    if (hpAmount > 0 && target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveOwner(target, ownerUserId);
      const hp = await this.stateService.updateHp(
        targetOwnerId,
        target.characterId,
        { healing: hpAmount },
      );
      newHp = hp.currentHp;
      target.currentHp = newHp;
    } else if (hpAmount > 0) {
      newHp = Math.min(prevHp + hpAmount, maxHp);
      target.currentHp = newHp;
    }

    const conditionEvents: GameEventData[] = [];
    for (const condition of requestedConditions) {
      const matching = (target.conditionInstances ?? []).filter(
        (instance) => instance.slug === condition,
      );
      for (const instance of matching) {
        const removed = await this.conditionLifecycle.removeConditionInstance(
          target,
          instance.id,
          "restoring_touch",
        );
        conditionEvents.push(...removed.events);
      }
      if (matching.length === 0) {
        target.conditions = (target.conditions ?? []).filter(
          (active) => active !== condition,
        );
      }
    }
    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveOwner(target, ownerUserId);
      await this.stateService.updateConditions(
        targetOwnerId,
        target.characterId,
        { conditions: target.conditions ?? [] },
      );
    }
    if (prevHp <= 0 && newHp > 0) {
      target.dyingState = "none";
      target.isDefeated = false;
      const revalidated = await this.conditionLifecycle.revalidateAfterHpChange(
        target,
        prevHp,
        newHp,
      );
      conditionEvents.push(...revalidated.events);
    }

    const actingParticipant =
      paladin.id === target.id ? target : paladin;
    if (actionCost === "action") actingParticipant.actionUsed = true;
    else actingParticipant.bonusActionUsed = true;
    await this.participantRepo.save(target);
    if (actingParticipant.id !== target.id) {
      await this.participantRepo.save(actingParticipant);
    }

    await this.stateService.incrementFeatureUses(
      paladin.characterId!,
      "lay-on-hands",
      totalSpent,
    );

    const event: GameEventData = {
      event_type: "class_feature_used",
      actor_participant_id: paladin.id,
      target_participant_id: targetId,
      data: {
        featureSlug: "lay-on-hands",
        hpApplied: hpAmount,
        hpBefore: prevHp,
        hpAfter: newHp,
        conditionsRemoved: requestedConditions,
        conditionCost,
        totalSpent,
        poolRemaining: poolMax - (used + totalSpent),
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [
      ...conditionEvents,
      event,
    ]);

    return success(
      {
        featureSlug: "lay-on-hands",
        target: targetId,
        hpApplied: hpAmount,
        hpBefore: prevHp,
        hpAfter: newHp,
        conditionsRemoved: requestedConditions,
        conditionCost,
        totalSpent,
        poolRemaining: poolMax - (used + totalSpent),
      },
      [...conditionEvents, event],
    );
  }

  private async handleCunningAction(
    rogue: EncounterParticipantEntity,
    body: Record<string, unknown>,
    encounter: EncounterEntity,
    ownerUserId: string,
  ): Promise<GameResult<unknown>> {
    const subAction = body.subAction as string | undefined;
    if (!subAction || !["dash", "disengage", "hide"].includes(subAction)) {
      return failure(
        "Cunning Action exige subAction='dash'|'disengage'|'hide'.",
        "ACTION_SUBOPTION_REQUIRED",
      );
    }
    if (rogue.bonusActionUsed) {
      return failure("Acao bonus ja utilizada.", "BONUS_ACTION_ALREADY_USED");
    }




    const prevActionUsed = rogue.actionUsed;
    rogue.actionUsed = false;
    await this.participantRepo.save(rogue);

    const result = await this.genericActionsService.execute(encounter.id, {
      participantId: rogue.id,
      kind: subAction as any,
      ownerUserId,
    } as any);


    const freshRogue = await this.participantRepo.findOne({
      where: { id: rogue.id },
    });
    if (freshRogue) {
      freshRogue.actionUsed = prevActionUsed;
      freshRogue.bonusActionUsed = true;
      await this.participantRepo.save(freshRogue);
    }

    if (!result.ok) return result;

    if (result.events.length > 0) {
      await this.eventService.emit(
        encounter.sessionId,
        encounter.id,
        result.events,
      );
    }

    return success(
      {
        featureSlug: "cunning-action",
        subAction,
        innerResult: result.value,
      },
      result.events,
    );
  }



  private async handleStub(
    spec: FeatureSpec,
    participant: EncounterParticipantEntity,
    body: Record<string, unknown>,
    sheet: Awaited<ReturnType<CharacterSheetService["computeSheet"]>>,
    encounter: EncounterEntity,
  ): Promise<GameResult<unknown>> {
    const spendAfterResolution =
      spec.slug === "wild-shape" ||
      spec.slug === "wild-companion" ||
      spec.slug === "faithful-steed" ||
      spec.slug === "wild-resurgence" ||
      spec.slug === "large-form" ||
      spec.slug === "large-form-end" ||
      spec.slug === "moonlight-step" ||
      spec.slug === "moonlight-step-recover" ||
      spec.slug === "druid-hit-riders" ||
      spec.slug === "healing-hands" ||
      spec.slug === "celestial-revelation" ||
      spec.slug === "abjure-foes" ||
      spec.slug === "adrenaline-rush" ||
      [
        "clouds-jaunt",
        "fires-burn",
        "frosts-chill",
        "hills-tumble",
        "stones-endurance",
        "storms-thunder",
      ].includes(spec.slug);
    if (!spendAfterResolution && spec.actionCost === "reaction") {
      participant.reactionsUsed = participant.reactionsUsed + 1;
    } else if (!spendAfterResolution && spec.actionCost === "action") {
      participant.actionUsed = true;
    } else if (!spendAfterResolution && spec.actionCost === "bonus") {
      participant.bonusActionUsed = true;
    }
    if (!spendAfterResolution) {
      await this.participantRepo.save(participant);
    }



    const incrementKey = spec.usesSharedWith ?? spec.slug;
    const sharedSource =
      spec.usesSharedWith !== undefined
        ? CLASS_FEATURE_CATALOG.find((s) => s.slug === spec.usesSharedWith)
        : undefined;
    const hasMaxUses =
      spec.maxUsesByLevel !== undefined ||
      sharedSource?.maxUsesByLevel !== undefined;
    if (hasMaxUses && !spendAfterResolution) {
      await this.stateService.incrementFeatureUses(
        participant.characterId!,
        incrementKey,
        1,
      );
    }

    const abilityMods = sheet.abilityScores.reduce<Record<string, number>>(
      (acc, a) => {
        acc[a.slug] = a.modifier;
        return acc;
      },
      {},
    );


    const primaryMod = this.primaryAbilityModForClass(
      spec.classSlug,
      abilityMods,
    );
    const saveDc = 8 + (sheet.proficiencyBonus ?? 2) + primaryMod;

    const targets =
      (body.targets as string[] | undefined) ??
      (body.targetParticipantId ? [body.targetParticipantId as string] : []);
    const invocationOptions = {
      ...this.extractOptions(body),
      ...(["clouds-jaunt", "moonlight-step"].includes(spec.slug)
        ? {
            gridColumns:
              encounter.mapData?.gridColumns ??
              encounter.mapData?.gridSize ??
              20,
            gridRows:
              encounter.mapData?.gridRows ??
              encounter.mapData?.gridSize ??
              20,
          }
        : {}),
    };

    const event: GameEventData = {
      event_type: "class_feature_invoked",
      actor_participant_id: participant.id,
      data: {
        featureSlug: spec.slug,
        actionCost: spec.actionCost,
        targets,
        options: invocationOptions,
        encounterId: encounter.id,
        saveDc,
        saveAbility: this.saveAbilityForFeature(spec.slug),
        caster: {
          abilityMods,
          profBonus: sheet.proficiencyBonus ?? 2,
          classSlug: spec.classSlug,
        },
        status: "emitted_pending_resolution",
      },
    };
    if (!spendAfterResolution) {
      await this.eventService.emit(encounter.sessionId, encounter.id, [event]);
    }



    const resolution = await this.classFeatureResolver.resolveInvocation(
      participant.id,
      {
        featureSlug: spec.slug,
        encounterId: encounter.id,
        actionCost: spec.actionCost,
        targets,
        options: invocationOptions,
        saveDc,
        saveAbility: this.saveAbilityForFeature(spec.slug) as any,
        caster: {
          abilityMods,
          profBonus: sheet.proficiencyBonus ?? 2,
          classSlug: spec.classSlug,
          classLevel: spec.raceSlug
            ? sheet.totalLevel
            : this.getClassLevel(sheet, spec.classSlug),
          speed: sheet.speed ?? 30,
          is2024Rules: sheet.source?.code !== "PHB",
          isMoonDruid: sheet.classes.some(
            (characterClass: any) =>
              characterClass.slug?.replace(/-phb$|-xphb$/, "") === "druid" &&
              /moon/.test(characterClass.subclass?.slug ?? ""),
          ),
          currentHp: sheet.currentHp,
          maxHp: sheet.maxHp,
          spellSlots: sheet.spellSlots,
        },
      },
    );
    if (
      !resolution.resolved &&
      (spec.slug === "wild-shape" ||
        spec.slug === "wild-companion" ||
        spec.slug === "faithful-steed" ||
        spec.slug === "wild-resurgence" ||
        spec.slug === "large-form" ||
        spec.slug === "large-form-end" ||
        spec.slug === "moonlight-step" ||
        spec.slug === "moonlight-step-recover" ||
        spec.slug === "druid-hit-riders" ||
        spec.slug === "healing-hands" ||
        spec.slug === "celestial-revelation" ||
        spec.slug === "abjure-foes" ||
        spec.slug === "adrenaline-rush" ||
        [
          "clouds-jaunt",
          "fires-burn",
          "frosts-chill",
          "hills-tumble",
          "stones-endurance",
          "storms-thunder",
        ].includes(spec.slug))
    ) {
      const errorEvent = resolution.events.find(
        (candidate) => candidate.event_type === "class_feature_error",
      );
      const fallbackErrors: Record<string, string> = {
        "wild-shape": "A Forma Selvagem não pôde ser aplicada.",
        "wild-companion": "O Companheiro Selvagem não pôde ser invocado.",
        "faithful-steed": "O Corcel Fiel não pôde ser invocado.",
        "wild-resurgence": "A Ressurgência Selvagem não pôde ser aplicada.",
        "large-form": "A Forma Grande não pôde ser aplicada.",
        "large-form-end": "A Forma Grande não está ativa.",
        "moonlight-step": "O destino do Passo ao Luar é inválido.",
        "moonlight-step-recover":
          "Não foi possível recuperar um uso de Passo ao Luar.",
        "druid-hit-riders":
          "Os efeitos deste acerto do Druida não estão mais disponíveis.",
        "healing-hands": "Mãos Curativas não pôde ser aplicada.",
        "celestial-revelation":
          "Revelação Celestial não pôde ser ativada.",
        "abjure-foes":
          "Abjurar Inimigos exige ao menos um alvo hostil válido a até 60 pés.",
        "adrenaline-rush":
          "Adrenaline Rush não pôde ser aplicada.",
        "clouds-jaunt": "O destino do Salto das Nuvens é inválido.",
        "fires-burn": "A oportunidade da Queimadura do Fogo expirou.",
        "frosts-chill": "A oportunidade do Calafrio do Gelo expirou.",
        "hills-tumble": "A oportunidade da Queda da Colina expirou.",
        "stones-endurance": "A reação de Resistência da Pedra expirou.",
        "storms-thunder": "A reação de Trovão da Tempestade expirou.",
      };
      const error =
        (errorEvent?.data?.error as string | undefined) ??
        fallbackErrors[spec.slug] ??
        `A feature '${spec.slug}' não pôde ser aplicada.`;
      return failure(
        error,
        spec.slug === "wild-shape"
          ? "WILD_SHAPE_REJECTED"
          : "FEATURE_NOT_AVAILABLE",
      );
    }
    if (
      resolution.resolved &&
      spendAfterResolution &&
      spec.actionCost !== "free"
    ) {
      const participantAfterResolution =
        (await this.participantRepo.findOne({
          where: { id: participant.id },
        })) ?? participant;
      if (spec.actionCost === "reaction") {
        participantAfterResolution.reactionsUsed += 1;
      } else if (spec.actionCost === "action") {
        participantAfterResolution.actionUsed = true;
      } else if (spec.actionCost === "bonus") {
        participantAfterResolution.bonusActionUsed = true;
      }
      await this.participantRepo.save(participantAfterResolution);
    }
    if (
      resolution.resolved &&
      spendAfterResolution &&
      hasMaxUses &&
      resolution.resolutionPayload?.resourceConsumed !== false
    ) {
      await this.stateService.incrementFeatureUses(
        participant.characterId!,
        incrementKey,
        1,
      );
    }
    if (resolution.resolved && spendAfterResolution) {
      await this.eventService.emit(
        encounter.sessionId,
        encounter.id,
        [event, ...resolution.events],
      );
    } else if (resolution.resolved && resolution.events.length > 0) {
      await this.eventService.emit(
        encounter.sessionId,
        encounter.id,
        resolution.events,
      );
    }

    return success(
      {
        featureSlug: spec.slug,
        deferred: !resolution.resolved,
        resolved: resolution.resolved,
        saveDc,
        status: resolution.resolved ? "resolved" : "emitted_pending_resolution",
        resolutionPayload: resolution.resolutionPayload,
      },
      [event, ...resolution.events],
    );
  }


  private getClassLevel(sheet: any, classSlug?: string): number {
    if (!classSlug || !sheet?.classes) return 1;
    const cls = sheet.classes.find((c: any) =>
      (c.slug ?? c.name ?? "")
        .toLowerCase()
        .startsWith(classSlug.toLowerCase()),
    );
    return cls?.level ?? 1;
  }



  private async resolveOwner(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<string> {


    const character = participant.character;
    if (character && (character as any).userId) {
      return (character as any).userId;
    }
    return ownerUserId;
  }

  private async resolveRelentlessEnduranceAtomically(
    encounter: EncounterEntity,
    participantId: string,
    triggerEventId: string | undefined,
    decline: boolean,
  ): Promise<GameResult<unknown>> {
    if (!triggerEventId) {
      return failure(
        "A oportunidade de Relentless Endurance não está mais disponível.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    const outcome = await this.participantRepo.manager.transaction(
      async (manager): Promise<RelentlessEnduranceAtomicOutcome> => {
        const participantRepo = manager.getRepository(
          EncounterParticipantEntity,
        );
        const stateRepo = manager.getRepository(CharacterStateEntity);
        const participant = await participantRepo.findOne({
          where: { id: participantId, encounterId: encounter.id },
          lock: { mode: "pessimistic_write" },
        });
        if (!participant?.characterId) {
          return {
            kind: "failure",
            result: failure(
              "Participante não encontrado.",
              "PARTICIPANT_NOT_FOUND",
            ),
          };
        }

        const pending = (participant.effectInstances ?? []).find(
          (effect) =>
            effect.kind === "relentless_endurance_pending" &&
            effect.payload?.triggerEventId === triggerEventId,
        );
        if (!pending) {
          return {
            kind: "failure",
            result: failure(
              "A oportunidade de Relentless Endurance não está mais disponível.",
              "FEATURE_NOT_AVAILABLE",
            ),
          };
        }

        const explicitDeadline =
          typeof pending.payload?.decisionDeadlineAt === "string"
            ? Date.parse(pending.payload.decisionDeadlineAt)
            : Number.NaN;
        const appliedAt = Date.parse(pending.appliedAt ?? "");
        const rawTimeout = Number(pending.payload?.timeoutSeconds ?? 20);
        const timeoutSeconds = Number.isFinite(rawTimeout)
          ? Math.max(0, Math.floor(rawTimeout))
          : 20;
        const deadlineMs = Number.isFinite(explicitDeadline)
          ? explicitDeadline
          : Number.isFinite(appliedAt)
            ? appliedAt + timeoutSeconds * 1_000
            : 0;
        const timedOut = Date.now() >= deadlineMs;

        const state = await stateRepo.findOne({
          where: { character_id: participant.characterId },
          lock: { mode: "pessimistic_write" },
        });
        const canResolve =
          state?.current_hp === 0 &&
          participant.dyingState === "dying" &&
          participant.isDefeated !== true;
        const uses =
          state?.feature_uses_used?.["relentless-endurance"] ?? 0;
        const noUsesRemaining = canResolve && !decline && uses >= 1;
        const effectiveDecline =
          decline || timedOut || noUsesRemaining;

        const effectsToRemove = canResolve
          ? [pending]
          : (participant.effectInstances ?? []).filter(
              (effect) =>
                effect.kind === "relentless_endurance_pending",
            );
        const effectExpiredEvents: GameEventData[] =
          effectsToRemove.map((effect) => ({
            event_type: "effect_expired",
            target_participant_id: participant.id,
            data: {
              effectId: effect.id,
              reason: canResolve
                ? effectiveDecline
                  ? timedOut
                    ? "duration"
                    : "manual"
                  : "consumed"
                : "manual",
              kind: effect.kind,
              sourceSpellSlug: effect.sourceSpellSlug,
              sourceFeatureSlug: effect.sourceFeatureSlug,
              payload: effect.payload,
            },
          }));
        participant.effectInstances = (
          participant.effectInstances ?? []
        ).filter(
          (effect) =>
            !effectsToRemove.some(
              (removed) => removed.id === effect.id,
            ),
        );

        if (!state || !canResolve) {
          await participantRepo.save(participant);
          await this.eventService.emit(
            encounter.sessionId,
            encounter.id,
            effectExpiredEvents,
            manager,
          );
          return {
            kind: "failure",
            result: failure(
              "A oportunidade de Relentless Endurance não está mais disponível.",
              "FEATURE_NOT_AVAILABLE",
            ),
          };
        }

        if (effectiveDecline) {
          await participantRepo.save(participant);
          const events: GameEventData[] = [
            ...effectExpiredEvents,
            {
              event_type: "relentless_endurance_declined",
              actor_participant_id: participant.id,
              target_participant_id: participant.id,
              data: {
                featureSlug: "relentless-endurance",
                triggerEventId,
                resourceConsumed: false,
                hpAfter: 0,
                dyingState: "dying",
                reason: timedOut
                  ? "decision-timeout"
                  : noUsesRemaining
                    ? "no-uses-remaining"
                    : "declined",
              },
            },
            {
              event_type: "fell_unconscious",
              target_participant_id: participant.id,
              data: {
                dyingState: "dying",
                sourceFeatureSlug: "relentless-endurance",
              },
            },
          ];
          if (participant.isConcentrating) {
            const broken = await this.concentration.break(
              participant,
              "incapacitated",
              manager,
            );
            events.push(...broken.events);
          }
          await this.eventService.emit(
            encounter.sessionId,
            encounter.id,
            events,
            manager,
          );
          return {
            kind: "declined",
            events,
            value: {
              featureSlug: "relentless-endurance",
              declined: true,
              timedOut,
              unavailable: noUsesRemaining,
              reactionConsumed: false,
              resourceConsumed: false,
              hpAfter: 0,
            },
          };
        }

        state.current_hp = 1;
        state.death_saves_success = 0;
        state.death_saves_fail = 0;
        state.conditions = (state.conditions ?? []).filter(
          (condition) =>
            !["dying", "unconscious", "dead"].includes(condition),
        );
        state.feature_uses_used = {
          ...(state.feature_uses_used ?? {}),
          "relentless-endurance": uses + 1,
        };
        participant.currentHp = 1;
        participant.dyingState = "none";
        participant.isDefeated = false;
        participant.conditions = (participant.conditions ?? []).filter(
          (condition) =>
            !["dying", "unconscious", "dead"].includes(condition),
        );
        participant.conditionInstances = (
          participant.conditionInstances ?? []
        ).filter(
          (condition) =>
            !["dying", "unconscious", "dead"].includes(
              condition.slug,
            ),
        );
        await stateRepo.save(state);
        await participantRepo.save(participant);

        const invoked: GameEventData = {
          event_type: "class_feature_invoked",
          actor_participant_id: participant.id,
          data: {
            featureSlug: "relentless-endurance",
            actionCost: "free",
            targets: [],
            options: { triggerEventId },
            encounterId: encounter.id,
            status: "emitted_pending_resolution",
          },
        };
        const triggered: GameEventData = {
          event_type: "class_feature_triggered",
          actor_participant_id: participant.id,
          target_participant_id: participant.id,
          data: {
            featureSlug: "relentless-endurance",
            triggerEventId,
            hpBefore: 0,
            hpAfter: 1,
            resourceConsumed: true,
          },
        };
        const events = [invoked, ...effectExpiredEvents, triggered];
        await this.eventService.emit(
          encounter.sessionId,
          encounter.id,
          events,
          manager,
        );
        return {
          kind: "accepted",
          events,
          value: {
            featureSlug: "relentless-endurance",
            deferred: false,
            resolved: true,
            status: "resolved",
            resolutionPayload: {
              triggerEventId,
              hpBefore: 0,
              hpAfter: 1,
              resourceConsumed: true,
            },
          },
        };
      },
    );

    if (outcome.kind === "failure") return outcome.result;
    return success(outcome.value, outcome.events);
  }

  private extractOptions(
    body: Record<string, unknown>,
  ): Record<string, unknown> {

    const { participantId, kind, ownerUserId, ...rest } = body as any;
    return rest;
  }

  private primaryAbilityModForClass(
    classSlug: string | undefined,
    mods: Record<string, number>,
  ): number {
    const map: Record<string, string> = {
      cleric: "wis",
      druid: "wis",
      ranger: "wis",
      bard: "cha",
      paladin: "cha",
      sorcerer: "cha",
      warlock: "cha",
      wizard: "int",
      rogue: "dex",
      fighter: "str",
      barbarian: "str",
      monk: "wis",
    };
    const ability = (classSlug ? map[classSlug] : undefined) ?? "str";
    return mods[ability] ?? 0;
  }

  private saveAbilityForFeature(slug: string): string | undefined {
    const map: Record<string, string> = {
      "channel-divinity": "wis",
      "wild-shape": "wis",
      "bardic-inspiration": undefined as unknown as string,
      "cunning-strike": "con",
      "open-hand-technique-push": "str",
      "open-hand-technique-topple": "dex",
    };
    return map[slug];
  }
}
