import { Injectable } from "@nestjs/common";
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
import { ConditionEffectsService } from "./condition-effects.service";
import { EventService } from "./event.service";
import { EncounterService } from "./encounter.service";
import { EncounterEndDetectorService } from "./encounter-end-detector.service";
import { LairActionsCoordinator } from "./lair-actions-coordinator.service";
import { LegendaryActionsCoordinator } from "./legendary-actions-coordinator.service";
import { MonsterReactionService } from "./monster-reaction.service";
import { MovementService } from "./movement.service";
import { SessionService } from "./session.service";
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
import { MonsterActionResolver } from "./monster-action-resolver.service";
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
import type {
  ConditionSlug,
  EffectInstance,
} from "../interfaces/combat.interfaces";
import {
  parseRangeString,
  checkAttackRange,
  type Position as GridPosition,
} from "./combat-range";



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

export interface HealDto {
  targetParticipantId: string;
  amount: number;
  ownerUserId: string;
}

export interface ConditionDto {
  participantId: string;
  condition: string;
  apply: boolean;
  ownerUserId: string;
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

  private slugifyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
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
        },
      });
      return success(descriptors, []);
    }

    if (participant.type === "monster" && participant.monster) {
      const monster: any = participant.monster;
      const monsterSlug: string = monster.slug ?? "";
      const rawActions: any[] = Array.isArray(monster.actions)
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

    const events: GameEventData[] = [];
    const results: AoEResolveResult["results"] = [];

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
          });
          if (sr.ok && sr.value) {
            saveResult = sr.value;
            saved = sr.value.success;
          }
        } else if (target.type === "monster" && target.monster) {
          const m: any = target.monster;
          const abilityMap: Record<string, string> = {
            str: "strength",
            dex: "dexterity",
            con: "constitution",
            int: "intelligence",
            wis: "wisdom",
            cha: "charisma",
          };
          const fullName =
            abilityMap[actionBlock.save.ability] ?? actionBlock.save.ability;
          const saveBonus =
            m[`${fullName}_save`] ?? getAbilityModifier(m[fullName] ?? 10);
          const roll = this.diceService.roll(20);
          const total = roll + saveBonus;
          saved = total >= actionBlock.save.dc;
          saveResult = {
            ability: actionBlock.save.ability,
            dc: actionBlock.save.dc,
            roll,
            modifier: saveBonus,
            total,
            success: saved,
          };
        }
      }


      const dmgResult = this.diceService.rollExpression(
        actionBlock.damage.dice,
      );
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
      const adjustedDamage = this.resolveDamageAdjustments(
        target,
        totalDamage,
        actionBlock.damage.type,
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
      });
    }


    caster.actionUsed = true;
    await this.participantRepo.save(caster);

    await this.eventService.emit(encounter.sessionId, encounterId, events);

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
    const rangedKeywords = [
      "bow",
      "crossbow",
      "javelin",
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
      if (e.expiresAt.kind !== "until_consumed") return false;
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
  ): {
    advantage: boolean;
    disadvantage: boolean;
    attackBonuses: Array<{ source: string; dice?: string; amount?: number }>;
    targetAcBonus: number;
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
    for (const e of targetFx) {
      if (e.kind === "ac_bonus") targetAcBonus += e.payload?.amount ?? 0;
      if (e.kind === "grant_advantage_to_attackers") advantage = true;
      if (e.kind === "grant_disadvantage_to_attackers") disadvantage = true;
    }




    if ((target.conditions ?? []).includes("prone")) {
      if (isMelee) advantage = true;
      else disadvantage = true;
    }

    return { advantage, disadvantage, attackBonuses, targetAcBonus };
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
    const resolvedOwnerId = await this.resolveParticipantOwner(
      participant,
      ownerUserId,
    );
    const speed = await this.movementService.getSpeed(
      participant,
      resolvedOwnerId,
    );

    let actions: TurnActionBlock[] = [];
    let bonusActions: TurnActionBlock[] = [];
    let reactions: TurnActionBlock[] = [];

    if (participant.type === "pc" && participant.characterId) {


      if (participant.transformationState) {
        const formSynthetic = {
          slug:
            participant.transformationState.form.monsterSlug ?? "transformed",
          name: participant.transformationState.form.formName,
          actions: participant.transformationState.form.actions,
        };
        actions = this.parseMonsterActions(formSynthetic);
      } else {
        const pcActions = await this.actionsService.getActions(
          resolvedOwnerId,
          participant.characterId,
        );
        actions = pcActions.actions.map(this.toTurnActionBlock);
        bonusActions = pcActions.bonusActions.map(this.toTurnActionBlock);
        reactions = pcActions.reactions.map(this.toTurnActionBlock);
      }
    } else if (participant.type === "monster" && participant.monster) {
      actions = this.parseMonsterActions(participant.monster);
      const multiattack = (participant.monster as any).multiattack;
      if (
        multiattack &&
        Array.isArray(multiattack.sequence) &&
        multiattack.sequence.length > 0
      ) {
        actions = [
          {
            id: `${(participant.monster as any).slug ?? "monster"}-multiattack`,
            name: "Multiataque",
            kind: "multiattack",
            timing: "action",
            source: "base",
            sourceLabel: "Multiataque",
            description: multiattack.description ?? "",
            sequence: multiattack.sequence,
            rechargeRequired: multiattack.recharge ?? null,
          },
          ...actions,
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


    const genericActions: TurnActionBlock[] = [
      this.makeGenericAction("dodge", "Esquivar"),
      this.makeGenericAction("dash", "Disparada"),
      this.makeGenericAction("disengage", "Desengajar"),
      this.makeGenericAction("help", "Ajudar"),
      this.makeGenericAction("hide", "Esconder"),
      this.makeGenericAction("ready", "Preparar"),
      this.makeGenericAction("search", "Procurar"),
      this.makeGenericAction("use-object", "Usar Objeto"),
    ];




    return success({
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type,
      actions,
      genericActions,
      bonusActions,
      reactions,
      canMove: (participant.movementRemaining ?? speed) > 0,
      remainingMovement: participant.movementRemaining ?? speed,
      speed,
      actionUsed: participant.actionUsed,
      bonusActionUsed: participant.bonusActionUsed,
      hasDisengaged: participant.hasDisengaged,
      hasDashed: participant.hasDashed,
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
      masterySlug: a.masterySlug,

      proficient: a.proficient,
      handSlot: a.handSlot,

      uses: a.uses,
      usesMax: a.usesMax,
      usesRecharge: a.usesRecharge,
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
          halfOnSuccess: /half as much damage on a successful/i.test(desc),
        }
      : undefined;

    const range = resolved.reach ?? resolved.range;

    const actionSlug = idPrefix
      ? `${idPrefix}-${(a.name ?? "attack")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}`
      : `monster-action-${i}`;

    const isAttack = resolved.hasAttack || damage != null;

    return {
      id: actionSlug,
      name: a.name ?? "Ataque",
      timing: "action",
      source: isAttack ? "base" : "special",
      sourceLabel: isAttack ? monster.name : "Habilidade Especial",
      description: desc,
      attackBonus,
      damage,
      range,
      aoe,
      save,
    };
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

    const events: GameEventData[] = [
      {
        event_type: "turn_end",
        actor_participant_id: currentParticipantId,
        data: { round: encounter.currentRound },
      },
    ];




    const tickParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
    });
    if (tickParticipant) {
      const tick = await this.effectInstances.tickAtEndOfTurn(tickParticipant);
      events.push(...tick.events);
    }





    const currentParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
    });
    if (currentParticipant) {
      const expired: string[] = [];
      if (
        currentParticipant.helpingUntilTurnOfParticipantId ===
        currentParticipant.id
      ) {
        currentParticipant.helpingAllyParticipantId = null;
        currentParticipant.helpingTargetParticipantId = null;
        currentParticipant.helpingUntilTurnOfParticipantId = null;
        expired.push("help");
      }
      if (currentParticipant.readiedAction) {
        currentParticipant.readiedAction = null;
        expired.push("ready");
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

    if (nextIndex >= encounter.turnOrder.length) {
      nextIndex = 0;
      newRound += 1;
      events.push({ event_type: "round_start", data: { round: newRound } });
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

    while (skipped < turnOrderLen) {
      const pid = encounter.turnOrder[nextIndex];
      const p = await this.participantRepo.findOne({ where: { id: pid } });
      if (!p) {
        nextIndex = (nextIndex + 1) % turnOrderLen;
        if (nextIndex === 0) newRound += 1;
        skipped++;
        continue;
      }


      if (p.type !== "pc" && p.isDefeated) {
        nextIndex = (nextIndex + 1) % turnOrderLen;
        if (nextIndex === 0) newRound += 1;
        skipped++;
        continue;
      }


      if (p.type === "pc" && p.dyingState === "dead") {
        nextIndex = (nextIndex + 1) % turnOrderLen;
        if (nextIndex === 0) newRound += 1;
        skipped++;
        continue;
      }


      if (p.type === "pc" && p.dyingState === "stable") {
        autoSkip = true;
        break;
      }


      break;
    }

    encounter.currentTurnIndex = nextIndex;
    encounter.currentRound = newRound;
    await this.encounterRepo.save(encounter);

    const nextParticipantId = encounter.turnOrder[nextIndex];

    const nextParticipant = await this.participantRepo.findOne({
      where: { id: nextParticipantId },
      relations: ["monster"],
    });



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
    if (nextParticipant) {
      const ownerId = await this.resolveParticipantOwner(nextParticipant, "");
      await this.movementService.initializeTurn(
        nextParticipant,
        ownerId || undefined,
      );

      try {
        const capRes = await this.capstones.runStartOfCombat(
          nextParticipant,
          ownerId || undefined,
        );
        events.push(...capRes.events);
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

    if (attacker.isDefeated)
      return failure("Atacante esta derrotado.", "CONDITION_PREVENTS_ACTION");
    if (target.isDefeated)
      return failure("Alvo ja esta derrotado.", "TARGET_DEFEATED");

    if (!dto._isSubAttack) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.attackerParticipantId)
        return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");




      if (
        attacker.actionUsed &&
        attacker.attacksUsedThisTurn >= attacker.attacksMaxThisTurn
      )
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }


    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure(
        "Atacante nao pode agir devido a condicoes.",
        "CONDITION_PREVENTS_ACTION",
      );




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
          attacker.actionUsed = true;
          attacker.attacksUsedThisTurn = Math.min(
            attacker.attacksUsedThisTurn + 1,
            attacker.attacksMaxThisTurn,
          );
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
      actionRangeStr = resolved.range ?? resolved.reach ?? null;
    } else if (attacker.type === "pc" && attacker.characterId) {
      const actions = await this.actionsService.getActions(
        dto.ownerUserId,
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
        const pcOwnerId = await this.resolveParticipantOwner(
          attacker,
          dto.ownerUserId,
        );
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
          const isThrown =
            (dto.actionSlug ?? "").startsWith("weapon-thrown-") ||
            props.includes("thrown");
          const isMeleeCtx = this.isMeleeAttack(action.name, dto.actionSlug);


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






      let resolved = this.monsterActionResolver.resolveByName(
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
      if (resolved.damageDice) damageDice = resolved.damageDice;
      if (resolved.damageType) damageType = resolved.damageType;
      damageBonus = resolved.damageBonus;
      actionRangeStr = resolved.range ?? resolved.reach ?? null;
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
    );



    const consumeInspiration = attacker.inspirationArmed === true;

    let hasAdvantage =
      attackerMods.hasAdvantage ||
      defenderMods.attacksHaveAdvantage ||
      reactive.advantage ||
      effectDec.advantage ||
      consumeInspiration ||
      (dto.forceAdvantage ?? false);
    let hasDisadvantage =
      attackerMods.hasDisadvantage ||
      defenderMods.attacksHaveDisadvantage ||
      reactive.disadvantage ||
      effectDec.disadvantage ||
      rangeCheck.disadvantage ||
      (dto.forceDisadvantage ?? false);



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



    const critThreshold = await this.computeCritThreshold(
      attacker,
      dto.ownerUserId,
    );
    const isCritical = attackRoll >= critThreshold;
    const isCriticalMiss = attackRoll === 1;


    let targetAc = 10;
    if (target.type === "pc" && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(
        target,
        dto.ownerUserId,
      );
      const sheet = await this.sheetService.computeSheet(
        targetOwnerId,
        target.characterId,
      );
      targetAc = sheet.armorClass;
    } else if (target.type === "monster" && target.monster) {
      const ac = target.monster.armor_class as any;
      targetAc = (Array.isArray(ac) ? ac[0]?.value : ac?.value) ?? 10;
    }

    targetAc += effectDec.targetAcBonus;



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
    if (!rawHit && !isCriticalMiss) {
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
      criticalMiss: isCriticalMiss,
      advantage: advantageResult,
      hasAdvantage,
      hasDisadvantage,
      effectBonuses: rolledEffectBonuses,
    };

    events.push({
      event_type: "attack_roll",
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        actionName: dto.actionName,
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
    let concentrationBroken: boolean | undefined;

    if (hit) {

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
              sneakAttackDice = `${nDice}d6`;
              const saRoll = this.diceService.rollExpression(sneakAttackDice);
              sneakAttackDamage = saRoll.total;
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


      let resisted = false;
      let immune = false;
      let vulnerable = false;
      let finalDamage = totalDamage;
      const adjustedDamage = this.resolveDamageAdjustments(
        target,
        totalDamage,
        damageType,
      );
      finalDamage = adjustedDamage.finalDamage;
      resisted = adjustedDamage.resisted;
      immune = adjustedDamage.immune;
      vulnerable = adjustedDamage.vulnerable;

      damageRollResult = {
        rolls: [dmgResult],
        bonus: damageBonus,
        total: totalDamage,
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
        targetHpAfter = result.hpAfter;
        targetDefeated = result.defeated;
        await this.participantRepo.save(target);
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
                await this.removeDefeatedSummon(
                  encounter,
                  secondTarget,
                  events,
                  "hp-zero",
                );
              }
            }
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

    if (!dto._isSubAttack) {


      attacker.attacksUsedThisTurn = Math.min(
        attacker.attacksUsedThisTurn + 1,
        attacker.attacksMaxThisTurn,
      );
      if (attacker.attacksUsedThisTurn >= attacker.attacksMaxThisTurn) {
        attacker.actionUsed = true;
      }


      if (attacker.tacticalMasterOverride) {
        attacker.tacticalMasterOverride = null;
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




      if (hit && target.type === "pc") {
        const shieldOpp = await this.reactionOpportunity.shouldOfferShield(
          target,
          attackRollResult.total,
          targetAc,
          dto.ownerUserId,
        );
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
                    timeoutSeconds: 10,
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
                timeoutSeconds: 10,
              },
            });

            void oppEvents;
          }
        }
      }
    }

    return success(
      {
        attackRoll: attackRollResult,
        damageRoll: damageRollResult,
        targetHpAfter,
        targetDefeated,
        concentrationBroken,
      },
      events,
    );
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

    if (attacker.type !== "monster" || !attacker.monster) {
      return failure(
        "Multiataque só se aplica a monstros.",
        "INVALID_MULTIATTACK",
      );
    }
    const multiattack = (attacker.monster as any).multiattack;
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
          interruptedAt = { index: targetIdx - 1, reason: "action_cancelled" };
          break outer;
        }
        const updatedTarget = await this.encounterService.getParticipant(tid);
        subAttacks.push({
          subActionName: sub.actionName,
          targetParticipantId: tid,
          attackRoll: res.value.attackRoll,
          damageRoll: res.value.damageRoll,
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

    attacker.actionUsed = true;
    await this.participantRepo.save(attacker);

    allEvents.push({
      event_type: "multiattack_end",
      actor_participant_id: attacker.id,
      data: { subAttackCount: subAttacks.length, interruptedAt },
    });

    await this.eventService.emit(encounter.sessionId, encounterId, allEvents);

    return success(
      { kind: "multiattack", actionConsumed: true, subAttacks, interruptedAt },
      allEvents,
    );
  }



  async applyDamage(
    encounterId: string,
    dto: DamageDto,
  ): Promise<
    GameResult<{
      hpAfter: number;
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

    let hpAfter: number;
    let defeated: boolean;
    let dyingState: "none" | "dying" | "stable" | "dead" | undefined;
    let instantDeath = false;
    const events: GameEventData[] = [];
    const adjustedDamage = this.resolveDamageAdjustments(
      target,
      dto.amount,
      dto.damageType,
    );
    const finalDamage = adjustedDamage.finalDamage;

    if (target.type === "pc" && target.characterId) {
      const wasDying = target.dyingState === "dying";



      if (wasDying && finalDamage > 0) {
        const failuresDelta = dto.fromCriticalHit ? 2 : 1;
        const ds = await this.stateService.updateDeathSaves(
          dto.ownerUserId,
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
          overflowAmount = formRes.overflowToOriginal;
          if (!formReverted) {

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
        if (!target.transformationState || formReverted) {


          const effectiveDamage = formReverted ? 0 : finalDamage;
          const result = await this.stateService.updateHp(
            dto.ownerUserId,
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
      hpAfter = result.hpAfter;
      defeated = result.defeated;
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




    if (target.isConcentrating && finalDamage > 0 && !defeated) {
      const dc = Math.max(10, Math.floor(finalDamage / 2));

      let conMod = 0;
      if (target.type === "pc" && target.characterId) {
        try {
          const sheet = await this.sheetService.computeSheet(
            dto.ownerUserId,
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
      await this.removeDefeatedSummon(encounter, target, events, "hp-zero");
    }

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success({ hpAfter, defeated, dyingState, instantDeath }, events);
  }

  async applyHealing(
    encounterId: string,
    dto: HealDto,
  ): Promise<
    GameResult<{
      hpAfter: number;
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
        { healing: dto.amount },
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
        (target.currentHp ?? 0) + dto.amount,
        target.maxHp ?? 0,
      );
      if (target.currentHp > 0 && target.isDefeated) {
        target.isDefeated = false;
      }
      hpAfter = target.currentHp;
      defeated = target.isDefeated;
      await this.participantRepo.save(target);
    }

    const events: GameEventData[] = [
      {
        event_type: "hp_change",
        target_participant_id: target.id,
        data: { healing: dto.amount, hpAfter, dyingState, deathSavesReset },
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

    return success({ hpAfter, defeated, dyingState, deathSavesReset }, events);
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

    const roll = this.diceService.roll(20);
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
        data: result,
      },
    ];

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success(result, events);
  }



  private resolveDamageAdjustments(
    target: EncounterParticipantEntity,
    amount: number,
    damageType?: string | null,
  ): {
    finalDamage: number;
    resisted: boolean;
    immune: boolean;
    vulnerable: boolean;
  } {
    const typeKey = this.normalizeDamageType(damageType);
    let immune = false;
    let resisted = false;
    let vulnerable = false;

    if (typeKey) {
      const monster = target.monster;
      const immunities = this.extractDamageList(monster?.damage_immunities);
      const resistances = this.extractDamageList(monster?.damage_resistances);
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
