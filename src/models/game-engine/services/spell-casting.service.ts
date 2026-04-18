import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpellEntity } from 'src/entities/spell.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { GameEventEntity } from 'src/entities/game-event.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { SpellService } from 'src/models/characters/services/spell.service';
import { DiceService } from './dice.service';
import { SavingThrowService } from './saving-throw.service';
import { CombatService } from './combat.service';
import { EncounterService } from './encounter.service';
import { MonsterSpellcastingService } from './monster-spellcasting.service';
import {
  GameResult,
  GameEventData,
  GameErrorCode,
  success,
  failure,
} from '../interfaces/result.type';
import {
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
} from './spell-targeting';
import { EffectInstanceService } from './effect-instance.service';
import {
  materializeSpellEffects,
  checkSpellPreconditions,
  type TargetMetadata,
} from './spell-effect-catalog';
import { getAbilityModifier } from 'src/shared/srd-utils';
import { getSpellDamage } from './spell-damage-catalog';
import { getSpellCondition } from './spell-condition-catalog';
import { ConditionLifecycleService } from './condition-lifecycle.service';

// --- Result interfaces ---

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
}

// --- DTOs ---

export interface CastSpellDto {
  characterId: string;
  userId: string;
  spellSlug: string;
  slotLevel: number;
  targetIds?: string[];
  encounterId?: string;
  sessionId?: string;
  ownerUserId: string;
}

export interface CastSpellInCombatDto {
  encounterId: string;
  participantId: string;
  spellSlug: string;
  slotLevel: number;
  targetParticipantIds: string[];
  ownerUserId: string;
  /** Spec 003 Fatia 9 — cast como reaction (Shield, Counterspell, etc.).
   *  Skip validação de turno; consome reactionsUsed em vez de actionUsed;
   *  exige casting_time da spell contendo 'reaction' + triggerEventId. */
  asReaction?: boolean;
  /** Evento que disparou a reaction (ex: attack_rolled pro Shield). Obrigatório se asReaction=true. */
  triggerEventId?: string;
}

export interface CombatSpellResult extends SpellCastResult {
  targetsHit: Array<{
    participantId: string;
    displayName: string;
    damageDealt?: number;
    healingApplied?: number;
    savedSuccessfully?: boolean;
    defeated?: boolean;
  }>;
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
  ) {}

  async castSpell(dto: CastSpellDto): Promise<GameResult<SpellCastResult>> {
    // 1. Get character sheet to verify spell access and slots
    const sheet = await this.sheetService.computeSheet(dto.userId, dto.characterId);
    if (!sheet) {
      return failure('Personagem nao encontrado.', 'INVALID_PARTICIPANT');
    }

    // 2. Check character knows/has the spell prepared
    const charSpellRef = sheet.spells.find(
      (s) => s.slug === dto.spellSlug || s.name.toLowerCase() === dto.spellSlug.toLowerCase(),
    );
    if (!charSpellRef) {
      return failure(`Magia '${dto.spellSlug}' nao encontrada no repertorio.`, 'INVALID_ACTION');
    }

    // 3. Fetch full spell data from DB (has damage, concentration, components, etc.)
    const spell = await this.spellRepo.findOne({ where: { slug: charSpellRef.slug } });
    if (!spell) {
      return failure(`Dados da magia '${dto.spellSlug}' nao encontrados.`, 'INVALID_ACTION');
    }

    // 4. Cantrips don't consume slots
    const isCantrip = spell.level === 0;

    if (!isCantrip) {
      // 5. Check slot availability
      if (dto.slotLevel < spell.level) {
        return failure(
          `Slot nivel ${dto.slotLevel} insuficiente para magia nivel ${spell.level}.`,
          'INSUFFICIENT_SPELL_SLOTS',
        );
      }

      const slotBlock = sheet.spellSlots.find((s) => s.level === dto.slotLevel);
      if (!slotBlock || slotBlock.used >= slotBlock.total) {
        return failure(
          `Sem slots de nivel ${dto.slotLevel} disponiveis.`,
          'INSUFFICIENT_SPELL_SLOTS',
        );
      }

      // 6. Consume the slot
      await this.spellService.updateSpellSlots(dto.userId, dto.characterId, {
        level: dto.slotLevel,
        used: slotBlock.used + 1,
      });
    }

    // 7. Handle concentration
    let previousConcentration: string | undefined;
    const isConcentration = spell.concentration ?? false;

    // Note: concentration tracking is managed by the combat service's
    // EncounterParticipantEntity.isConcentrating/concentratingOn fields.
    // The DM agent handles breaking previous concentration narratively.

    // 8. Build result
    const events: GameEventData[] = [];
    const result: SpellCastResult = {
      spellName: spell.name,
      spellLevel: spell.level,
      slotUsed: isCantrip ? 0 : dto.slotLevel,
      concentration: isConcentration,
      previousConcentration,
    };

    // 9. Resolve damage if applicable.
    // Spec 005 Addendum: spell-damage-catalog como fonte primária (seed não tem
    // damage_at_slot_level). Fallback para DB spell.damage quando catálogo miss.
    const catalogDmg = getSpellDamage(spell.slug, dto.slotLevel, sheet.totalLevel);
    if (catalogDmg) {
      const rollResult = this.diceService.rollExpression(catalogDmg.expression);
      result.damage = {
        expression: catalogDmg.expression,
        total: rollResult.total,
        type: catalogDmg.type,
      };
      events.push({
        event_type: 'spell_damage',
        data: {
          spell: spell.name,
          expression: catalogDmg.expression,
          total: rollResult.total,
          type: catalogDmg.type,
          slot_level: dto.slotLevel,
          source: 'catalog',
        },
      });
    } else if (spell.damage) {
      const damageInfo = spell.damage as Record<string, any>;
      const slotKey = String(dto.slotLevel);
      const cantripScalingExpr = (() => {
        const map = damageInfo?.damage_at_character_level;
        if (!map || typeof map !== 'object') return null;
        const lvl = sheet.totalLevel;
        const validKeys = Object.keys(map)
          .map((k) => parseInt(k, 10))
          .filter((n) => Number.isFinite(n) && n <= lvl)
          .sort((a, b) => b - a);
        return validKeys.length > 0 ? map[String(validKeys[0])] : null;
      })();
      const expression =
        damageInfo?.damage_at_slot_level?.[slotKey] ??
        cantripScalingExpr ??
        damageInfo?.base ??
        null;

      if (expression) {
        const rollResult = this.diceService.rollExpression(expression);
        const damageType = damageInfo?.damage_type?.name ?? 'magical';
        result.damage = {
          expression,
          total: rollResult.total,
          type: damageType,
        };
        events.push({
          event_type: 'spell_damage',
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

    // 10. Resolve healing if applicable
    if (spell.heal_at_slot_level) {
      const healInfo = spell.heal_at_slot_level as Record<string, string>;
      const slotKey = String(dto.slotLevel);
      const expression = healInfo[slotKey] ?? null;

      if (expression) {
        const rollResult = this.diceService.rollExpression(expression);
        result.healing = {
          expression,
          total: rollResult.total,
        };

        events.push({
          event_type: 'spell_healing',
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
      event_type: 'spell_cast',
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
    // 1. Validate encounter is active
    const encounter = await this.encounterRepo.findOne({
      where: { id: dto.encounterId },
    });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    // 2. Validate it's this participant's turn — SKIP se asReaction=true (Spec 003 Fatia 9).
    if (!dto.asReaction) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.participantId)
        return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');
    } else if (!dto.triggerEventId) {
      return failure("asReaction=true exige 'triggerEventId'.", 'MISSING_TRIGGER_EVENT');
    }

    const participant = await this.encounterService.getParticipant(dto.participantId);
    if (participant.type === 'monster') {
      return this.castMonsterSpellInCombat(dto, participant);
    }
    if (!participant.characterId)
      return failure('Apenas PCs e monstros casters podem lancar magias.', 'INVALID_PARTICIPANT');

    // 3. Get the spell to determine casting time
    const spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {
      // Try by name
      const byName = await this.spellRepo.findOne({
        where: { name: dto.spellSlug },
      });
      if (!byName)
        return failure(`Magia '${dto.spellSlug}' nao encontrada.`, 'INVALID_ACTION');
      dto.spellSlug = byName.slug;
    }
    const spellData = spell ?? (await this.spellRepo.findOne({ where: { slug: dto.spellSlug } }))!;

    // 3.5 Spec 005 US14 — validar número de alvos:
    //   - AoE (area_of_effect != null): aceita N >= 1 (forma define).
    //   - Multi-target não-AoE curada (Magic Missile, Eldritch Blast, Scorching Ray):
    //     aceita N até o limite do spell/slot/nível.
    //   - Single-target default: rejeita length > 1 com SPELL_NOT_AOE.
    const targetCount = dto.targetParticipantIds?.length ?? 0;
    if (targetCount > 1 && !isAoeSpell(spellData)) {
      let casterLevel = 0;
      if (isMultiTargetNonAoeSpell(spellData)) {
        const sheet = await this.sheetService.computeSheet(dto.ownerUserId, participant.characterId);
        casterLevel = (sheet as any)?.totalLevel ?? 0;
      }
      const maxTargets = maxTargetsFor(spellData, dto.slotLevel, casterLevel);
      if (targetCount > maxTargets) {
        return failure(GameErrorCode.SPELL_NOT_AOE);
      }
    }

    // 4. Check action economy based on casting time
    const castingTime = (spellData.casting_time ?? 'action').toLowerCase();
    const isBonusAction = castingTime.includes('bonus');
    const isReactionSpell = castingTime.includes('reaction');

    // Spec 003 Fatia 9 — asReaction requer spell.casting_time contendo 'reaction'.
    if (dto.asReaction && !isReactionSpell) {
      return failure(
        `A magia '${dto.spellSlug}' nao e castavel como reaction (casting_time='${spellData.casting_time}').`,
        'SPELL_NOT_REACTION',
      );
    }

    if (dto.asReaction) {
      if (participant.reactionsUsed > 0)
        return failure('Reacao ja utilizada.', 'REACTION_ALREADY_USED');
    } else if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure('Bonus action ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
    } else {
      if (participant.actionUsed)
        return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
    }

    // 4.5 Spec 004 — pre-conditions mecanicas (ex: Mage Armor exige alvo sem armadura).
    const targetMeta: TargetMetadata[] = [];
    for (const tid of dto.targetParticipantIds) {
      const t = await this.encounterService.getParticipant(tid).catch(() => null);
      if (!t) continue;
      const isWearingArmor = await this.isTargetWearingArmor(t, dto.ownerUserId);
      targetMeta.push({ id: t.id, isWearingArmor, participant: t });
    }
    const precondFail = checkSpellPreconditions(dto.spellSlug, targetMeta);
    if (precondFail) {
      return failure(precondFail.message, precondFail.code as any);
    }

    // 5. Cast the spell (validates slots, components, etc.)
    const castResult = await this.castSpell({
      characterId: participant.characterId,
      userId: dto.ownerUserId,
      spellSlug: dto.spellSlug,
      slotLevel: dto.slotLevel,
      targetIds: dto.targetParticipantIds,
      encounterId: dto.encounterId,
      ownerUserId: dto.ownerUserId,
    });

    if (!castResult.ok) return castResult as any;

    const spellResult = castResult.value;

    // 6. Mark action used (Spec 003 Fatia 9: asReaction consome reaction em vez).
    if (dto.asReaction) {
      participant.reactionsUsed = participant.reactionsUsed + 1;
    } else if (isBonusAction) {
      participant.bonusActionUsed = true;
    } else {
      participant.actionUsed = true;
    }

    // 7. Handle concentration
    // Spec 012: concentratingOn é exposto como `spellSlug` no API response
    // (encounter-response.dto.ts). Persistimos o slug canônico — era spell.name
    // (i18n-sensitive, quebra comparação invariant-driven).
    if (spellResult.concentration) {
      if (participant.isConcentrating) {
        spellResult.previousConcentration = participant.concentratingOn ?? undefined;
      }
      participant.isConcentrating = true;
      participant.concentratingOn = dto.spellSlug;
    }

    await this.participantRepo.save(participant);

    // 8. Apply effects to targets
    const targetsHit: CombatSpellResult['targetsHit'] = [];
    const events = [...(castResult.events ?? [])];

    for (const targetId of dto.targetParticipantIds) {
      const target = await this.encounterService.getParticipant(targetId);
      const targetResult: CombatSpellResult['targetsHit'][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };

      // Apply damage
      if (spellResult.damage && spellResult.damage.total > 0) {
        let finalDamage = spellResult.damage.total;

        // Saving throw for half damage (PC + monster)
        if (spellData.dc) {
          const dcInfo = spellData.dc as Record<string, any>;
          const rawAbility = Array.isArray(dcInfo.dc_type) ? dcInfo.dc_type[0] : (dcInfo.dc_type?.name ?? dcInfo.dc_type ?? 'dexterity');
          const saveAbility = String(rawAbility).toLowerCase().substring(0, 3);
          const casterSheet = await this.sheetService.computeSheet(dto.ownerUserId, participant.characterId);
          const casterClass = casterSheet.classes?.find((c: any) => c.spellSaveDc != null);
          const spellSaveDc = casterClass?.spellSaveDc ?? 13;

          const saveResult = await this.rollMonsterOrPcSave(target, saveAbility, spellSaveDc, dto.ownerUserId);
          if (saveResult.success) {
            const dcSuccess = dcInfo.dc_success ?? 'half';
            if (dcSuccess === 'half') {
              finalDamage = Math.floor(finalDamage / 2);
            } else if (dcSuccess === 'none') {
              finalDamage = 0;
            }
            targetResult.savedSuccessfully = true;
          }
        }

        const dmgResult = await this.combatService.applyDamage(dto.encounterId, {
          targetParticipantId: targetId,
          amount: finalDamage,
          damageType: spellResult.damage.type,
          ownerUserId: dto.ownerUserId,
        });

        targetResult.damageDealt = finalDamage;
        if (dmgResult.ok) {
          targetResult.defeated = dmgResult.value.defeated;
        }
      }

      // Apply healing
      if (spellResult.healing && spellResult.healing.total > 0) {
        await this.combatService.applyHealing(dto.encounterId, {
          targetParticipantId: targetId,
          amount: spellResult.healing.total,
          ownerUserId: dto.ownerUserId,
        });
        targetResult.healingApplied = spellResult.healing.total;
      }

      // Spec 005 Addendum — apply condition from spell-condition-catalog
      const condEntry = getSpellCondition(dto.spellSlug);
      if (condEntry && target.id !== participant.id) {
        const sheet = await this.sheetService.computeSheet(dto.ownerUserId, participant.characterId);
        const casterClass = (sheet as any).classes?.find((c: any) => c.spellSaveDc != null);
        const spellSaveDc: number = casterClass?.spellSaveDc ?? 13;

        const saveRoll = this.rollMonsterOrPcSave(
          target,
          condEntry.saveAbility,
          spellSaveDc,
          dto.ownerUserId,
        );
        const saveResult = await saveRoll;
        if (!saveResult.success) {
          const condResult = await this.conditionLifecycle.applyCondition(target, {
            slug: condEntry.conditionSlug,
            appliedBy: participant.id,
            sourceSpell: dto.spellSlug,
            sourceConcentration: condEntry.requiresConcentration,
            saveAbility: condEntry.saveAbility,
            saveDc: spellSaveDc,
            repeatSaveTiming: condEntry.repeatSaveTiming,
            durationRoundsRemaining: condEntry.durationRounds,
          });
          events.push(...condResult.events);
          (targetResult as any).conditionApplied = {
            instanceId: condResult.instance.id,
            slug: condResult.instance.slug,
            durationRoundsRemaining: condEntry.durationRounds,
          };
        } else {
          targetResult.savedSuccessfully = true;
        }
      }

      targetsHit.push(targetResult);
    }

    // 9. Spec 004 — materializar EffectInstance (catalogo de spells conhecidas).
    const casterDex =
      spellResult && (spellResult as any).casterDex != null
        ? (spellResult as any).casterDex
        : await this.getCasterDexModifier(participant, dto.ownerUserId);
    const materializations = materializeSpellEffects(dto.spellSlug, {
      casterParticipantId: participant.id,
      targetParticipantIds: dto.targetParticipantIds,
      slotLevel: dto.slotLevel,
      casterDexModifier: casterDex,
    });
    const appliedEffectIds: string[] = [];
    for (const m of materializations) {
      const targetP = await this.encounterService
        .getParticipant(m.targetParticipantId)
        .catch(() => null);
      if (!targetP) continue;
      const { effect, events: effectEvents } =
        await this.effectInstanceService.addEffect(targetP, m.input);
      appliedEffectIds.push(effect.id);
      events.push(...effectEvents);
    }

    // 10. Spec 004 — Shield retroativa: se cast com triggerEventId, re-avalia
    // o attack trigger com novo AC efetivo. Se virava miss, reverte damage.
    let retroactiveReview: any = undefined;
    if (
      dto.asReaction &&
      dto.triggerEventId &&
      dto.spellSlug.toLowerCase().replace(/-(phb|xphb)$/, '') === 'shield'
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

    return success(
      { ...spellResult, targetsHit, appliedEffectIds, retroactiveReview } as any,
      events,
    );
  }

  /**
   * Spec 004 — Shield reaction retroativa. Lê o evento attack_roll original,
   * soma +5 no targetAc, re-avalia hit. Se passa a miss, reverte o damage
   * aplicado (via applyHealing no target).
   */
  private async recomputeShieldTrigger(
    encounterId: string,
    triggerEventId: string,
    casterParticipantId: string,
    ownerUserId: string,
  ): Promise<{ newHit: boolean; previousHit: boolean; damageReverted: number; events: any[] } | null> {
    const trigger = await this.gameEventRepo.findOne({
      where: { id: triggerEventId },
    });
    if (!trigger || trigger.eventType !== 'attack_roll') return null;
    const data = trigger.data as any;
    const prevHit: boolean = data.hit ?? false;
    const prevTotal: number = data.total ?? 0;
    const prevAc: number = data.targetAc ?? 10;
    const newAc = prevAc + 5;
    const newHit = prevTotal >= newAc && !data.criticalMiss;
    const events: any[] = [
      {
        event_type: 'shield_retroactive_review',
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
    if (prevHit && !newHit) {
      // Reverte damage: acha o proximo damage_applied/hp_change que seguiu o
      // attack (mesmo target). Event shape: data.damage.finalDamage ou
      // data.damage ou data.amount dependendo do emitter.
      const hpChange = await this.gameEventRepo
        .createQueryBuilder('e')
        .where('e.encounterId = :encId', { encId: encounterId })
        .andWhere("e.eventType IN ('damage_applied', 'hp_change')")
        .andWhere('e.targetParticipantId = :tid', { tid: trigger.targetParticipantId })
        .andWhere('e.sequence >= :seq', { seq: trigger.sequence })
        .orderBy('e.sequence', 'ASC')
        .limit(1)
        .getOne();
      if (hpChange) {
        const d = hpChange.data as any;
        const dmg =
          d?.damage?.finalDamage ??
          d?.damage?.total ??
          (typeof d?.damage === 'number' ? d.damage : undefined) ??
          d?.amount ??
          0;
        if (dmg > 0) {
          // Apply healing equivalente no target (delegando a combat.service)
          await this.combatService.applyHealing(encounterId, {
            targetParticipantId: trigger.targetParticipantId!,
            amount: dmg,
            ownerUserId,
          });
          damageReverted = dmg;
          events.push({
            event_type: 'shield_damage_reverted',
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
      events,
    };
  }

  /**
   * Detecta se o participant tem armor equipada (armor base > 0).
   * - PC: inspeciona sheet.equipment e busca peca nao-escudo com ac.base > 0.
   * - Monster: true se AC aparenta vir de natural armor (nao-leather).
   * Heuristica simples — refinada em spec futura.
   */
  private async isTargetWearingArmor(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<boolean> {
    if (participant.type === 'pc' && participant.characterId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        const equip = (sheet as any)?.equipment ?? [];
        for (const eq of equip) {
          if (!eq.equipped || !eq.armorClass) continue;
          const slug = (eq.slug ?? '').toLowerCase();
          const name = (eq.name ?? '').toLowerCase();
          if (slug === 'shield' || name === 'shield') continue;
          const base = (eq.armorClass as any)?.base ?? 0;
          if (base > 0) return true;
        }
        return false;
      } catch {
        return false;
      }
    }
    // Monsters: quase sempre tem natural armor — Mage Armor RAW nao se aplica.
    return participant.type === 'monster';
  }

  /** Retorna DEX modifier do caster (PC via sheet, monster via statblock). */
  private async getCasterDexModifier(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<number> {
    if (participant.type === 'pc' && participant.characterId) {
      const sheet = await this.sheetService.computeSheet(
        ownerUserId,
        participant.characterId,
      );
      const dexBlock = (sheet?.abilityScores ?? []).find(
        (a) => a.slug === 'dex' || a.slug === 'dexterity',
      );
      if (dexBlock) return dexBlock.modifier;
      return 0;
    }
    const dex = (participant.monster as any)?.stats?.dex ?? 10;
    return getAbilityModifier(dex);
  }

  /**
   * Monster caster branch. Reads `monster.spellcasting` for DC/attack bonus,
   * debits slots/uses via `MonsterSpellcastingService`, then applies damage
   * (with saves) or healing to each target.
   */
  private async castMonsterSpellInCombat(
    dto: CastSpellInCombatDto,
    participant: EncounterParticipantEntity,
  ): Promise<GameResult<CombatSpellResult>> {
    const sc = (participant.monster as any)?.spellcasting;
    if (!sc) return failure('Este monstro não possui magia.', 'INVALID_SPELL');

    const check = this.monsterSpellcasting.canCast(participant, dto.spellSlug, dto.slotLevel);
    if (!check.allowed) {
      return failure(
        check.message ?? 'Não pode lançar esta magia.',
        check.code ?? 'INVALID_SPELL',
      );
    }

    let spell = await this.spellRepo.findOne({ where: { slug: dto.spellSlug } });
    if (!spell) {
      spell = await this.spellRepo.findOne({ where: { name: dto.spellSlug } });
    }
    if (!spell) {
      return failure(`Magia '${dto.spellSlug}' nao encontrada.`, 'INVALID_SPELL');
    }

    const castingTime = (spell.casting_time ?? 'action').toLowerCase();
    const isBonusAction = castingTime.includes('bonus');
    if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure('Bonus action ja utilizada neste turno.', 'NO_BONUS_ACTION_AVAILABLE');
    } else {
      if (participant.actionUsed)
        return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
    }

    // Damage from spell.damage JSON (damage_at_slot_level keyed by slot number).
    const damageInfo: any = (spell as any).damage ?? {};
    const damageType: string =
      damageInfo?.damage_type?.name ??
      damageInfo?.damage_type ??
      'force';

    let damageExpression: string | undefined;
    if (damageInfo.damage_at_slot_level) {
      damageExpression = damageInfo.damage_at_slot_level[String(dto.slotLevel)];
    } else if (damageInfo.damage_at_character_level) {
      damageExpression = damageInfo.damage_at_character_level[String(sc.casterLevel ?? 1)];
    }

    const concentration = Boolean((spell as any).concentration);
    const saveAbility = this.resolveSaveAbility(spell);

    const baseRoll = damageExpression
      ? this.diceService.rollExpression(damageExpression)
      : null;

    const events: GameEventData[] = [];
    events.push({
      event_type: 'spell_cast',
      actor_participant_id: participant.id,
      data: {
        spellSlug: dto.spellSlug,
        spellName: spell.name,
        slotLevel: dto.slotLevel,
        casterType: 'monster',
        saveDc: sc.saveDc,
      },
    });

    const targetsHit: CombatSpellResult['targetsHit'] = [];

    for (const targetId of dto.targetParticipantIds) {
      const target = await this.encounterService.getParticipant(targetId);
      const entry: CombatSpellResult['targetsHit'][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };

      if (baseRoll) {
        let finalDamage = baseRoll.total;
        if (saveAbility) {
          if (target.type === 'pc' && target.characterId) {
            const saveRes = await this.savingThrowService.rollSavingThrow({
              characterId: target.characterId,
              ability: saveAbility,
              dc: sc.saveDc,
              userId: dto.ownerUserId,
            });
            if (saveRes.ok && saveRes.value?.success) {
              finalDamage = Math.floor(finalDamage / 2);
              entry.savedSuccessfully = true;
            }
          }
        }

        const dmg = await this.combatService.applyDamage(dto.encounterId, {
          targetParticipantId: targetId,
          amount: finalDamage,
          damageType,
          ownerUserId: dto.ownerUserId,
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
      // Spec 012: persistir slug (consistência com encounter-response.spellSlug).
      participant.isConcentrating = true;
      participant.concentratingOn = spell.slug;
    }

    await this.participantRepo.save(participant);

    const result: CombatSpellResult = {
      spellName: spell.name,
      spellLevel: dto.slotLevel,
      slotUsed: sc.type === 'standard' ? dto.slotLevel : 0,
      concentration,
      damage: baseRoll
        ? {
            expression: damageExpression ?? '',
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
    if (typeof ability !== 'string') return null;
    return ability.toLowerCase().substring(0, 3);
  }

  /**
   * Spec 005 Addendum — Roll saving throw for target (monster or PC).
   * For PCs delegates to SavingThrowService; for monsters computes inline
   * from ability score + proficiency (if present in proficiencies).
   */
  private async rollMonsterOrPcSave(
    target: EncounterParticipantEntity,
    ability: string,
    dc: number,
    ownerUserId: string,
  ): Promise<{ success: boolean; roll: number; total: number; dc: number }> {
    if (target.type === 'pc' && target.characterId) {
      const saveResult = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        ability,
        dc,
        userId: ownerUserId,
      });
      if (saveResult.ok && saveResult.value) {
        return {
          success: saveResult.value.success,
          roll: saveResult.value.roll,
          total: saveResult.value.total,
          dc,
        };
      }
    }

    // Monster: compute from entity abilities
    const monster = target.monster ??
      (target.monsterId
        ? await this.encounterService.getParticipant(target.id).then((p) => p.monster)
        : null);

    if (!monster) {
      const roll = this.diceService.roll(20);
      return { success: roll >= dc, roll, total: roll, dc };
    }

    const abilityMap: Record<string, number> = {
      str: monster.strength,
      dex: monster.dexterity,
      con: monster.constitution,
      int: monster.intelligence,
      wis: monster.wisdom,
      cha: monster.charisma,
    };
    const score = abilityMap[ability.toLowerCase().substring(0, 3)] ?? 10;
    const mod = Math.floor((score - 10) / 2);

    const profs = Array.isArray(monster.proficiencies) ? monster.proficiencies : [];
    const hasSaveProf = profs.some(
      (p: any) =>
        p.type === 'saving-throw' &&
        (p.name ?? '').toLowerCase().includes(ability.toLowerCase().substring(0, 3)),
    );
    const bonus = mod + (hasSaveProf ? (monster.proficiency_bonus ?? 0) : 0);

    const roll = this.diceService.roll(20);
    return { success: roll + bonus >= dc, roll, total: roll + bonus, dc };
  }
}
