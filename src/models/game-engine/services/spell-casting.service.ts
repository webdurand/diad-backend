import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpellEntity } from 'src/entities/spell.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { SpellService } from 'src/models/characters/services/spell.service';
import { DiceService } from './dice.service';
import { SavingThrowService } from './saving-throw.service';
import { CombatService } from './combat.service';
import { EncounterService } from './encounter.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';

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
    private readonly sheetService: CharacterSheetService,
    private readonly spellService: SpellService,
    private readonly diceService: DiceService,
    private readonly savingThrowService: SavingThrowService,
    private readonly combatService: CombatService,
    private readonly encounterService: EncounterService,
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

    // 9. Resolve damage if applicable
    if (spell.damage) {
      const damageInfo = spell.damage as Record<string, any>;
      const slotKey = String(dto.slotLevel);
      const expression =
        damageInfo?.damage_at_slot_level?.[slotKey] ??
        damageInfo?.damage_at_character_level?.[String(sheet.totalLevel)] ??
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

    // 2. Validate it's this participant's turn
    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== dto.participantId)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    const participant = await this.encounterService.getParticipant(dto.participantId);
    if (!participant.characterId)
      return failure('Apenas PCs podem lancar magias.', 'INVALID_PARTICIPANT');

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

    // 4. Check action economy based on casting time
    const castingTime = (spellData.casting_time ?? 'action').toLowerCase();
    const isBonusAction = castingTime.includes('bonus');

    if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure('Bonus action ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
    } else {
      if (participant.actionUsed)
        return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
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

    // 6. Mark action used
    if (isBonusAction) {
      participant.bonusActionUsed = true;
    } else {
      participant.actionUsed = true;
    }

    // 7. Handle concentration
    if (spellResult.concentration) {
      if (participant.isConcentrating) {
        spellResult.previousConcentration = participant.concentratingOn ?? undefined;
      }
      participant.isConcentrating = true;
      participant.concentratingOn = spellResult.spellName;
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

        // Saving throw for half damage
        if (spellData.dc) {
          const dcInfo = spellData.dc as Record<string, any>;
          const saveAbility = dcInfo.dc_type?.name ?? 'dexterity';
          const sheet = await this.sheetService.computeSheet(dto.ownerUserId, participant.characterId);
          const casterClass = sheet.classes?.find((c: any) => c.spellSaveDc != null);
          const spellSaveDc = casterClass?.spellSaveDc ?? 13;

          // Roll saving throw for target
          if (target.type === 'pc' && target.characterId) {
            const saveResult = await this.savingThrowService.rollSavingThrow({
              characterId: target.characterId,
              ability: saveAbility,
              dc: spellSaveDc,
              userId: dto.ownerUserId,
            });
            if (saveResult.ok && saveResult.value?.success) {
              finalDamage = Math.floor(finalDamage / 2);
              targetResult.savedSuccessfully = true;
            }
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

      targetsHit.push(targetResult);
    }

    return success({ ...spellResult, targetsHit }, events);
  }
}
