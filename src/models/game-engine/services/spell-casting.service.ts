import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SpellEntity } from "src/entities/spell.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { GameEventEntity } from "src/entities/game-event.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { SpellService } from "src/models/characters/services/spell.service";
import { DiceService } from "./dice.service";
import { SavingThrowService } from "./saving-throw.service";
import { CombatService } from "./combat.service";
import { EncounterService } from "./encounter.service";
import { MonsterSpellcastingService } from "./monster-spellcasting.service";
import {
  GameResult,
  GameEventData,
  GameErrorCode,
  success,
  failure,
} from "../interfaces/result.type";
import {
  isAoeSpell,
  isMultiTargetNonAoeSpell,
  maxTargetsFor,
  getAoeShape,
  cellInAoe,
  getPerHitDamage,
} from "./spell-targeting";
import { parseRangeString, chebyshevDistanceFt } from "./combat-range";
import { getSpellEffectiveRange } from "./spell-effective-range";
import { EffectInstanceService } from "./effect-instance.service";
import {
  materializeSpellEffects,
  checkSpellPreconditions,
  type TargetMetadata,
} from "./spell-effect-catalog";
import { getAbilityModifier } from "src/shared/srd-utils";
import { getSpellDamage } from "./spell-damage-catalog";
import { getSpellHealing } from "./spell-healing-catalog";
import { substituteSpellcastingMod } from "./spellcasting-mod";
import { getSpellCondition } from "./spell-condition-catalog";
import { ConditionLifecycleService } from "./condition-lifecycle.service";
import { SummoningService } from "./summoning.service";
import type {
  SummonConcentrationBreakBehavior,
  SummonControlMode,
  SummonSource,
} from "../interfaces/summoning.interfaces";
import { PersistentAreaService } from "./persistent-area.service";
import {
  getTileEffectDefinition,
  type TileEffectKind,
  type TileEffectOriginCell,
} from "./tile-effect-catalog";
import { TransformationService } from "./transformation.service";
import { ConcentrationService } from "./concentration.service";



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
  resourceDelta?: {
    spellSlots?: Array<{
      level: number;
      used: number;
      total: number;
      kind?: string;
    }>;
  };
}



export interface CastSpellDto {
  characterId: string;
  userId: string;
  spellSlug: string;
  slotLevel: number;
  targetIds?: string[];
  encounterId?: string;
  sessionId?: string;
  ownerUserId: string;

  _skipSlotConsumption?: boolean;
}

export interface CastSpellInCombatDto {
  encounterId: string;
  participantId: string;
  spellSlug: string;
  slotLevel: number;
  targetParticipantIds: string[];
  ownerUserId: string;

  asReaction?: boolean;

  triggerEventId?: string;

  aoeOriginCell?: TileEffectOriginCell;

  metamagic?: {
    type:
      | "twinned"
      | "quickened"
      | "distant"
      | "heightened"
      | "extended"
      | "subtle";

    targetExtra?: string;

    heightenedTargetId?: string;
  };

  polymorphBeastSlug?: string;

  summonMonsterSlug?: string;

  summonPosition?: { x: number; y: number };

  summonControlMode?: SummonControlMode;
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
    private readonly concentration: ConcentrationService,
    private readonly summoning: SummoningService,
    private readonly persistentArea: PersistentAreaService,
    private readonly transformation: TransformationService,
  ) {}


  private getSummonMonsterForSpell(
    spellSlug: string,
    slotLevel: number,
  ): string | null {
    const map: Record<string, Record<number, string>> = {
      "summon-beast": { 2: "wolf", 3: "wolf", 4: "panther", 5: "brown-bear" },
      "conjure-animals": { 3: "wolf", 4: "wolf", 5: "brown-bear" },
      "conjure-woodland-beings": { 4: "giant-spider" },
      "conjure-elemental": { 5: "fire-elemental" },
      "summon-elemental": { 4: "air-elemental" },
      "find-familiar": { 1: "giant-owl" },
      "spiritual-weapon": { 2: "giant-badger" },
    };
    return (
      map[spellSlug]?.[slotLevel] ??
      map[spellSlug]?.[
        Object.keys(map[spellSlug] ?? {})
          .map(Number)
          .sort()[0]
      ] ??
      null
    );
  }

  private getSummonSourceForSpell(spellSlug: string): SummonSource {
    const sourceBySpell: Record<string, SummonSource> = {
      "find-familiar": "find-familiar-spell",
      "conjure-animals": "conjure-animals-spell",
      "conjure-woodland-beings": "conjure-woodland-beings-spell",
      "conjure-elemental": "summon-elemental-spell",
      "summon-elemental": "summon-elemental-spell",
      "summon-beast": "summon-beast-spell",
      "spiritual-weapon": "spiritual-weapon-spell",
    };
    return sourceBySpell[spellSlug] ?? "summon-beast-spell";
  }

  private getSummonConcentrationBreakBehavior(
    spellSlug: string,
  ): SummonConcentrationBreakBehavior {
    return spellSlug === "conjure-elemental" ? "turn-hostile" : "dismiss";
  }

  async castSpell(dto: CastSpellDto): Promise<GameResult<SpellCastResult>> {

    const sheet = await this.sheetService.computeSheet(
      dto.userId,
      dto.characterId,
    );
    if (!sheet) {
      return failure("Personagem nao encontrado.", "INVALID_PARTICIPANT");
    }


    const charSpellRef = sheet.spells.find(
      (s) =>
        s.slug === dto.spellSlug ||
        s.name.toLowerCase() === dto.spellSlug.toLowerCase(),
    );
    if (!charSpellRef) {
      return failure(
        `Magia '${dto.spellSlug}' nao encontrada no repertorio.`,
        "INVALID_ACTION",
      );
    }


    const spell = await this.spellRepo.findOne({
      where: { slug: charSpellRef.slug },
    });
    if (!spell) {
      return failure(
        `Dados da magia '${dto.spellSlug}' nao encontrados.`,
        "INVALID_ACTION",
      );
    }


    const isCantrip = spell.level === 0;
    let resourceDelta: SpellCastResult["resourceDelta"] | undefined;

    if (!isCantrip) {

      if (dto.slotLevel < spell.level) {
        return failure(
          `Slot nivel ${dto.slotLevel} insuficiente para magia nivel ${spell.level}.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }




      const slotBlock =
        sheet.spellSlots.find(
          (s) =>
            s.level === dto.slotLevel && s.kind !== "pact" && s.used < s.total,
        ) ??
        sheet.spellSlots.find(
          (s) =>
            s.level >= dto.slotLevel && s.kind === "pact" && s.used < s.total,
        ) ??
        sheet.spellSlots.find((s) => s.level === dto.slotLevel);
      if (!slotBlock || slotBlock.used >= slotBlock.total) {
        return failure(
          `Sem slots de nivel ${dto.slotLevel} disponiveis.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }



      if (!dto._skipSlotConsumption) {
        const level = slotBlock.kind === "pact" ? -1 : dto.slotLevel;
        await this.spellService.updateSpellSlots(dto.userId, dto.characterId, {
          level,
          used: slotBlock.used + 1,
        });
        resourceDelta = {
          spellSlots: [
            {
              level,
              used: slotBlock.used + 1,
              total: slotBlock.total,
              kind: slotBlock.kind,
            },
          ],
        };
      }
    }


    let previousConcentration: string | undefined;
    const isConcentration = spell.concentration ?? false;






    const events: GameEventData[] = [];
    const result: SpellCastResult = {
      spellName: spell.name,
      spellLevel: spell.level,
      slotUsed: isCantrip ? 0 : dto.slotLevel,
      concentration: isConcentration,
      previousConcentration,
      ...(resourceDelta ? { resourceDelta } : {}),
    };




    const catalogDmg = getSpellDamage(
      spell.slug,
      dto.slotLevel,
      sheet.totalLevel,
    );
    if (catalogDmg) {
      const rollResult = this.diceService.rollExpression(catalogDmg.expression);
      result.damage = {
        expression: catalogDmg.expression,
        total: rollResult.total,
        type: catalogDmg.type,
      };
      events.push({
        event_type: "spell_damage",
        data: {
          spell: spell.name,
          expression: catalogDmg.expression,
          total: rollResult.total,
          type: catalogDmg.type,
          slot_level: dto.slotLevel,
          source: "catalog",
        },
      });
    } else if (spell.damage) {
      const damageInfo = spell.damage as Record<string, any>;
      const slotKey = String(dto.slotLevel);
      const cantripScalingExpr = (() => {
        const map = damageInfo?.damage_at_character_level;
        if (!map || typeof map !== "object") return null;
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


        const rawDt = damageInfo?.damage_type as unknown;
        const damageType =
          (typeof rawDt === "object" && rawDt !== null && "name" in rawDt
            ? String((rawDt as { name: string }).name).toLowerCase()
            : Array.isArray(rawDt)
              ? String(rawDt[0] ?? "").toLowerCase()
              : typeof rawDt === "string"
                ? rawDt.toLowerCase()
                : null) ?? "magical";
        result.damage = {
          expression,
          total: rollResult.total,
          type: damageType,
        };
        events.push({
          event_type: "spell_damage",
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






    const catalogHeal = getSpellHealing(dto.spellSlug, dto.slotLevel);
    const healTemplate =
      catalogHeal?.expression ??
      (spell.heal_at_slot_level as Record<string, string> | null)?.[
        String(dto.slotLevel)
      ] ??
      null;
    if (healTemplate) {
      const expression = substituteSpellcastingMod(healTemplate, sheet);

      if (expression) {
        const rollResult = this.diceService.rollExpression(expression);
        result.healing = {
          expression,
          total: rollResult.total,
        };

        events.push({
          event_type: "spell_healing",
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
      event_type: "spell_cast",
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

    const encounter = await this.encounterRepo.findOne({
      where: { id: dto.encounterId },
    });
    if (!encounter || encounter.status !== "active")
      return failure("Encontro nao esta ativo.", "ENCOUNTER_NOT_ACTIVE");


    if (!dto.asReaction) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.participantId)
        return failure("Nao e o turno deste participante.", "NOT_YOUR_TURN");
    } else if (!dto.triggerEventId) {
      return failure(
        "asReaction=true exige 'triggerEventId'.",
        "MISSING_TRIGGER_EVENT",
      );
    }




    const requestedTargetIds = Array.isArray(dto.targetParticipantIds)
      ? dto.targetParticipantIds
      : [];

    const participant = await this.encounterService.getParticipant(
      dto.participantId,
    );
    if (participant.type === "monster") {
      return this.castMonsterSpellInCombat(
        { ...dto, targetParticipantIds: requestedTargetIds },
        participant,
      );
    }
    if (!participant.characterId)
      return failure(
        "Apenas PCs e monstros casters podem lancar magias.",
        "INVALID_PARTICIPANT",
      );


    const spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {

      const byName = await this.spellRepo.findOne({
        where: { name: dto.spellSlug },
      });
      if (!byName)
        return failure(
          `Magia '${dto.spellSlug}' nao encontrada.`,
          "INVALID_ACTION",
        );
      dto.spellSlug = byName.slug;
    }
    const spellData =
      spell ??
      (await this.spellRepo.findOne({ where: { slug: dto.spellSlug } }))!;





    let effectiveTargetIds = [...requestedTargetIds];
    const aoeShape = getAoeShape(spellData);




    let effectiveOriginCell = dto.aoeOriginCell;
    if (
      aoeShape &&
      !effectiveOriginCell &&
      typeof spellData.range === "string" &&
      spellData.range.trim().toLowerCase() === "self" &&
      participant.positionX != null &&
      participant.positionY != null
    ) {
      effectiveOriginCell = {
        x: participant.positionX,
        y: participant.positionY,
      };
    }

    if (aoeShape && effectiveOriginCell && effectiveTargetIds.length === 0) {
      const allParticipants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId },
      });





      const isSelfRangeSpell =
        typeof spellData.range === "string" &&
        spellData.range.trim().toLowerCase() === "self";

      effectiveTargetIds = allParticipants
        .filter((p) => !p.isDefeated)
        .filter((p) => !(isSelfRangeSpell && p.id === participant.id))
        .filter(
          (p) =>
            p.positionX != null &&
            p.positionY != null &&
            cellInAoe(
              { x: p.positionX, y: p.positionY },
              effectiveOriginCell,
              aoeShape,
            ),
        )
        .map((p) => p.id);
    }






    const targetCount = effectiveTargetIds.length;
    if (targetCount > 1 && !isAoeSpell(spellData)) {
      let casterLevel = 0;
      if (isMultiTargetNonAoeSpell(spellData)) {
        const sheet = await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        );
        casterLevel = (sheet as any)?.totalLevel ?? 0;
      }
      const maxTargets = maxTargetsFor(spellData, dto.slotLevel, casterLevel);
      if (targetCount > maxTargets) {
        return failure(GameErrorCode.SPELL_NOT_AOE);
      }
    }






    if (effectiveTargetIds.length >= 1 && isMultiTargetNonAoeSpell(spellData)) {
      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const casterLevel = (sheet as any)?.totalLevel ?? 0;
      const maxTargets = maxTargetsFor(spellData, dto.slotLevel, casterLevel);
      if (
        Number.isFinite(maxTargets) &&
        effectiveTargetIds.length < maxTargets
      ) {
        const firstTarget = effectiveTargetIds[0];
        while (effectiveTargetIds.length < maxTargets) {
          effectiveTargetIds.push(firstTarget);
        }
      }
    }








    const effectiveRange = getSpellEffectiveRange(spellData);
    if (
      effectiveRange.kind === "self-origin-attack" &&
      effectiveTargetIds.includes(participant.id)
    ) {
      return failure(
        "Esta magia precisa ser lancada contra outra criatura.",
        GameErrorCode.INVALID_TARGET_SELF,
      );
    }










    const distantRangeMultiplier =
      dto.metamagic?.type === "distant"
        ? (spellData.range ?? "").trim().toLowerCase() === "touch"
          ? 6
          : 2
        : 1;



    const parsedRange =
      effectiveRange.kind === "self-origin-attack"
        ? { normal: effectiveRange.attackRangeFt }
        : parseRangeString(spellData.range);
    if (parsedRange && parsedRange.normal > 0) {
      const casterPos =
        participant.positionX != null && participant.positionY != null
          ? { x: participant.positionX, y: participant.positionY }
          : null;


      if (aoeShape && effectiveOriginCell && casterPos) {
        const dist = chebyshevDistanceFt(casterPos, effectiveOriginCell);
        const maxFt =
          (parsedRange.long ?? parsedRange.normal) * distantRangeMultiplier;
        if (dist > maxFt) {
          return failure(
            `Alvo fora do alcance (${dist}ft > ${maxFt}ft).`,
            GameErrorCode.SPELL_OUT_OF_RANGE,
          );
        }
      }


      if (!aoeShape && effectiveTargetIds.length > 0 && casterPos) {
        for (const tid of effectiveTargetIds) {
          const t = await this.encounterService
            .getParticipant(tid)
            .catch(() => null);
          if (!t || t.positionX == null || t.positionY == null) continue;
          const dist = chebyshevDistanceFt(casterPos, {
            x: t.positionX,
            y: t.positionY,
          });
          const maxFt =
            (parsedRange.long ?? parsedRange.normal) * distantRangeMultiplier;
          if (dist > maxFt) {
            return failure(
              `Alvo fora do alcance (${dist}ft > ${maxFt}ft).`,
              GameErrorCode.SPELL_OUT_OF_RANGE,
            );
          }
        }
      }
    }


    const castingTime = (spellData.casting_time ?? "action").toLowerCase();
    const baseIsBonusAction = castingTime.includes("bonus");
    const isReactionSpell = castingTime.includes("reaction");




    let metamagicSpCost = 0;
    let metamagicAppliedType:
      | "twinned"
      | "quickened"
      | "distant"
      | "heightened"
      | "extended"
      | "subtle"
      | null = null;

    let heightenedTargetIdForSave: string | null = null;
    if (dto.metamagic) {

      const sheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const sorcClass = (sheet as any).classes?.find(
        (c: any) => c.slug === "sorcerer",
      );
      if (!sorcClass || sorcClass.level < 2) {
        return failure("Metamagic requer Sorcerer L2+.", "INVALID_ACTION");
      }

      if (dto.metamagic.type === "twinned") {


        if (isAoeSpell(spellData) || isMultiTargetNonAoeSpell(spellData)) {
          return failure(
            "Twinned Spell requer spell de alvo único (não AoE, não multi-target).",
            "INVALID_ACTION",
          );
        }
        if (!dto.metamagic.targetExtra) {
          return failure(
            "Twinned Spell requer `targetExtra` (segundo alvo).",
            "INVALID_ACTION",
          );
        }
        if (effectiveTargetIds.includes(dto.metamagic.targetExtra)) {
          return failure(
            "Twinned Spell: targetExtra deve ser diferente do primeiro alvo.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = spellData.level === 0 ? 1 : dto.slotLevel;
        metamagicAppliedType = "twinned";
        effectiveTargetIds.push(dto.metamagic.targetExtra);
      } else if (dto.metamagic.type === "quickened") {

        if (isReactionSpell) {
          return failure(
            "Quickened Spell não pode ser aplicado em reaction spells.",
            "INVALID_ACTION",
          );
        }
        if (baseIsBonusAction) {
          return failure(
            "Quickened Spell não pode ser aplicado em spell que já é bonus action.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 2;
        metamagicAppliedType = "quickened";
      } else if (dto.metamagic.type === "distant") {


        const rangeStr = (spellData.range ?? "").trim().toLowerCase();
        if (rangeStr === "self") {
          return failure(
            "Distant Spell não pode ser aplicado em spells de range Self.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 1;
        metamagicAppliedType = "distant";
      } else if (dto.metamagic.type === "heightened") {

        if (!spellData.dc) {
          return failure(
            "Heightened Spell requer spell com saving throw.",
            "INVALID_ACTION",
          );
        }
        if (!dto.metamagic.heightenedTargetId) {
          return failure(
            "Heightened Spell requer `heightenedTargetId` (alvo com save em disadvantage).",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 3;
        metamagicAppliedType = "heightened";
        heightenedTargetIdForSave = dto.metamagic.heightenedTargetId;
      } else if (dto.metamagic.type === "extended") {




        const durationStr = (spellData.duration ?? "").trim().toLowerCase();
        if (
          durationStr === "instantaneous" ||
          durationStr === "1 round" ||
          durationStr.includes("until")
        ) {
          return failure(
            "Extended Spell requer spell de duração ≥ 1 minuto.",
            "INVALID_ACTION",
          );
        }
        metamagicSpCost = 1;
        metamagicAppliedType = "extended";
      } else if (dto.metamagic.type === "subtle") {



        metamagicSpCost = 1;
        metamagicAppliedType = "subtle";
      }


      const spTotal = sorcClass.level;
      const spUsed = participant.sorceryPointsUsed ?? 0;
      const spRemaining = spTotal - spUsed;
      if (spRemaining < metamagicSpCost) {
        return failure(
          `Metamagic '${dto.metamagic.type}' requer ${metamagicSpCost} SP, tem ${spRemaining}.`,
          "INSUFFICIENT_SPELL_SLOTS",
        );
      }
    }


    const isBonusAction =
      baseIsBonusAction || metamagicAppliedType === "quickened";


    if (dto.asReaction && !isReactionSpell) {
      return failure(
        `A magia '${dto.spellSlug}' nao e castavel como reaction (casting_time='${spellData.casting_time}').`,
        "SPELL_NOT_REACTION",
      );
    }

    if (dto.asReaction) {
      if (participant.reactionsUsed > 0)
        return failure("Reacao ja utilizada.", "REACTION_ALREADY_USED");
    } else if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure(
          "Bonus action ja utilizada neste turno.",
          "NO_ACTION_AVAILABLE",
        );
    } else {
      if (participant.actionUsed)
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }


    const targetMeta: TargetMetadata[] = [];
    for (const tid of effectiveTargetIds) {
      const t = await this.encounterService
        .getParticipant(tid)
        .catch(() => null);
      if (!t) continue;
      const isWearingArmor = await this.isTargetWearingArmor(
        t,
        dto.ownerUserId,
      );
      targetMeta.push({ id: t.id, isWearingArmor, participant: t });
    }
    const precondFail = checkSpellPreconditions(dto.spellSlug, targetMeta);
    if (precondFail) {
      return failure(precondFail.message, precondFail.code as any);
    }



    let skipSlotConsumption = false;
    let spellMasteryApplied = false;
    let signatureSpellApplied = false;
    try {
      const casterSheet = await this.sheetService.computeSheet(
        dto.ownerUserId,
        participant.characterId,
      );
      const hasSpellMastery =
        (casterSheet as { hasSpellMastery?: boolean }).hasSpellMastery === true;
      const hasSignatureSpells =
        (casterSheet as { hasSignatureSpells?: boolean }).hasSignatureSpells ===
        true;
      if (
        hasSpellMastery &&
        (dto.slotLevel === 1 || dto.slotLevel === 2) &&
        spellData.level <= dto.slotLevel
      ) {
        skipSlotConsumption = true;
        spellMasteryApplied = true;
      } else if (
        hasSignatureSpells &&
        dto.slotLevel === 3 &&
        spellData.level <= 3
      ) {

        const usedMarkers = (participant.effectInstances ?? []).filter(
          (e) =>
            (e as unknown as { kind?: string }).kind ===
            "signature_spell_used_this_rest",
        );
        const usedSlugs = usedMarkers
          .map((m) => (m.payload as unknown as { slug?: string })?.slug)
          .filter(Boolean);
        if (!usedSlugs.includes(dto.spellSlug) && usedMarkers.length < 2) {
          skipSlotConsumption = true;
          signatureSpellApplied = true;
        }
      }
    } catch {

    }

    const castResult = await this.castSpell({
      characterId: participant.characterId,
      userId: dto.ownerUserId,
      spellSlug: dto.spellSlug,
      slotLevel: dto.slotLevel,
      targetIds: effectiveTargetIds,
      encounterId: dto.encounterId,
      ownerUserId: dto.ownerUserId,
      _skipSlotConsumption: skipSlotConsumption,
    });

    if (!castResult.ok) return castResult as any;

    const spellResult = castResult.value;


    if (signatureSpellApplied) {
      participant.effectInstances = [
        ...(participant.effectInstances ?? []),
        {
          id: require("crypto").randomUUID(),
          kind: "signature_spell_used_this_rest",
          sourceFeatureSlug: "signature-spells",
          sourceCasterParticipantId: participant.id,
          payload: {
            slug: dto.spellSlug,
          } as unknown as import("../interfaces/combat.interfaces").EffectInstancePayload,
          expiresAt: { kind: "end_of_encounter" },
          requiresConcentration: false,
          appliedAt: new Date().toISOString(),
        } as unknown as (typeof participant.effectInstances)[number],
      ];
    }


    if (dto.asReaction) {
      participant.reactionsUsed = participant.reactionsUsed + 1;
    } else if (isBonusAction) {
      participant.bonusActionUsed = true;
    } else {
      participant.actionUsed = true;
    }


    if (metamagicAppliedType && metamagicSpCost > 0) {
      participant.sorceryPointsUsed =
        (participant.sorceryPointsUsed ?? 0) + metamagicSpCost;
    }





    const concentrationEvents: GameEventData[] = [];
    if (spellResult.concentration) {
      if (participant.isConcentrating) {
        spellResult.previousConcentration =
          participant.concentratingOn ?? undefined;
        const breakRes = await this.concentration.break(participant, "replaced");
        concentrationEvents.push(...breakRes.events);
      }
      participant.isConcentrating = true;
      participant.concentratingOn = dto.spellSlug;
    }

    await this.participantRepo.save(participant);



    const summonEvents: import("../interfaces/result.type").GameEventData[] =
      [];
    const summonMonsterSlug =
      dto.summonMonsterSlug ??
      this.getSummonMonsterForSpell(dto.spellSlug, dto.slotLevel);
    if (summonMonsterSlug) {
      try {
        const summon = await this.summoning.spawnSummon(dto.encounterId, {
          casterParticipantId: participant.id,
          monsterSlug: summonMonsterSlug,
          displayName: `${dto.spellSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (${summonMonsterSlug})`,
          position:
            dto.summonPosition ??
            (participant.positionX != null && participant.positionY != null
              ? { x: participant.positionX + 1, y: participant.positionY }
              : undefined),
          faction: participant.faction ?? "ally",
          controlMode: dto.summonControlMode ?? "own-initiative",
          concentrationLinked: spellResult.concentration === true,
          concentrationBreakBehavior: this.getSummonConcentrationBreakBehavior(
            dto.spellSlug,
          ),
          durationRoundsTotal: spellResult.concentration ? 10 : 60,
          source: this.getSummonSourceForSpell(dto.spellSlug),
        });
        summonEvents.push({
          event_type: "summon_spawned",
          actor_participant_id: participant.id,
          data: {
            spellSlug: dto.spellSlug,
            summonId: summon.id,
            summonMonsterSlug,
            slotLevel: dto.slotLevel,
          },
        });
      } catch (err) {

        const msg = err instanceof Error ? err.message : String(err);
        summonEvents.push({
          event_type: "summon_error",
          actor_participant_id: participant.id,
          data: { spellSlug: dto.spellSlug, error: msg },
        });
      }
    }


    const targetsHit: CombatSpellResult["targetsHit"] = [];
    const events = [
      ...(castResult.events ?? []),
      ...concentrationEvents,
      ...summonEvents,
    ];


    if (metamagicAppliedType) {
      events.push({
        event_type: "metamagic_applied",
        actor_participant_id: participant.id,
        data: {
          type: metamagicAppliedType,
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
          spCost: metamagicSpCost,
          poolUsed: participant.sorceryPointsUsed ?? 0,
          ...(heightenedTargetIdForSave
            ? { heightenedTargetId: heightenedTargetIdForSave }
            : {}),
          ...(dto.metamagic?.targetExtra
            ? { targetExtra: dto.metamagic.targetExtra }
            : {}),
        },
      });
    }





    const sheetForPerHit = isMultiTargetNonAoeSpell(spellData)
      ? await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        )
      : null;
    const perHitBase = sheetForPerHit
      ? getPerHitDamage(
          dto.spellSlug,
          dto.slotLevel,
          (sheetForPerHit as any)?.totalLevel ?? 0,
        )
      : null;

    for (const targetId of effectiveTargetIds) {
      const target = await this.encounterService.getParticipant(targetId);
      const targetResult: CombatSpellResult["targetsHit"][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };



      let damageThisHit = 0;
      let damageType = spellResult.damage?.type ?? "force";
      if (perHitBase) {
        const rolled = this.diceService.rollExpression(perHitBase.expression);
        damageThisHit = rolled.total;
        damageType = perHitBase.type;
      } else if (spellResult.damage && spellResult.damage.total > 0) {
        damageThisHit = spellResult.damage.total;
        damageType = spellResult.damage.type;
      }

      if (damageThisHit > 0) {
        let finalDamage = damageThisHit;



        if (spellData.dc && !perHitBase) {
          const dcInfo = spellData.dc as Record<string, any>;
          const rawAbility = Array.isArray(dcInfo.dc_type)
            ? dcInfo.dc_type[0]
            : (dcInfo.dc_type?.name ?? dcInfo.dc_type ?? "dexterity");
          const saveAbility = String(rawAbility).toLowerCase().substring(0, 3);
          const casterSheet = await this.sheetService.computeSheet(
            dto.ownerUserId,
            participant.characterId,
          );
          const casterClass = casterSheet.classes?.find(
            (c: any) => c.spellSaveDc != null,
          );
          const spellSaveDc = casterClass?.spellSaveDc ?? 13;


          const heightenedDisadvantage =
            metamagicAppliedType === "heightened" &&
            heightenedTargetIdForSave === targetId;
          const saveResult = await this.rollMonsterOrPcSave(
            target,
            saveAbility,
            spellSaveDc,
            dto.ownerUserId,
            heightenedDisadvantage,
          );
          if (saveResult.success) {
            const dcSuccess = dcInfo.dc_success ?? "half";
            if (dcSuccess === "half") {
              finalDamage = Math.floor(finalDamage / 2);
            } else if (dcSuccess === "none") {
              finalDamage = 0;
            }
            targetResult.savedSuccessfully = true;
          }
        }

        const dmgResult = await this.combatService.applyDamage(
          dto.encounterId,
          {
            targetParticipantId: targetId,
            amount: finalDamage,
            damageType,
            ownerUserId: dto.ownerUserId,
          },
        );

        targetResult.damageDealt = finalDamage;
        if (dmgResult.ok) {
          targetResult.defeated = dmgResult.value.defeated;
        }
      }


      if (spellResult.healing && spellResult.healing.total > 0) {
        await this.combatService.applyHealing(dto.encounterId, {
          targetParticipantId: targetId,
          amount: spellResult.healing.total,
          ownerUserId: dto.ownerUserId,
        });
        targetResult.healingApplied = spellResult.healing.total;
      }


      const condEntry = getSpellCondition(dto.spellSlug);
      if (condEntry && target.id !== participant.id) {
        const sheet = await this.sheetService.computeSheet(
          dto.ownerUserId,
          participant.characterId,
        );
        const casterClass = (sheet as any).classes?.find(
          (c: any) => c.spellSaveDc != null,
        );
        const spellSaveDc: number = casterClass?.spellSaveDc ?? 13;

        const saveRoll = this.rollMonsterOrPcSave(
          target,
          condEntry.saveAbility,
          spellSaveDc,
          dto.ownerUserId,
        );
        const saveResult = await saveRoll;
        if (!saveResult.success) {
          const condResult = await this.conditionLifecycle.applyCondition(
            target,
            {
              slug: condEntry.conditionSlug,
              appliedBy: participant.id,
              sourceSpell: dto.spellSlug,
              sourceConcentration: condEntry.requiresConcentration,
              saveAbility: condEntry.saveAbility,
              saveDc: spellSaveDc,
              repeatSaveTiming: condEntry.repeatSaveTiming,
              durationRoundsRemaining: condEntry.durationRounds,
            },
          );
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


    const casterDex =
      spellResult && (spellResult as any).casterDex != null
        ? (spellResult as any).casterDex
        : await this.getCasterDexModifier(participant, dto.ownerUserId);
    const materializations = materializeSpellEffects(dto.spellSlug, {
      casterParticipantId: participant.id,
      targetParticipantIds: effectiveTargetIds,
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







    const slugNorm = dto.spellSlug
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    const tileDef = getTileEffectDefinition(slugNorm);
    if (
      tileDef &&
      participant.positionX != null &&
      participant.positionY != null
    ) {


      const originCell = tileDef.auraFollowsCaster
        ? { x: participant.positionX, y: participant.positionY }
        : (dto.aoeOriginCell ?? {
            x: participant.positionX,
            y: participant.positionY,
          });


      let saveDc = 13;
      if (participant.type === "pc" && participant.characterId) {
        try {
          const s = await this.sheetService.computeSheet(
            dto.ownerUserId,
            participant.characterId,
          );
          const casterClass = (
            s as { classes?: Array<{ spellSaveDc?: number }> }
          ).classes?.find((c) => c.spellSaveDc != null);
          if (casterClass?.spellSaveDc != null)
            saveDc = casterClass.spellSaveDc;
        } catch {

        }
      }

      const tileEffectKind = tileDef.spellSlug as TileEffectKind;
      const area = await this.persistentArea.createFromCatalog({
        encounterId: dto.encounterId,
        casterParticipantId: participant.id,
        spellSlug: tileEffectKind,
        slotLevel: dto.slotLevel ?? 1,
        originCell,
        saveDc,
      });

      events.push({
        event_type: "tile_effect_created",
        actor_participant_id: participant.id,
        data: {
          areaId: area.id,
          sourceSpell: slugNorm,
          effectKind: area.effectKind,
          originCell: area.originCell,
          shapeKind: area.shapeKind,
          radiusCells: area.radiusCells,
          durationRoundsRemaining: area.durationRoundsRemaining,
          isDifficultTerrain: area.isDifficultTerrain,
          speedMultiplier: area.speedMultiplier,
          saveDc: area.saveDc,
          saveAbility: area.saveAbility,
          narrativeDescriptor: area.narrativeDescriptor,
          tactical: area.tacticalMetadata,
        },
      });




      const allParticipants = await this.participantRepo.find({
        where: { encounterId: dto.encounterId, isDefeated: false },
      });
      const inArea = allParticipants.filter(
        (p) =>
          p.positionX != null &&
          p.positionY != null &&
          this.persistentArea.cellInArea(p.positionX, p.positionY, area),
      );
      const onCastRes = await this.persistentArea.resolveOnCast(
        area,
        inArea,


        async () => ({ modifier: 0 }),
      );
      events.push(...onCastRes.events);






    }





    if (slugNorm === "polymorph") {
      const encounterRound =
        (await this.encounterRepo.findOne({ where: { id: dto.encounterId } }))
          ?.currentRound ?? 0;
      const beastSlug = dto.polymorphBeastSlug ?? "brown-bear";


      const casterSheet = await this.sheetService
        .computeSheet(dto.ownerUserId, participant.characterId)
        .catch(() => null as any);
      const casterClass = casterSheet?.classes?.find(
        (c: any) => c.spellSaveDc != null,
      );
      const spellSaveDc: number = casterClass?.spellSaveDc ?? 13;

      for (const targetId of effectiveTargetIds) {

        const isSelf = targetId === participant.id;
        const target = await this.encounterService
          .getParticipant(targetId)
          .catch(() => null);
        if (!target) continue;


        if (target.transformationState) {
          events.push({
            event_type: "polymorph_rejected",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { reason: "already_transformed" },
          });
          continue;
        }

        let savedSuccessfully = false;
        if (!isSelf) {
          const saveResult = await this.rollMonsterOrPcSave(
            target,
            "wis",
            spellSaveDc,
            dto.ownerUserId,
          );
          savedSuccessfully = saveResult.success;
          events.push({
            event_type: "polymorph_save",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: {
              ability: "wis",
              dc: spellSaveDc,
              success: savedSuccessfully,
              total: saveResult.total,
            },
          });
          const hit = targetsHit.find((th) => th.participantId === targetId);
          if (hit) hit.savedSuccessfully = savedSuccessfully;
        }

        if (savedSuccessfully) continue;

        try {
          await this.transformation.enterForm(targetId, {
            source: "polymorph-spell",
            monsterSlug: beastSlug,
            durationRoundsTotal: 600,
            revertTriggers: {
              hpZero: true,
              concentrationBroken: true,
              durationEnd: true,
              playerDismiss: true,
            },
            currentEncounterRound: encounterRound,
            sourceCasterParticipantId: participant.id,
          });
          events.push({
            event_type: "polymorph_applied",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { beastSlug, durationRounds: 600, source: "polymorph-spell" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "unknown";
          events.push({
            event_type: "polymorph_failed",
            actor_participant_id: participant.id,
            target_participant_id: targetId,
            data: { beastSlug, reason: msg },
          });
        }
      }
    }



    let retroactiveReview: any = undefined;
    if (
      dto.asReaction &&
      dto.triggerEventId &&
      dto.spellSlug.toLowerCase().replace(/-(phb|xphb)$/, "") === "shield"
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

    if (spellMasteryApplied) {
      events.push({
        event_type: "spell_mastery_free_cast",
        actor_participant_id: participant.id,
        data: {
          featureSlug: "spell-mastery",
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
        },
      });
    }
    if (signatureSpellApplied) {
      events.push({
        event_type: "signature_spell_free_cast",
        actor_participant_id: participant.id,
        data: {
          featureSlug: "signature-spells",
          spellSlug: dto.spellSlug,
          slotLevel: dto.slotLevel,
        },
      });
    }

    return success(
      {
        ...spellResult,
        targetsHit,
        appliedEffectIds,
        retroactiveReview,
      } as any,
      events,
    );
  }


  private async recomputeShieldTrigger(
    encounterId: string,
    triggerEventId: string,
    casterParticipantId: string,
    ownerUserId: string,
  ): Promise<{
    newHit: boolean;
    previousHit: boolean;
    damageReverted: number;
    events: any[];
  } | null> {
    const trigger = await this.gameEventRepo.findOne({
      where: { id: triggerEventId },
    });
    if (!trigger || trigger.eventType !== "attack_roll") return null;
    const data = trigger.data as any;
    const prevHit: boolean = data.hit ?? false;
    const prevTotal: number = data.total ?? 0;
    const prevAc: number = data.targetAc ?? 10;
    const newAc = prevAc + 5;
    const newHit = prevTotal >= newAc && !data.criticalMiss;
    const events: any[] = [
      {
        event_type: "shield_retroactive_review",
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



      const hpChange = await this.gameEventRepo
        .createQueryBuilder("e")
        .where("e.encounterId = :encId", { encId: encounterId })
        .andWhere("e.eventType IN ('damage_applied', 'hp_change')")
        .andWhere("e.targetParticipantId = :tid", {
          tid: trigger.targetParticipantId,
        })
        .andWhere("e.sequence >= :seq", { seq: trigger.sequence })
        .orderBy("e.sequence", "ASC")
        .limit(1)
        .getOne();
      if (hpChange) {
        const d = hpChange.data as any;
        const dmg =
          d?.damage?.finalDamage ??
          d?.damage?.total ??
          (typeof d?.damage === "number" ? d.damage : undefined) ??
          d?.amount ??
          0;
        if (dmg > 0) {

          await this.combatService.applyHealing(encounterId, {
            targetParticipantId: trigger.targetParticipantId!,
            amount: dmg,
            ownerUserId,
          });
          damageReverted = dmg;
          events.push({
            event_type: "shield_damage_reverted",
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


  private async isTargetWearingArmor(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<boolean> {
    if (participant.type === "pc" && participant.characterId) {
      try {
        const sheet = await this.sheetService.computeSheet(
          ownerUserId,
          participant.characterId,
        );
        const equip = (sheet as any)?.equipment ?? [];
        for (const eq of equip) {
          if (!eq.equipped || !eq.armorClass) continue;
          const slug = (eq.slug ?? "").toLowerCase();
          const name = (eq.name ?? "").toLowerCase();
          if (slug === "shield" || name === "shield") continue;
          const base = eq.armorClass?.base ?? 0;
          if (base > 0) return true;
        }
        return false;
      } catch {
        return false;
      }
    }

    return participant.type === "monster";
  }


  private async getCasterDexModifier(
    participant: EncounterParticipantEntity,
    ownerUserId: string,
  ): Promise<number> {
    if (participant.type === "pc" && participant.characterId) {
      const sheet = await this.sheetService.computeSheet(
        ownerUserId,
        participant.characterId,
      );
      const dexBlock = (sheet?.abilityScores ?? []).find(
        (a) => a.slug === "dex" || a.slug === "dexterity",
      );
      if (dexBlock) return dexBlock.modifier;
      return 0;
    }
    const dex = (participant.monster as any)?.stats?.dex ?? 10;
    return getAbilityModifier(dex);
  }


  private async castMonsterSpellInCombat(
    dto: CastSpellInCombatDto,
    participant: EncounterParticipantEntity,
  ): Promise<GameResult<CombatSpellResult>> {
    const sc = (participant.monster as any)?.spellcasting;
    if (!sc) return failure("Este monstro não possui magia.", "INVALID_SPELL");

    const check = this.monsterSpellcasting.canCast(
      participant,
      dto.spellSlug,
      dto.slotLevel,
    );
    if (!check.allowed) {
      return failure(
        check.message ?? "Não pode lançar esta magia.",
        check.code ?? "INVALID_SPELL",
      );
    }

    let spell = await this.spellRepo.findOne({
      where: { slug: dto.spellSlug },
    });
    if (!spell) {
      spell = await this.spellRepo.findOne({ where: { name: dto.spellSlug } });
    }
    if (!spell) {
      return failure(
        `Magia '${dto.spellSlug}' nao encontrada.`,
        "INVALID_SPELL",
      );
    }

    const castingTime = (spell.casting_time ?? "action").toLowerCase();
    const isBonusAction = castingTime.includes("bonus");
    if (isBonusAction) {
      if (participant.bonusActionUsed)
        return failure(
          "Bonus action ja utilizada neste turno.",
          "NO_BONUS_ACTION_AVAILABLE",
        );
    } else {
      if (participant.actionUsed)
        return failure("Acao ja utilizada neste turno.", "NO_ACTION_AVAILABLE");
    }


    const damageInfo: any = (spell as any).damage ?? {};
    const rawDt = damageInfo?.damage_type as unknown;
    const damageType: string =
      (typeof rawDt === "object" && rawDt !== null && "name" in rawDt
        ? String((rawDt as { name: string }).name).toLowerCase()
        : Array.isArray(rawDt)
          ? String(rawDt[0] ?? "").toLowerCase()
          : typeof rawDt === "string"
            ? rawDt.toLowerCase()
            : null) ?? "force";

    let damageExpression: string | undefined;
    if (damageInfo.damage_at_slot_level) {
      damageExpression = damageInfo.damage_at_slot_level[String(dto.slotLevel)];
    } else if (damageInfo.damage_at_character_level) {
      damageExpression =
        damageInfo.damage_at_character_level[String(sc.casterLevel ?? 1)];
    }

    const concentration = Boolean((spell as any).concentration);
    const saveAbility = this.resolveSaveAbility(spell);

    const baseRoll = damageExpression
      ? this.diceService.rollExpression(damageExpression)
      : null;

    const events: GameEventData[] = [];
    events.push({
      event_type: "spell_cast",
      actor_participant_id: participant.id,
      data: {
        spellSlug: dto.spellSlug,
        spellName: spell.name,
        slotLevel: dto.slotLevel,
        casterType: "monster",
        saveDc: sc.saveDc,
      },
    });

    const targetsHit: CombatSpellResult["targetsHit"] = [];

    for (const targetId of dto.targetParticipantIds) {
      const target = await this.encounterService.getParticipant(targetId);
      const entry: CombatSpellResult["targetsHit"][0] = {
        participantId: targetId,
        displayName: target.displayName,
      };

      if (baseRoll) {
        let finalDamage = baseRoll.total;
        if (saveAbility) {
          if (target.type === "pc" && target.characterId) {
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

      participant.isConcentrating = true;
      participant.concentratingOn = spell.slug;
    }

    await this.participantRepo.save(participant);

    const result: CombatSpellResult = {
      spellName: spell.name,
      spellLevel: dto.slotLevel,
      slotUsed: sc.type === "standard" ? dto.slotLevel : 0,
      concentration,
      damage: baseRoll
        ? {
            expression: damageExpression ?? "",
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
    if (typeof ability !== "string") return null;
    return ability.toLowerCase().substring(0, 3);
  }


  private async rollMonsterOrPcSave(
    target: EncounterParticipantEntity,
    ability: string,
    dc: number,
    ownerUserId: string,

    withDisadvantage: boolean = false,
  ): Promise<{ success: boolean; roll: number; total: number; dc: number }> {
    if (target.type === "pc" && target.characterId) {
      const saveResult = await this.savingThrowService.rollSavingThrow({
        characterId: target.characterId,
        ability,
        dc,
        userId: ownerUserId,

        forceDisadvantage: withDisadvantage || undefined,
      } as any);
      if (saveResult.ok && saveResult.value) {
        return {
          success: saveResult.value.success,
          roll: saveResult.value.roll,
          total: saveResult.value.total,
          dc,
        };
      }
    }


    const monster =
      target.monster ??
      (target.monsterId
        ? await this.encounterService
            .getParticipant(target.id)
            .then((p) => p.monster)
        : null);

    if (!monster) {
      const rollA = this.diceService.roll(20);
      const rollB = withDisadvantage ? this.diceService.roll(20) : rollA;
      const chosen = withDisadvantage ? Math.min(rollA, rollB) : rollA;
      return { success: chosen >= dc, roll: chosen, total: chosen, dc };
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

    const profs = Array.isArray(monster.proficiencies)
      ? monster.proficiencies
      : [];
    const hasSaveProf = profs.some(
      (p: any) =>
        p.type === "saving-throw" &&
        (p.name ?? "")
          .toLowerCase()
          .includes(ability.toLowerCase().substring(0, 3)),
    );
    const bonus = mod + (hasSaveProf ? (monster.proficiency_bonus ?? 0) : 0);

    const rollA = this.diceService.roll(20);
    const rollB = withDisadvantage ? this.diceService.roll(20) : rollA;
    const chosen = withDisadvantage ? Math.min(rollA, rollB) : rollA;
    return {
      success: chosen + bonus >= dc,
      roll: chosen,
      total: chosen + bonus,
      dc,
    };
  }
}
