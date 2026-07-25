import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { SpellService } from "src/models/characters/services/spell.service";
import { EncounterService } from "./encounter.service";
import { DiceService } from "./dice.service";
import { EventService } from "./event.service";
import { EffectInstanceService } from "./effect-instance.service";
import { CombatService } from "./combat.service";
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from "../interfaces/result.type";

@Injectable()
export class PaladinFeaturesService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly encounterService: EncounterService,
    private readonly dice: DiceService,
    private readonly eventService: EventService,
    private readonly effectInstances: EffectInstanceService,
    private readonly stateService: CharacterStateService,
    private readonly spellService: SpellService,
    private readonly combatService: CombatService,
  ) {}

  async divineSmite(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
    slotLevel: number,
    freeCast: boolean,
    decline = false,
  ): Promise<
    GameResult<{
      damage: number;
      diceCount: number;
      baseDice: number;
      fiendUndeadBonus: boolean;
      critical: boolean;
      slotConsumed: boolean;
      targetPrevHp: number;
      targetNewHp: number;
      resisted: boolean;
      immune: boolean;
      vulnerable: boolean;
      defeated: boolean;
      declined?: boolean;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    if (paladin.encounterId !== encounterId) {
      return failure(
        "Participante não pertence ao encontro.",
        "INVALID_PARTICIPANT",
      );
    }
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return failure("Encontro não está ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure(
        "Não é o turno deste participante.",
        "NOT_YOUR_TURN",
      );
    }
    const pending = (paladin.effectInstances ?? []).find(
      (effect) =>
        effect.kind === "divine_smite_pending" &&
        effect.payload?.requiredTargetId === targetParticipantId,
    );
    if (!pending) {
      return failure(
        "Divine Smite exige um acerto corpo a corpo recém-resolvido.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    if (decline) {
      const removed = await this.effectInstances.removeEffect(
        paladin,
        pending.id,
        "manual",
      );
      const event: GameEventData = {
        event_type: "divine_smite_declined",
        actor_participant_id: paladin.id,
        target_participant_id: targetParticipantId,
        data: { featureSlug: "divine-smite" },
      };
      const events = [...removed.events, event];
      await this.eventService.emit(
        encounter.sessionId,
        encounterId,
        events,
      );
      return success(
        {
          damage: 0,
          diceCount: 0,
          baseDice: 0,
          fiendUndeadBonus: false,
          critical: pending.payload?.hitWasCritical === true,
          slotConsumed: false,
          targetPrevHp: 0,
          targetNewHp: 0,
          resisted: false,
          immune: false,
          vulnerable: false,
          defeated: false,
          declined: true,
        },
        events,
      );
    }

    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const smiteFeatures = sheet as typeof sheet & {
      hasDivineSmite?: boolean;
      hasPaladinsSmite?: boolean;
      hasSmiteOfProtection?: boolean;
    };
    const hasSmite =
      smiteFeatures.hasDivineSmite === true ||
      smiteFeatures.hasPaladinsSmite === true;
    const paladinLevel =
      sheet.classes.find(
        (classBlock) =>
          classBlock.slug.replace(/-(phb|xphb)$/i, "") === "paladin",
      )?.level ?? 0;
    const sourceEdition =
      pending.payload?.sourceEdition ?? sheet.source?.code;
    const is2024Rules = sourceEdition !== "PHB";
    if (!hasSmite || paladinLevel < (is2024Rules ? 1 : 2)) {
      return failure(
        "O personagem não possui Divine Smite.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    if (is2024Rules && paladin.bonusActionUsed) {
      return failure(
        "Divine Smite exige a ação bônus disponível.",
        "BONUS_ACTION_ALREADY_USED",
      );
    }

    if (freeCast) {
      if (
        smiteFeatures.hasPaladinsSmite !== true ||
        paladinLevel < 2
      ) {
        return failure(
          "O uso gratuito exige Paladin's Smite.",
          "FEATURE_NOT_AVAILABLE",
        );
      }
      const featureUses = await this.stateService.getFeatureUsesUsed(
        paladin.characterId,
      );
      if ((featureUses["paladins-smite-free"] ?? 0) >= 1) {
        return failure(
          "O uso gratuito de Paladin's Smite já foi gasto.",
          "NO_USES_REMAINING",
        );
      }
    } else {
      if (!Number.isInteger(slotLevel) || slotLevel < 1 || slotLevel > 9) {
        return failure("slotLevel inválido (1-9).", "INVALID_PAYLOAD");
      }
      const slot = sheet.spellSlots.find(
        (entry) =>
          entry.level === slotLevel &&
          entry.used < entry.total,
      );
      if (!slot) {
        return failure(
          `Sem slots de nível ${slotLevel} disponíveis.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }
    }

    const target =
      await this.encounterService.getParticipant(targetParticipantId);
    if (target.encounterId !== encounterId || target.isDefeated) {
      return failure("Alvo inválido ou derrotado.", "INVALID_TARGET");
    }
    const effectiveSlot = freeCast
      ? 1
      : is2024Rules
        ? slotLevel
        : Math.min(slotLevel, 4);
    const baseDice = 2 + (effectiveSlot - 1);
    const targetType = String(target.monster?.type ?? "").toLowerCase();
    const fiendUndeadBonus =
      targetType === "fiend" || targetType === "undead";
    const bonusDice = !is2024Rules && fiendUndeadBonus ? 1 : 0;
    const hitWasCritical = pending.payload?.hitWasCritical === true;
    let totalDice = baseDice + bonusDice;
    if (hitWasCritical) totalDice *= 2;

    let damage = 0;
    for (let i = 0; i < totalDice; i++) damage += this.dice.roll(8);

    const previousHp =
      target.type === "pc" && target.characterId
        ? (await this.stateService.getCurrentHp(target.characterId)) ??
          target.currentHp ??
          0
        : target.currentHp ?? 0;
    if (freeCast) {
      await this.stateService.incrementFeatureUses(
        paladin.characterId,
        "paladins-smite-free",
      );
    } else {
      const slot = sheet.spellSlots.find(
        (entry) => entry.level === slotLevel,
      )!;
      await this.spellService.updateSpellSlots(
        userId,
        paladin.characterId,
        {
          level: slot.kind === "pact" ? -1 : slotLevel,
          used: slot.used + 1,
        },
      );
    }
    if (is2024Rules) paladin.bonusActionUsed = true;
    paladin.effectInstances = (paladin.effectInstances ?? []).filter(
      (effect) => effect.id !== pending.id,
    );
    await this.participantRepo.save(paladin);

    const damageResult = await this.combatService.applyDamage(
      encounterId,
      {
        targetParticipantId,
        amount: damage,
        damageType: "radiant",
        ownerUserId: userId,
      },
      { emitEvents: false },
    );
    if (!damageResult.ok) {
      return failure(damageResult.error, damageResult.code);
    }

    const protectionEvents: GameEventData[] = [];
    if (is2024Rules && smiteFeatures.hasSmiteOfProtection === true) {
      const previousProtection = (paladin.effectInstances ?? []).filter(
        (effect) =>
          effect.kind === "aura_half_cover" &&
          effect.sourceFeatureSlug === "smite-of-protection",
      );
      for (const effect of previousProtection) {
        const removed = await this.effectInstances.removeEffect(
          paladin,
          effect.id,
          "manual",
        );
        protectionEvents.push(...removed.events);
      }
      const applied = await this.effectInstances.addEffect(paladin, {
        kind: "aura_half_cover",
        sourceFeatureSlug: "smite-of-protection",
        sourceCasterParticipantId: paladin.id,
        payload: {
          amount: 2,
          armorClassBonus: 2,
          dexteritySaveBonus: 2,
          radiusFeet: paladinLevel >= 18 ? 30 : 10,
        },
        expiresAt: { kind: "until_caster_turn" },
        requiresConcentration: false,
      });
      protectionEvents.push(...applied.events);
    }

    const slotConsumed = !freeCast;
    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: paladin.id,
      target_participant_id: target.id,
      data: {
        featureSlug: "divine-smite",
        damage,
        damageApplied: damageResult.value.damageApplied,
        diceCount: totalDice,
        baseDice,
        bonusDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotLevel: freeCast ? 0 : slotLevel,
        freeCast,
        slotConsumed,
        targetPrevHp: previousHp,
        targetNewHp: damageResult.value.hpAfter,
        resisted: damageResult.value.resisted,
        immune: damageResult.value.immune,
        vulnerable: damageResult.value.vulnerable,
        defeated: damageResult.value.defeated,
        sourceEdition,
        smiteOfProtection:
          is2024Rules && smiteFeatures.hasSmiteOfProtection === true,
      },
    };
    const events = [...damageResult.events, ...protectionEvents, event];
    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success(
      {
        damage,
        diceCount: totalDice,
        baseDice,
        fiendUndeadBonus,
        critical: hitWasCritical,
        slotConsumed,
        targetPrevHp: previousHp,
        targetNewHp: damageResult.value.hpAfter,
        resisted: damageResult.value.resisted,
        immune: damageResult.value.immune,
        vulnerable: damageResult.value.vulnerable,
        defeated: damageResult.value.defeated,
      },
      events,
    );
  }

  async radiantStrikes(
    userId: string,
    encounterId: string,
    participantId: string,
    targetParticipantId: string,
  ): Promise<
    GameResult<{
      damage: number;
      targetPrevHp: number;
      targetNewHp: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const hasRadiantStrikes =
      (sheet as typeof sheet & { hasRadiantStrikes?: boolean })
        .hasRadiantStrikes === true;
    const paladinLevel =
      sheet.classes.find(
        (classBlock) =>
          classBlock.slug.replace(/-(phb|xphb)$/i, "") === "paladin",
      )?.level ?? 0;
    if (!hasRadiantStrikes || paladinLevel < 11) {
      return failure(
        "Requer Paladin L11+ com Radiant Strikes.",
        "FEATURE_NOT_AVAILABLE",
      );
    }

    return failure(
      "Golpes Radiantes é aplicado automaticamente em cada acerto corpo a corpo.",
      "INVALID_ACTION",
    );
  }

  async sacredWeapon(
    userId: string,
    encounterId: string,
    participantId: string,
  ): Promise<
    GameResult<{
      chaBonus: number;
      durationRounds: number;
      armed: boolean;
      weaponName: string;
      usesRemaining: number;
    }>
  > {
    const paladin = await this.encounterService.getParticipant(participantId);
    if (paladin.type !== "pc" || !paladin.characterId) {
      return failure("Apenas PCs.", "INVALID_PARTICIPANT");
    }
    const sheet = await this.sheetService.computeSheet(
      userId,
      paladin.characterId,
    );
    const hasSacredWeapon =
      (sheet as typeof sheet & { hasSacredWeapon?: boolean })
        .hasSacredWeapon === true;
    if (!hasSacredWeapon) {
      return failure(
        "Requer Paladin Devotion L3+ com Sacred Weapon.",
        "FEATURE_NOT_AVAILABLE",
      );
    }
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (
      !encounter ||
      encounter.status !== "active" ||
      paladin.encounterId !== encounterId
    ) {
      return failure("Encontro não está ativo.", "ENCOUNTER_NOT_ACTIVE");
    }
    if (encounter.turnOrder[encounter.currentTurnIndex] !== participantId) {
      return failure(
        "Não é o turno deste participante.",
        "NOT_YOUR_TURN",
      );
    }
    if (
      (paladin.conditions ?? []).some((condition) =>
        [
          "incapacitated",
          "paralyzed",
          "petrified",
          "stunned",
          "unconscious",
        ].includes(condition),
      )
    ) {
      return failure(
        "A condição atual impede Arma Sagrada.",
        "CONDITION_PREVENTS_ACTION",
      );
    }
    const is2024Rules = sheet.source?.code !== "PHB";
    if (paladin.actionUsed) {
      return failure(
        is2024Rules
          ? "Ative Arma Sagrada antes do primeiro ataque da ação Atacar."
          : "A ação deste turno já foi usada.",
        "ACTION_ALREADY_USED",
      );
    }
    const heldWeapon = sheet.equipment.find(
      (equipment) =>
        (equipment.mainHand || equipment.offHand) &&
        equipment.damage != null &&
        !/ammunition|ranged/i.test(
          JSON.stringify(equipment.properties ?? {}),
        ),
    );
    if (!heldWeapon) {
      return failure(
        "Arma Sagrada exige uma arma corpo a corpo empunhada.",
        "NOT_EQUIPPED",
      );
    }
    const maximumUses = is2024Rules ? 2 : 1;
    const featureUses = await this.stateService.getFeatureUsesUsed(
      paladin.characterId,
    );
    const used = featureUses["channel-divinity"] ?? 0;
    if (used >= maximumUses) {
      return failure(
        "Sem usos de Canalizar Divindade.",
        "NO_USES_REMAINING",
      );
    }
    const chaAbility = sheet.abilityScores.find(
      (ability) => ability.slug === "cha",
    );
    const chaBonus = Math.max(1, chaAbility?.modifier ?? 0);

    const previousEffects = (paladin.effectInstances ?? []).filter(
      (effect) =>
        effect.kind === "attack_bonus" &&
        effect.sourceFeatureSlug === "sacred-weapon",
    );
    const replacementEvents: GameEventData[] = [];
    for (const effect of previousEffects) {
      const removed = await this.effectInstances.removeEffect(
        paladin,
        effect.id,
        "manual",
      );
      replacementEvents.push(...removed.events);
    }
    const effect = await this.effectInstances.addEffect(paladin, {
      kind: "attack_bonus",
      sourceFeatureSlug: "sacred-weapon",
      sourceCasterParticipantId: paladin.id,
      payload: {
        amount: chaBonus,
        scope: "melee",
        weaponSlug: `weapon-${heldWeapon.id}`,
      },
      expiresAt: { kind: "rounds", value: 10 },
      requiresConcentration: false,
    });
    await this.stateService.incrementFeatureUses(
      paladin.characterId,
      "channel-divinity",
    );
    if (!is2024Rules) {
      paladin.actionUsed = true;
      await this.participantRepo.save(paladin);
    }

    const event: GameEventData = {
      event_type: "class_feature_triggered",
      actor_participant_id: paladin.id,
      data: {
        featureSlug: "sacred-weapon",
        chaBonus,
        durationRounds: 10,
        weaponName: heldWeapon.name,
        weaponSlug: `weapon-${heldWeapon.id}`,
        usesRemaining: maximumUses - used - 1,
        sourceEdition: sheet.source?.code,
      },
    };
    const events = [...replacementEvents, ...effect.events, event];
    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );
    return success(
      {
        chaBonus,
        durationRounds: 10,
        armed: true,
        weaponName: heldWeapon.name,
        usesRemaining: maximumUses - used - 1,
      },
      events,
    );
  }
}
