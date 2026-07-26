import { Injectable, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import {
  GameErrorCode,
  GameResult,
  failure,
  success,
  GameEventData,
} from "../interfaces/result.type";
import { DiceService } from "./dice.service";
import { ConditionEffectsService } from "./condition-effects.service";
import type {
  ActionStep,
  ReadyTrigger,
  ReadiedAction,
  PlannedActionStep,
} from "../interfaces/combat.interfaces";
import type { GenericActionDto } from "../dto/generic-action.dto";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { getAbilityModifier } from "src/shared/srd-utils";
import { findFearCompulsion } from "./fear-compulsion";
import { isWebRestraint } from "./web-restraint";
import { applyEffectSpeedModifiers } from "./movement.service";
import {
  canUseHasteForGenericAction,
  consumeHasteAction,
  hasAvailableHasteAction,
} from "./haste-action";
import {
  abjureFoesChoiceError,
  chooseAbjureFoesTurnOption,
} from "./abjure-foes";
import { InventoryService } from "src/models/characters/services/inventory.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import {
  FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT,
  hasFreedomOfMovement,
  isNonmagicalFreedomRestraint,
} from "./freedom-of-movement";


@Injectable()
export class GenericActionsService {
  constructor(
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly diceService: DiceService,
    private readonly conditionEffects: ConditionEffectsService,
    private readonly sheetService: CharacterSheetService,
    private readonly conditionLifecycle: ConditionLifecycleService,
    @Optional()
    private readonly inventoryService?: InventoryService,
    @Optional()
    private readonly characterStateService?: CharacterStateService,
  ) {}

  async execute(
    encounterId: string,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure(GameErrorCode.ENCOUNTER_NOT_FOUND);
    if (encounter.status !== "active")
      return failure(GameErrorCode.ENCOUNTER_NOT_ACTIVE);

    const participant = await this.participantRepo.findOne({
      where: { id: dto.participantId },
      relations: ["monster"],
    });
    if (!participant) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);

    if (
      participant.type === "pc" &&
      participant.dyingState !== "none"
    ) {
      return failure(GameErrorCode.CONDITION_PREVENTS_ACTION);
    }

    if (encounter.turnOrder[encounter.currentTurnIndex] !== participant.id)
      return failure(GameErrorCode.NOT_YOUR_TURN);




    if (!this.conditionEffects.canTakeAction(participant.conditions ?? [])) {
      return failure(GameErrorCode.CONDITION_PREVENTS_ACTION);
    }

    const fearCompulsion = findFearCompulsion(participant);
    if (fearCompulsion && dto.kind !== "flee-fear") {
      return failure(
        "Fear obriga esta criatura a usar Disparada e fugir do conjurador.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    if (dto.kind === "freedom-escape") {
      return this.handleFreedomEscape(participant, dto.ownerUserId);
    }

    const useHasteAction = dto.useHasteAction === true;
    if (
      useHasteAction &&
      (!canUseHasteForGenericAction(dto.kind) ||
        !hasAvailableHasteAction(participant))
    ) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }

    const asBonus = await this.shouldUseBonusAction(participant, dto);
    if (useHasteAction) {
      // Haste has its own once-per-turn action economy.
    } else if (asBonus) {
      if (participant.bonusActionUsed) {
        return failure(GameErrorCode.NO_ACTION_AVAILABLE);
      }
    } else if (participant.actionUsed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    const abjureChoice = chooseAbjureFoesTurnOption(
      participant,
      asBonus ? "bonus" : "action",
      `${encounter.currentRound}:${encounter.currentTurnIndex}`,
    );
    if (!abjureChoice.allowed) {
      return failure(
        abjureFoesChoiceError(abjureChoice.currentChoice),
        "CONDITION_PREVENTS_ACTION",
      );
    }

    switch (dto.kind) {
      case "dodge":
        return this.handleDodge(participant, asBonus);
      case "dash":
        return this.handleDash(
          participant,
          asBonus,
          dto.ownerUserId,
          useHasteAction,
        );
      case "disengage":
        return this.handleDisengage(participant, asBonus, useHasteAction);
      case "help":
        return this.handleHelp(participant, dto);
      case "hide":
        return this.handleHide(
          participant,
          dto.ownerUserId,
          asBonus,
          useHasteAction,
        );
      case "ready":
        return this.handleReady(participant, dto, encounter.currentRound);
      case "search":
        return this.handleSearch(participant, dto);
      case "use-object":
        return this.handleUseObject(
          participant,
          dto,
          asBonus,
          useHasteAction,
        );
      case "escape-web":
        return this.handleEscapeWeb(participant, dto.ownerUserId);
      case "flee-fear":
        return this.handleFleeFear(participant, dto.ownerUserId);
      case "wake-hypnotized":
        return this.handleWakeHypnotized(participant, dto);
      default:
        return failure(GameErrorCode.INVALID_PAYLOAD);
    }
  }

  private consumeAction(
    p: EncounterParticipantEntity,
    asBonus: boolean,
    useHasteAction: boolean = false,
  ): void {
    if (useHasteAction) {
      consumeHasteAction(p);
      return;
    }
    if (asBonus) {
      p.bonusActionUsed = true;
    } else {
      p.actionUsed = true;
    }
  }

  private async shouldUseBonusAction(
    participant: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<boolean> {
    if (dto.useHasteAction) return false;
    if (dto.asBonusAction === true) return true;
    if (dto.asBonusAction === false) return false;
    if (
      dto.kind === "use-object" &&
      this.inventoryService &&
      participant.characterId &&
      dto.ownerUserId &&
      dto.objectRef?.itemId
    ) {
      try {
        const inventory = await this.inventoryService.getInventory(
          dto.ownerUserId,
          participant.characterId,
        );
        const item = inventory.items.find(
          (candidate) => candidate.id === dto.objectRef?.itemId,
        );
        return (
          item?.equipment.consumableEffect?.actionCost === "bonus_action"
        );
      } catch {
        return false;
      }
    }
    if (!["dash", "disengage", "hide"].includes(dto.kind)) return false;
    if (!participant.actionUsed) return false;
    if (
      participant.type !== "pc" ||
      !participant.characterId ||
      !dto.ownerUserId
    ) {
      return false;
    }

    try {
      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      return (sheet.classes ?? []).some((c) => {
        const classSlug = (c.slug ?? "").replace(/-phb$|-xphb$/, "");
        return classSlug === "rogue" && c.level >= 2;
      });
    } catch {
      return false;
    }
  }



  private async handleDodge(
    p: EncounterParticipantEntity,
    asBonus: boolean = false,
  ): Promise<GameResult<ExecuteResult>> {
    p.dodgingUntilTurnOfParticipantId = p.id;
    this.consumeAction(p, asBonus);
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "dodge",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} está esquivando até o próximo turno`,
        events: [
          {
            type: "dodge_taken",
            participantId: p.id,
            expiresAt: `next_turn_of:${p.id}`,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };

    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("dodge_taken", p.id),
    ]);
  }

  private async handleDash(
    p: EncounterParticipantEntity,
    asBonus: boolean = false,
    ownerUserId?: string,
    useHasteAction: boolean = false,
  ): Promise<GameResult<ExecuteResult>> {
    if (p.hasDashed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    p.hasDashed = true;
    this.consumeAction(p, asBonus, useHasteAction);

    const baseSpeed = await this.getBaseSpeed(p, ownerUserId);
    p.movementRemaining = (p.movementRemaining ?? baseSpeed) + baseSpeed;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "dash",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} usou Disparada (movimento dobrado)${useHasteAction ? " com a ação de Haste" : ""}`,
        events: [
          { type: "dash_taken", participantId: p.id },
          ...(useHasteAction
            ? [{ type: "haste_action_used", participantId: p.id }]
            : []),
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("dash_taken", p.id),
      ...(useHasteAction
        ? [this.toGameEvent("haste_action_used", p.id, { kind: "dash" })]
        : []),
    ]);
  }

  private async handleDisengage(
    p: EncounterParticipantEntity,
    asBonus: boolean = false,
    useHasteAction: boolean = false,
  ): Promise<GameResult<ExecuteResult>> {
    if (p.hasDisengaged) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    p.hasDisengaged = true;
    this.consumeAction(p, asBonus, useHasteAction);
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "disengage",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary: `${p.displayName} se desengajou (imune a attacks of opportunity neste turno)${useHasteAction ? " com a ação de Haste" : ""}`,
        events: [
          { type: "disengage_taken", participantId: p.id },
          ...(useHasteAction
            ? [{ type: "haste_action_used", participantId: p.id }]
            : []),
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("disengage_taken", p.id),
      ...(useHasteAction
        ? [
            this.toGameEvent("haste_action_used", p.id, {
              kind: "disengage",
            }),
          ]
        : []),
    ]);
  }

  private async handleHelp(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.allyParticipantId || !dto.targetParticipantId) {
      return failure(GameErrorCode.INVALID_PAYLOAD);
    }
    const ally = await this.participantRepo.findOne({
      where: { id: dto.allyParticipantId },
    });
    const target = await this.participantRepo.findOne({
      where: { id: dto.targetParticipantId },
    });
    if (!ally || !target) return failure(GameErrorCode.PARTICIPANT_NOT_FOUND);
    if (ally.faction !== p.faction)
      return failure(GameErrorCode.INVALID_TARGET);
    if (target.faction === p.faction)
      return failure(GameErrorCode.INVALID_TARGET);

    p.helpingAllyParticipantId = ally.id;
    p.helpingTargetParticipantId = target.id;
    p.helpingUntilTurnOfParticipantId = p.id;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "help",
      payload: {
        participantId: p.id,
        allyParticipantId: ally.id,
        targetParticipantId: target.id,
      },
      result: {
        ok: true,
        summary: `${p.displayName} está ajudando ${ally.displayName} contra ${target.displayName}`,
        events: [
          {
            type: "help_given",
            participantId: p.id,
            allyParticipantId: ally.id,
            targetParticipantId: target.id,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("help_given", p.id, {
        ally: ally.id,
        target: target.id,
      }),
    ]);
  }

  private async handleWakeHypnotized(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.targetParticipantId || dto.targetParticipantId === p.id) {
      return failure(GameErrorCode.INVALID_TARGET);
    }
    const target = await this.participantRepo.findOne({
      where: { id: dto.targetParticipantId },
    });
    if (!target || target.encounterId !== p.encounterId) {
      return failure(GameErrorCode.INVALID_TARGET);
    }
    if (
      p.positionX == null ||
      p.positionY == null ||
      target.positionX == null ||
      target.positionY == null ||
      Math.max(
        Math.abs(p.positionX - target.positionX),
        Math.abs(p.positionY - target.positionY),
      ) > 1
    ) {
      return failure(
        "A criatura hipnotizada precisa estar adjacente.",
        "INVALID_TARGET",
      );
    }
    const hypnosis = (target.conditionInstances ?? []).find(
      (condition) =>
        condition.slug === "hypnotized" &&
        condition.sourceSpell
          ?.toLowerCase()
          .replace(/-(phb|xphb|srd52)$/, "") === "hypnotic-pattern",
    );
    if (!hypnosis) return failure(GameErrorCode.INVALID_TARGET);

    const removed = await this.conditionLifecycle.removeConditionInstance(
      target,
      hypnosis.id,
      "shaken_awake",
    );
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const summary = `${p.displayName} sacudiu ${target.displayName}, encerrando o transe de Hypnotic Pattern.`;
    const step: ActionStep = {
      kind: "wake-hypnotized",
      payload: {
        participantId: p.id,
        targetParticipantId: target.id,
      },
      result: {
        ok: true,
        summary,
        events: [
          {
            type: "hypnotic_pattern_awakened",
            participantId: p.id,
            targetParticipantId: target.id,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      ...removed.events,
      this.toGameEvent("hypnotic_pattern_awakened", p.id, {
        targetParticipantId: target.id,
      }),
    ]);
  }

  private async handleHide(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
    asBonus: boolean = false,
    useHasteAction: boolean = false,
  ): Promise<GameResult<ExecuteResult>> {




    const rawStealthRoll = this.diceService.rollExpression("1d20").total;
    let stealthMod = 3;
    let stealthRoll = rawStealthRoll;
    let reliableTalentApplied = false;
    if (p.type === "pc" && p.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          p.characterId,
        );
        const stealth = sheet.skills.find((skill) => skill.slug === "stealth");
        stealthMod = stealth?.bonus ?? stealthMod;
        const rogueLevel =
          sheet.classes.find((entry) => entry.slug.startsWith("rogue"))
            ?.level ?? 0;
        if (rogueLevel >= 7 && stealth?.proficient && stealthRoll < 10) {
          stealthRoll = 10;
          reliableTalentApplied = true;
        }
      } catch {
        // Preserve the statblock fallback when a sheet is unavailable.
      }
    }
    const stealthTotal = stealthRoll + stealthMod;
    const hideDc = 15;

    const conditions = [...(p.conditions ?? [])];
    let summary: string;
    const events: Array<{ type: string; [k: string]: unknown }> = [
      {
        type: "stealth_roll",
        participantId: p.id,
        roll: stealthRoll,
        rawRoll: rawStealthRoll,
        modifier: stealthMod,
        total: stealthTotal,
        dc: hideDc,
        success: stealthTotal >= hideDc,
        reliableTalentApplied,
      },
    ];

    if (stealthTotal >= hideDc) {
      if (!conditions.includes("hidden")) conditions.push("hidden");
      p.conditions = conditions;
      summary = `${p.displayName} escondeu-se (Stealth ${stealthTotal} vs CD ${hideDc}): sucesso`;
      events.push({
        type: "condition_applied",
        participantId: p.id,
        condition: "hidden",
      });
    } else {
      summary = `${p.displayName} tentou esconder-se (Stealth ${stealthTotal} vs CD ${hideDc}): falhou`;
    }

    this.consumeAction(p, asBonus, useHasteAction);
    if (useHasteAction) {
      summary += ". Ação extra de Haste consumida";
      events.push({ type: "haste_action_used", participantId: p.id });
    }
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "hide",
      payload: { participantId: p.id },
      result: { ok: true, summary, events },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("stealth_roll", p.id, {
        roll: stealthRoll,
        rawRoll: rawStealthRoll,
        modifier: stealthMod,
        total: stealthTotal,
        dc: hideDc,
        success: stealthTotal >= hideDc,
        reliableTalentApplied,
      }),
      ...(useHasteAction
        ? [this.toGameEvent("haste_action_used", p.id, { kind: "hide" })]
        : []),
    ]);
  }

  private async handleReady(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
    _round: number,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.trigger || !dto.readiedAction) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }


    const trigger = dto.trigger as ReadyTrigger;
    if (
      trigger.kind === "enemy_enters_range" &&
      (trigger.rangeFt == null || trigger.rangeFt <= 0)
    ) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }
    if (trigger.kind === "enemy_attacks_ally" && !trigger.allyParticipantId) {
      return failure(GameErrorCode.INVALID_READY_TRIGGER);
    }

    const readiedAction: ReadiedAction = {
      trigger,
      actionDescriptor: {
        kind: dto.readiedAction.kind,
        ...(dto.readiedAction.kind === "attack"
          ? {
              actionName: dto.readiedAction.actionName ?? "",
              targetParticipantIds:
                dto.readiedAction.targetParticipantIds ?? [],
            }
          : { to: dto.readiedAction.to ?? { x: 0, y: 0 } }),
      } as PlannedActionStep,
      armedAtTurnOfParticipantId: p.id,
    };

    p.readiedAction = readiedAction;
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "ready",
      payload: {
        participantId: p.id,
        trigger,
        readiedAction: dto.readiedAction,
      },
      result: {
        ok: true,
        summary: `${p.displayName} preparou ação (gatilho: ${trigger.kind})`,
        events: [
          {
            type: "ready_armed",
            participantId: p.id,
            trigger,
            readiedAction: dto.readiedAction,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("ready_armed", p.id, {
        trigger,
        readiedAction: dto.readiedAction,
      }),
    ]);
  }

  private async handleSearch(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
  ): Promise<GameResult<ExecuteResult>> {
    const ability = dto.ability ?? "perception";
    const searchSense = dto.searchSense ?? "sight";
    const autoFailureReason =
      searchSense === "hearing" && (p.conditions ?? []).includes("deafened")
        ? "deafened"
        : searchSense === "sight" && (p.conditions ?? []).includes("blinded")
          ? "blinded"
          : null;
    const rawRoll = autoFailureReason
      ? 0
      : this.diceService.rollExpression("1d20").total;
    let roll = rawRoll;
    let mod = ability === "perception" ? 2 : 1;
    let reliableTalentApplied = false;
    if (
      !autoFailureReason &&
      p.type === "pc" &&
      p.characterId &&
      dto.ownerUserId
    ) {
      try {
        const sheet = await this.sheetService.computeSheet(
          dto.ownerUserId,
          p.characterId,
        );
        const skill = sheet.skills.find((entry) => entry.slug === ability);
        mod = skill?.bonus ?? mod;
        const rogueLevel =
          sheet.classes.find((entry) => entry.slug.startsWith("rogue"))
            ?.level ?? 0;
        if (rogueLevel >= 7 && skill?.proficient && roll < 10) {
          roll = 10;
          reliableTalentApplied = true;
        }
      } catch {
        // Preserve the lightweight fallback for monsters and unavailable sheets.
      }
    }
    const total = autoFailureReason ? 0 : roll + mod;

    p.actionUsed = true;
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "search",
      payload: { participantId: p.id, ability, searchSense },
      result: {
        ok: true,
        summary: autoFailureReason
          ? `${p.displayName} falhou automaticamente ao procurar por ${searchSense === "hearing" ? "audição" : "visão"} (${autoFailureReason === "deafened" ? "Surdo" : "Cego"})`
          : `${p.displayName} procurou (${ability}, ${searchSense}): ${total} (${roll}+${mod})`,
        events: [
          {
            type: "search_roll",
            participantId: p.id,
            ability,
            searchSense,
            roll,
            rawRoll,
            modifier: mod,
            total,
            reliableTalentApplied,
            autoFailed: autoFailureReason != null,
            autoFailureReason,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("search_roll", p.id, {
        ability,
        searchSense,
        roll,
        rawRoll,
        modifier: mod,
        total,
        reliableTalentApplied,
        autoFailed: autoFailureReason != null,
        autoFailureReason,
      }),
    ]);
  }

  private async handleUseObject(
    p: EncounterParticipantEntity,
    dto: GenericActionDto,
    asBonusAction: boolean = false,
    useHasteAction: boolean = false,
  ): Promise<GameResult<ExecuteResult>> {
    if (!dto.objectRef) return failure(GameErrorCode.INVALID_PAYLOAD);



    const slug = dto.objectRef.slug;
    let appliedSummary: string;
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    let persistedEventData: Record<string, unknown> = { slug };

    if (
      dto.objectRef.source === "inventory" &&
      this.inventoryService &&
      p.type === "pc" &&
      p.characterId &&
      dto.ownerUserId
    ) {
      if (!dto.objectRef.itemId) {
        return failure(GameErrorCode.ITEM_NOT_USABLE);
      }
      try {
        const inventory = await this.inventoryService.getInventory(
          dto.ownerUserId,
          p.characterId,
        );
        const item = inventory.items.find(
          (candidate) => candidate.id === dto.objectRef?.itemId,
        );
        if (
          !item ||
          item.quantity <= 0 ||
          item.equipment.slug !== slug ||
          item.equipment.consumableEffect == null
        ) {
          return failure(GameErrorCode.ITEM_NOT_USABLE);
        }

        const effect = item.equipment.consumableEffect;
        const autoApply = effect.autoApply === true;
        const isHealersKit = slug === "healers-kit";
        if (!autoApply && !isHealersKit) {
          return failure(GameErrorCode.ITEM_NOT_USABLE);
        }

        let target: EncounterParticipantEntity | null = null;
        if (isHealersKit) {
          if (!dto.targetParticipantId) {
            return failure(
              "Escolha uma criatura inconsciente com 0 HP a até 5 pés.",
              "INVALID_TARGET",
            );
          }
          target = await this.participantRepo.findOne({
            where: {
              id: dto.targetParticipantId,
              encounterId: p.encounterId,
            },
          });
          const targetAtZero =
            target?.type === "pc" &&
            (target.currentHp ?? 0) === 0 &&
            target.dyingState === "dying";
          const positionsKnown =
            p.positionX != null &&
            p.positionY != null &&
            target?.positionX != null &&
            target.positionY != null;
          const distanceFt = positionsKnown
            ? Math.max(
                Math.abs(p.positionX! - target!.positionX!),
                Math.abs(p.positionY! - target!.positionY!),
              ) * 5
            : Number.POSITIVE_INFINITY;
          if (!targetAtZero || distanceFt > 5) {
            return failure(
              "O Kit de Curandeiro exige uma criatura inconsciente com 0 HP a até 5 pés.",
              "INVALID_TARGET",
            );
          }
        }

        const healingBlocked = (p.effectInstances ?? []).some(
          (candidate) => candidate.kind === "healing_blocked",
        );
        const used = await this.inventoryService.useItem(
          dto.ownerUserId,
          p.characterId,
          dto.objectRef.itemId,
          { healingBlocked },
        );
        const appliedEffect = used.effect;
        appliedSummary =
          appliedEffect?.message ??
          `${p.displayName} usou um item do inventário`;
        if (appliedEffect?.newCurrentHp != null) {
          p.currentHp = appliedEffect.newCurrentHp;
        }
        if (isHealersKit && target) {
          target.dyingState = "stable";
          target.isDefeated = false;
          await this.participantRepo.save(target);
          if (target.characterId && this.characterStateService) {
            await this.characterStateService.stabilizeAtZero(
              target.characterId,
            );
          }
          appliedSummary = `${p.displayName} estabilizou ${target.displayName} com Healer's Kit`;
        }
        events.push({
          type: "item_used",
          participantId: p.id,
          slug,
          itemName: item.equipment.name,
          itemId: dto.objectRef.itemId,
          targetParticipantId: target?.id,
          targetName: target?.displayName,
          outcome: isHealersKit ? "stabilized" : appliedEffect?.type,
          remainingQuantity: used.remainingQuantity,
        });
        persistedEventData = {
          slug,
          itemName: item.equipment.name,
          itemId: dto.objectRef.itemId,
          targetParticipantId: target?.id,
          targetName: target?.displayName,
          outcome: isHealersKit ? "stabilized" : appliedEffect?.type,
          remainingQuantity: used.remainingQuantity,
        };
        if (isHealersKit && target) {
          events.push({
            type: "stabilized",
            participantId: target.id,
            sourceParticipantId: p.id,
            itemSlug: slug,
          });
        } else if (appliedEffect?.type === "healing") {
          events.push({
            type: "healing_applied",
            participantId: p.id,
            amount: appliedEffect.healingApplied ?? 0,
          });
        } else if (appliedEffect?.type === "healing_blocked") {
          events.push({
            type: "healing_prevented",
            participantId: p.id,
          });
        }
      } catch {
        return failure(GameErrorCode.ITEM_NOT_USABLE);
      }
    } else if (!this.inventoryService && slug === "potion-of-healing") {
      // Fallback mantido apenas para harnesses unitários antigos. Em produção,
      // itens de inventário precisam existir e são consumidos pelo itemId.
      const healing = this.diceService.rollExpression("2d4+2").total;
      const healingBlocked = (p.effectInstances ?? []).some(
        (effect) => effect.kind === "healing_blocked",
      );
      if (healingBlocked) {
        appliedSummary = `${p.displayName} usou Poção de Cura, mas a cura foi bloqueada`;
        events.push(
          { type: "item_used", participantId: p.id, slug },
          {
            type: "healing_prevented",
            participantId: p.id,
            attemptedHealing: healing,
          },
        );
      } else {
        p.currentHp = Math.min(
          (p.currentHp ?? 0) + healing,
          p.maxHp ?? (p.currentHp ?? 0) + healing,
        );
        appliedSummary = `${p.displayName} usou Poção de Cura (+${healing} HP)`;
        events.push(
          { type: "item_used", participantId: p.id, slug },
          { type: "healing_applied", participantId: p.id, amount: healing },
        );
      }
    } else {
      return failure(GameErrorCode.ITEM_NOT_USABLE);
    }

    this.consumeAction(p, asBonusAction, useHasteAction);
    if (useHasteAction) {
      appliedSummary += ". Ação extra de Haste consumida";
      events.push({ type: "haste_action_used", participantId: p.id });
    }
    await this.participantRepo.save(p);

    const step: ActionStep = {
      kind: "use-object",
      payload: { participantId: p.id, objectRef: dto.objectRef },
      result: { ok: true, summary: appliedSummary, events },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("item_used", p.id, persistedEventData),
      ...(useHasteAction
        ? [
            this.toGameEvent("haste_action_used", p.id, {
              kind: "use-object",
            }),
          ]
        : []),
    ]);
  }

  private async handleEscapeWeb(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<GameResult<ExecuteResult>> {
    const restraint = (p.conditionInstances ?? []).find(
      isWebRestraint,
    );
    if (!restraint) return failure(GameErrorCode.INVALID_ACTION);

    const dc = restraint.saveDc ?? 13;
    const modifier = await this.getStrengthCheckModifier(p, ownerUserId);
    const roll = this.diceService.roll(20);
    const total = roll + modifier;
    const escaped = total >= dc;
    const events: GameEventData[] = [
      this.toGameEvent("web_escape_check", p.id, {
        ability: "str",
        dc,
        roll,
        modifier,
        total,
        success: escaped,
        sourceSpell: restraint.sourceSpell,
      }),
    ];

    if (escaped) {
      const removed = await this.conditionLifecycle.removeConditionInstance(
        p,
        restraint.id,
        "web_escape",
      );
      events.push(...removed.events);
    }
    p.actionUsed = true;
    await this.participantRepo.save(p);

    const summary = escaped
      ? `${p.displayName} escapou da Teia: Força ${total} (${roll}${modifier >= 0 ? "+" : ""}${modifier}) vs CD ${dc}.`
      : `${p.displayName} não escapou da Teia: Força ${total} (${roll}${modifier >= 0 ? "+" : ""}${modifier}) vs CD ${dc}.`;
    const step: ActionStep = {
      kind: "escape-web",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary,
        events: [
          {
            type: "web_escape_check",
            participantId: p.id,
            ability: "str",
            dc,
            roll,
            modifier,
            total,
            success: escaped,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, events);
  }

  private async handleFreedomEscape(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<GameResult<ExecuteResult>> {
    if (!hasFreedomOfMovement(p)) {
      return failure(GameErrorCode.INVALID_ACTION);
    }
    const restraintInstances = (p.conditionInstances ?? []).filter(
      isNonmagicalFreedomRestraint,
    );
    const legacyRestraints = (p.conditions ?? []).filter(
      (slug) =>
        (slug === "grappled" || slug === "restrained") &&
        !restraintInstances.some((condition) => condition.slug === slug),
    );
    if (restraintInstances.length === 0 && legacyRestraints.length === 0) {
      return failure(GameErrorCode.INVALID_ACTION);
    }

    const speed = await this.getBaseSpeed(p, ownerUserId);
    const remainingMovement = p.movementRemaining ?? speed;
    if (remainingMovement < FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT) {
      return failure(
        `Freedom of Movement exige ${FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT}ft de movimento; restam ${remainingMovement}ft.`,
        "INSUFFICIENT_MOVEMENT",
      );
    }

    const released = new Set<string>(legacyRestraints);
    const events: GameEventData[] = [];
    for (const condition of restraintInstances) {
      const removed = await this.conditionLifecycle.removeConditionInstance(
        p,
        condition.id,
        "freedom_of_movement",
      );
      if (removed.removed) released.add(condition.slug);
      events.push(...removed.events);
    }
    if (legacyRestraints.length > 0) {
      p.conditions = (p.conditions ?? []).filter(
        (slug) => !legacyRestraints.includes(slug),
      );
    }
    if (!(p.conditions ?? []).includes("grappled")) {
      p.grappledByParticipantId = null;
    }
    p.movementRemaining =
      remainingMovement - FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT;
    await this.participantRepo.save(p);

    const releasedSlugs = Array.from(released);
    events.push(
      this.toGameEvent("freedom_of_movement_escape", p.id, {
        releasedConditions: releasedSlugs,
        movementSpent: FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT,
        movementRemaining: p.movementRemaining,
      }),
    );
    const summary = `${p.displayName} gastou ${FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT}ft com Freedom of Movement e escapou de ${releasedSlugs.join(", ")}.`;
    const step: ActionStep = {
      kind: "freedom-escape",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary,
        events: [
          {
            type: "freedom_of_movement_escape",
            participantId: p.id,
            releasedConditions: releasedSlugs,
            movementSpent: FREEDOM_OF_MOVEMENT_ESCAPE_COST_FT,
            movementRemaining: p.movementRemaining,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, events);
  }

  private async getStrengthCheckModifier(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    const transformedStrength = p.transformationState?.form?.stats?.str;
    if (typeof transformedStrength === "number") {
      return getAbilityModifier(transformedStrength);
    }
    if (p.type === "pc" && p.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          p.characterId,
        );
        return (
          sheet.abilityScores.find((ability) => ability.slug === "str")
            ?.modifier ?? 0
        );
      } catch {
        return 0;
      }
    }
    const strength = Number(
      (p.monster as unknown as Record<string, unknown> | null)?.strength ?? 10,
    );
    return getAbilityModifier(strength);
  }

  private async handleFleeFear(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<GameResult<ExecuteResult>> {
    if (!findFearCompulsion(p)) {
      return failure(GameErrorCode.INVALID_ACTION);
    }
    if (p.hasDashed) {
      return failure(GameErrorCode.NO_ACTION_AVAILABLE);
    }
    const baseSpeed = await this.getBaseSpeed(p, ownerUserId);
    p.hasDashed = true;
    p.actionUsed = true;
    p.movementRemaining = (p.movementRemaining ?? baseSpeed) + baseSpeed;
    await this.participantRepo.save(p);

    const summary = `${p.displayName} usou Disparada por Fear e deve se afastar do conjurador.`;
    const step: ActionStep = {
      kind: "flee-fear",
      payload: { participantId: p.id },
      result: {
        ok: true,
        summary,
        events: [
          {
            type: "fear_flee_started",
            participantId: p.id,
            movementRemaining: p.movementRemaining,
          },
        ],
      },
      timestamp: new Date().toISOString(),
    };
    return success({ step, finalState: this.snapshotState(p) }, [
      this.toGameEvent("fear_flee_started", p.id, {
        movementRemaining: p.movementRemaining,
      }),
    ]);
  }

  private async getBaseSpeed(
    p: EncounterParticipantEntity,
    ownerUserId?: string,
  ): Promise<number> {
    const transformedWalk = p.transformationState?.form?.speed?.walk;
    if (typeof transformedWalk === "number") {
      return applyEffectSpeedModifiers(transformedWalk, p.effectInstances);
    }
    if (typeof transformedWalk === "string") {
      const parsed = Number.parseInt(transformedWalk, 10);
      if (Number.isFinite(parsed)) {
        return applyEffectSpeedModifiers(parsed, p.effectInstances);
      }
    }
    if (p.type === "pc" && p.characterId && ownerUserId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          p.characterId,
        );
        return applyEffectSpeedModifiers(sheet.speed ?? 30, p.effectInstances);
      } catch {
        return 30;
      }
    }
    const monsterWalk = (
      p.monster as unknown as {
        speed?: { walk?: number | string };
      } | null
    )?.speed?.walk;
    if (typeof monsterWalk === "number") {
      return applyEffectSpeedModifiers(monsterWalk, p.effectInstances);
    }
    if (typeof monsterWalk === "string") {
      const parsed = Number.parseInt(monsterWalk, 10);
      if (Number.isFinite(parsed)) {
        return applyEffectSpeedModifiers(parsed, p.effectInstances);
      }
    }
    return applyEffectSpeedModifiers(30, p.effectInstances);
  }

  private snapshotState(p: EncounterParticipantEntity) {
    return {
      actionUsed: p.actionUsed,
      bonusUsed: p.bonusActionUsed,
      movementRemaining: p.movementRemaining ?? 0,
      reactionUsed: p.reactionsUsed > 0,
      hp: { current: p.currentHp ?? 0, max: p.maxHp ?? 0 },
      conditions: p.conditions ?? [],
      dyingState: p.dyingState,
    };
  }

  private toGameEvent(
    type: string,
    actorId: string,
    data: Record<string, unknown> = {},
  ): GameEventData {
    return {
      event_type: type,
      actor_participant_id: actorId,
      data,
    };
  }
}

export interface ExecuteResult {
  step: ActionStep;
  finalState: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    reactionUsed: boolean;
    hp: { current: number; max: number };
    conditions: string[];
    dyingState: "none" | "dying" | "stable" | "dead";
  };
}
