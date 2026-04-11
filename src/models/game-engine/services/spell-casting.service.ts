import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpellEntity } from 'src/entities/spell.entity';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { SpellService } from 'src/models/characters/services/spell.service';
import { DiceService } from './dice.service';
import { SavingThrowService } from './saving-throw.service';
import { CombatService } from './combat.service';
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

@Injectable()
export class SpellCastingService {
  constructor(
    @InjectRepository(SpellEntity)
    private readonly spellRepo: Repository<SpellEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly spellService: SpellService,
    private readonly diceService: DiceService,
    private readonly savingThrowService: SavingThrowService,
    private readonly combatService: CombatService,
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
}
