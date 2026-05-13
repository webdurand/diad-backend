import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
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
  ) {}


  async execute(
    encounterId: string,
    participantId: string,
    featureSlug: string,
    body: Record<string, unknown>,
    ownerUserId: string,
  ): Promise<GameResult<unknown>> {
    const spec = CLASS_FEATURE_CATALOG.find((s) => s.slug === featureSlug);
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


    const { matches, classLevel } = matchesClass(
      spec,
      sheet.classes.map((c) => ({ slug: c.slug, level: c.level })),
    );
    if (!matches) {
      return failure(
        `Feature '${featureSlug}' exige classe ${spec.classSlug}.`,
        "WRONG_CLASS",
      );
    }
    if (classLevel < spec.requiredLevel) {
      return failure(
        `Feature '${featureSlug}' exige nivel ${spec.requiredLevel} (atual ${classLevel}).`,
        "BELOW_REQUIRED_LEVEL",
      );
    }


    if (spec.actionCost === "reaction") {
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



    if (usesKey === "bardic-inspiration") {

      const chaMod =
        sheet.abilityScores.find(
          (a: { slug: string; modifier: number }) => a.slug === "cha",
        )?.modifier ?? 0;
      maxUses = Math.max(1, chaMod);
    }


    if (spec.slug !== "lay-on-hands" && used >= maxUses) {
      return failure(
        `Sem usos restantes de '${usesKey}' (${used}/${maxUses}).`,
        "NO_USES_REMAINING",
      );
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
          ownerUserId,
        );
      case "cunning-action":
        return this.handleCunningAction(
          participant,
          body,
          encounter,
          ownerUserId,
        );
      default:

        return this.handleStub(spec, participant, body, sheet, encounter);
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
    const prevHp = participant.currentHp ?? 0;



    const hpResult = await this.stateService.updateHp(
      pcOwnerId,
      participant.characterId!,
      { healing: healAmount },
    );
    const newHp = hpResult.currentHp;




    let tacticalShiftMoveFt = 0;
    if (fighterLevel >= 5) {
      const sheet = await this.sheetService.computeSheet(
        pcOwnerId,
        participant.characterId!,
      );
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
  ): Promise<GameResult<unknown>> {
    const targetId = body.targetParticipantId as string | undefined;
    const hpAmount = Number(body.hpAmount ?? 0);
    if (!targetId || !Number.isFinite(hpAmount) || hpAmount < 1) {
      return failure(
        "Lay on Hands exige 'targetParticipantId' e 'hpAmount' >= 1.",
        "INVALID_PAYLOAD",
      );
    }
    const poolMax = paladinLevel * 5;
    const featureUses = await this.stateService.getFeatureUsesUsed(
      paladin.characterId!,
    );
    const used = featureUses["lay-on-hands"] ?? 0;
    if (used + hpAmount > poolMax) {
      return failure(
        `Pool insuficiente: ${poolMax - used}/${poolMax} restantes.`,
        "LAY_ON_HANDS_INSUFFICIENT_POOL",
      );
    }

    const target = await this.encounterService
      .getParticipant(targetId)
      .catch(() => null);
    if (!target) {
      return failure("Alvo nao encontrado.", "PARTICIPANT_NOT_FOUND");
    }

    const prevHp = target.currentHp ?? 0;
    const maxHp = target.maxHp ?? prevHp + hpAmount;
    const newHp = Math.min(prevHp + hpAmount, maxHp);
    target.currentHp = newHp;
    await this.participantRepo.save(target);

    paladin.actionUsed = true;
    await this.participantRepo.save(paladin);

    await this.stateService.incrementFeatureUses(
      paladin.characterId!,
      "lay-on-hands",
      hpAmount,
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
        poolRemaining: poolMax - (used + hpAmount),
      },
    };
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);

    return success(
      {
        featureSlug: "lay-on-hands",
        target: targetId,
        hpApplied: hpAmount,
        hpBefore: prevHp,
        hpAfter: newHp,
        poolRemaining: poolMax - (used + hpAmount),
      },
      [event],
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

    if (spec.actionCost === "reaction") {
      participant.reactionsUsed = participant.reactionsUsed + 1;
    } else if (spec.actionCost === "action") {
      participant.actionUsed = true;
    } else if (spec.actionCost === "bonus") {
      participant.bonusActionUsed = true;
    }
    await this.participantRepo.save(participant);



    const incrementKey = spec.usesSharedWith ?? spec.slug;
    const sharedSource =
      spec.usesSharedWith !== undefined
        ? CLASS_FEATURE_CATALOG.find((s) => s.slug === spec.usesSharedWith)
        : undefined;
    const hasMaxUses =
      spec.maxUsesByLevel !== undefined ||
      sharedSource?.maxUsesByLevel !== undefined;
    if (hasMaxUses) {
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

    const event: GameEventData = {
      event_type: "class_feature_invoked",
      actor_participant_id: participant.id,
      data: {
        featureSlug: spec.slug,
        actionCost: spec.actionCost,
        targets,
        options: this.extractOptions(body),
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
    await this.eventService.emit(encounter.sessionId, encounter.id, [event]);



    const resolution = await this.classFeatureResolver.resolveInvocation(
      participant.id,
      {
        featureSlug: spec.slug,
        actionCost: spec.actionCost,
        targets,
        options: this.extractOptions(body),
        saveDc,
        saveAbility: this.saveAbilityForFeature(spec.slug) as any,
        caster: {
          abilityMods,
          profBonus: sheet.proficiencyBonus ?? 2,
          classSlug: spec.classSlug,
          classLevel: this.getClassLevel(sheet, spec.classSlug),
        },
      },
    );
    if (resolution.resolved && resolution.events.length > 0) {
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

  private extractOptions(
    body: Record<string, unknown>,
  ): Record<string, unknown> {

    const { participantId, kind, ownerUserId, ...rest } = body as any;
    return rest;
  }

  private primaryAbilityModForClass(
    classSlug: string,
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
      monk: "dex",
    };
    const ability = map[classSlug] ?? "str";
    return mods[ability] ?? 0;
  }

  private saveAbilityForFeature(slug: string): string | undefined {
    const map: Record<string, string> = {
      "channel-divinity": "wis",
      "wild-shape": "wis",
      "bardic-inspiration": undefined as unknown as string,
      "cunning-strike": "con",
    };
    return map[slug];
  }
}
