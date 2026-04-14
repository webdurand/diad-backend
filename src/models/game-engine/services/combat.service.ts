import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { CharacterStateService } from 'src/models/characters/services/character-state.service';
import { CharacterSheetService } from 'src/models/characters/services/character-sheet.service';
import { ActionsService } from 'src/models/characters/services/actions.service';
import { DiceService } from './dice.service';
import { ConditionEffectsService } from './condition-effects.service';
import { EventService } from './event.service';
import { EncounterService } from './encounter.service';
import { MovementService } from './movement.service';
import { SessionService } from './session.service';
import {
  GameResult,
  GameEventData,
  success,
  failure,
} from '../interfaces/result.type';
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
} from '../interfaces/combat.interfaces';
import { SavingThrowService } from './saving-throw.service';
import { getAbilityModifier } from 'src/shared/srd-utils';
import { MonsterActionResolver } from './monster-action-resolver.service';

// --- DTOs ---

export interface AttackDto {
  attackerParticipantId: string;
  /** Single-target: required for regular attacks. */
  targetParticipantId: string;
  /** Multiattack only: one entry per sub-attack in sequence order. */
  targetParticipantIds?: string[];
  /** Action name/id from ActionsService (for PCs) or monster action name */
  actionName: string;
  /** Manual override from DM */
  forceAdvantage?: boolean;
  forceDisadvantage?: boolean;
  /** UserId of the session owner (DM), needed for CharacterState delegation */
  ownerUserId: string;
  /** Internal: skip turn/action validation and action-consumption. Set only by resolveMultiattack. */
  _isSubAttack?: boolean;
}

export interface SubAttackResult {
  subActionName: string;
  targetParticipantId: string;
  attackRoll: AttackResult['attackRoll'];
  damageRoll?: AttackResult['damageRoll'];
  targetHpAfter?: number;
  targetDefeated: boolean;
  targetDyingState?: 'none' | 'dying' | 'stable' | 'dead';
  concentrationBroken?: boolean;
}

export interface MultiattackResult {
  kind: 'multiattack';
  actionConsumed: boolean;
  subAttacks: SubAttackResult[];
  interruptedAt: { index: number; reason: 'target_defeated' | 'action_cancelled' } | null;
}

export interface DamageDto {
  targetParticipantId: string;
  amount: number;
  damageType: string;
  ownerUserId: string;
  /** Set by attack resolver when the hit was a critical. Used for death-save failures at 0 HP. */
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
  ) {}

  async resolveAoeAction(
    encounterId: string,
    dto: {
      casterParticipantId: string;
      actionName: string;
      affectedParticipantIds: string[];
      ownerUserId: string;
    },
  ): Promise<GameResult<AoEResolveResult>> {
    const encounter = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const caster = await this.encounterService.getParticipant(dto.casterParticipantId);
    if (caster.actionUsed)
      return failure('Acao ja utilizada.', 'NO_ACTION_AVAILABLE');
    if (encounter.turnOrder[encounter.currentTurnIndex] !== caster.id)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    // Find action definition
    let actionBlock: TurnActionBlock | undefined;
    if (caster.type === 'monster' && caster.monster) {
      const all = [
        ...this.parseMonsterActions(caster.monster),
        ...((caster.monster as any).legendary_actions ?? []).map((a: any, i: number) => {
          const b = this.buildMonsterActionBlock(caster.monster, a, i, 'monster-legendary');
          return { ...b, name: `⭐ ${b.name}` };
        }),
      ];
      actionBlock = all.find(
        (a) => a.name.toLowerCase() === dto.actionName.toLowerCase(),
      );
    } else if (caster.type === 'pc' && caster.characterId) {
      const ownerId = await this.resolveParticipantOwner(caster, dto.ownerUserId);
      const pc = await this.actionsService.getActions(ownerId, caster.characterId);
      const all = [...pc.actions, ...pc.bonusActions];
      actionBlock = all
        .map(this.toTurnActionBlock)
        .find((a) => a.name.toLowerCase() === dto.actionName.toLowerCase());
    }

    if (!actionBlock || !actionBlock.aoe || !actionBlock.damage) {
      return failure('Acao em area invalida.', 'INVALID_ACTION');
    }

    const events: GameEventData[] = [];
    const results: AoEResolveResult['results'] = [];

    for (const targetId of dto.affectedParticipantIds) {
      if (targetId === caster.id) continue;
      const target = await this.encounterService.getParticipant(targetId).catch(() => null);
      if (!target || target.isDefeated) continue;

      // Roll save
      let saveResult: SavingThrowResult | undefined;
      let saved = false;
      if (actionBlock.save) {
        if (target.type === 'pc' && target.characterId) {
          const targetOwnerId = await this.resolveParticipantOwner(target, dto.ownerUserId);
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
        } else if (target.type === 'monster' && target.monster) {
          const m: any = target.monster;
          const abilityMap: Record<string, string> = {
            str: 'strength', dex: 'dexterity', con: 'constitution',
            int: 'intelligence', wis: 'wisdom', cha: 'charisma',
          };
          const fullName = abilityMap[actionBlock.save.ability] ?? actionBlock.save.ability;
          const saveBonus = m[`${fullName}_save`] ?? getAbilityModifier(m[fullName] ?? 10);
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

      // Roll damage
      const dmgResult = this.diceService.rollExpression(actionBlock.damage.dice);
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
      const dtLower = actionBlock.damage.type.toLowerCase();
      if (target.type === 'monster' && target.monster) {
        const m: any = target.monster;
        const imms = (m.damage_immunities ?? []) as string[];
        const ress = (m.damage_resistances ?? []) as string[];
        const vuls = (m.damage_vulnerabilities ?? []) as string[];
        if (imms.some((i) => i.toLowerCase().includes(dtLower))) {
          immune = true; finalDamage = 0;
        } else if (ress.some((r) => r.toLowerCase().includes(dtLower))) {
          resisted = true; finalDamage = Math.floor(finalDamage / 2);
        } else if (vuls.some((v) => v.toLowerCase().includes(dtLower))) {
          vulnerable = true; finalDamage = finalDamage * 2;
        }
      }

      // Apply damage
      let targetHpAfter: number | undefined;
      let targetDefeated = false;
      if (finalDamage > 0) {
        if (target.type === 'pc' && target.characterId) {
          const targetOwnerId = await this.resolveParticipantOwner(target, dto.ownerUserId);
          const wasDying = target.dyingState === 'dying';
          const hpResult = await this.stateService.updateHp(
            targetOwnerId,
            target.characterId,
            { damage: finalDamage },
          );
          targetHpAfter = hpResult.currentHp;
          targetDefeated = hpResult.isDown;
          if (hpResult.instantDeath) {
            target.dyingState = 'dead';
            target.isDefeated = true;
            await this.participantRepo.save(target);
          } else if (targetDefeated && !wasDying) {
            target.dyingState = 'dying';
            target.isDefeated = false;
            await this.participantRepo.save(target);
          } else if (wasDying) {
            const ds = await this.stateService.updateDeathSaves(
              targetOwnerId,
              target.characterId,
              { failuresDelta: 1 },
            );
            if (ds.dead) {
              target.dyingState = 'dead';
              target.isDefeated = true;
              await this.participantRepo.save(target);
            }
          }
        } else {
          const r = this.applyDamageToMonster(target, finalDamage);
          targetHpAfter = r.hpAfter;
          targetDefeated = r.defeated;
          await this.participantRepo.save(target);
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
        event_type: 'aoe_target_hit',
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

    // Mark action as used
    caster.actionUsed = true;
    await this.participantRepo.save(caster);

    await this.eventService.emit(encounter.sessionId, encounterId, events);

    return success({
      affectedParticipantIds: dto.affectedParticipantIds,
      results,
    }, events);
  }

  private async resolveParticipantOwner(
    participant: EncounterParticipantEntity,
    requesterUserId: string,
  ): Promise<string> {
    if (participant.type !== 'pc' || !participant.characterId) return requesterUserId;
    const encounter = await this.encounterRepo.findOne({ where: { id: participant.encounterId } });
    if (!encounter) return requesterUserId;
    const session = await this.sessionService.getById(encounter.sessionId);
    return this.encounterService.resolveCharacterOwner(
      participant.characterId,
      requesterUserId,
      session.campaignId ?? undefined,
    );
  }

  // --- Turn Management ---

  async getCurrentTurn(encounterId: string): Promise<GameResult<TurnInfo>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');
    if (encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const participantId = encounter.turnOrder[encounter.currentTurnIndex];
    if (!participantId) return failure('Sem participante no turno.', 'INVALID_PARTICIPANT');

    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) return failure('Participante nao encontrado.', 'PARTICIPANT_NOT_FOUND');

    return success({
      encounterId,
      round: encounter.currentRound,
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type as 'pc' | 'monster' | 'npc',
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
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const participant = await this.encounterService.getParticipant(participantId);
    const resolvedOwnerId = await this.resolveParticipantOwner(participant, ownerUserId);
    const speed = await this.movementService.getSpeed(participant, resolvedOwnerId);

    let actions: TurnActionBlock[] = [];
    let bonusActions: TurnActionBlock[] = [];
    let reactions: TurnActionBlock[] = [];

    if (participant.type === 'pc' && participant.characterId) {
      const pcActions = await this.actionsService.getActions(
        resolvedOwnerId,
        participant.characterId,
      );
      actions = pcActions.actions.map(this.toTurnActionBlock);
      bonusActions = pcActions.bonusActions.map(this.toTurnActionBlock);
      reactions = pcActions.reactions.map(this.toTurnActionBlock);
    } else if (participant.type === 'monster' && participant.monster) {
      actions = this.parseMonsterActions(participant.monster);
      const multiattack = (participant.monster as any).multiattack;
      if (multiattack && Array.isArray(multiattack.sequence) && multiattack.sequence.length > 0) {
        actions = [
          {
            id: 'monster-multiattack',
            name: 'Multiataque',
            kind: 'multiattack',
            timing: 'action',
            source: 'base',
            sourceLabel: 'Multiataque',
            description: multiattack.description ?? '',
            sequence: multiattack.sequence,
            rechargeRequired: multiattack.recharge ?? null,
          },
          ...actions,
        ];
      }
      const spellcasting = (participant.monster as any).spellcasting;
      if (spellcasting && Array.isArray(spellcasting.knownSpells) && spellcasting.knownSpells.length > 0) {
        const spellBlocks: TurnActionBlock[] = spellcasting.knownSpells.map(
          (ks: any, i: number) => ({
            id: `monster-spell-${i}`,
            name: ks.slug,
            timing: 'action',
            source: 'spell',
            sourceLabel: spellcasting.type === 'innate' ? 'Inata' : 'Preparada',
            description:
              spellcasting.type === 'innate'
                ? `Uso: ${spellcasting.dailyUses?.[ks.slug] ?? 'at-will'}`
                : `Nível ${ks.level}${ks.level === 0 ? ' (cantrip)' : ''}`,
            spellLevel: ks.level,
          }),
        );
        actions = [
          {
            id: 'monster-spell-opener',
            name: 'Magia',
            kind: 'spell-opener',
            timing: 'action',
            source: 'base',
            sourceLabel: 'Magia',
            description: `${spellcasting.type === 'innate' ? 'Magia inata' : 'Conjuração'} — DC ${spellcasting.saveDc}, +${spellcasting.attackBonus} ataque mágico.`,
          },
          ...actions,
          ...spellBlocks,
        ];
      }
      const legendary = (participant.monster as any).legendary_actions as any[] | undefined;
      if (legendary?.length) {
        actions = actions.concat(
          legendary.map((a: any, i: number) => {
            const block = this.buildMonsterActionBlock(
              participant.monster,
              a,
              i,
              'monster-legendary',
            );
            return { ...block, name: `⭐ ${block.name}` };
          }),
        );
      }
      const monsterReactions = (participant.monster as any).reactions as any[] | undefined;
      if (monsterReactions?.length) {
        reactions = monsterReactions.map((a: any, i: number) => {
          const block = this.buildMonsterActionBlock(
            participant.monster,
            a,
            i,
            'monster-reaction',
          );
          return { ...block, timing: 'reaction' };
        });
      }
    }

    // Spec 003 T034 — as 8 ações genéricas PHB aparecem em qualquer participant.
    const genericActions: TurnActionBlock[] = [
      this.makeGenericAction('dodge', 'Esquivar'),
      this.makeGenericAction('dash', 'Disparada'),
      this.makeGenericAction('disengage', 'Desengajar'),
      this.makeGenericAction('help', 'Ajudar'),
      this.makeGenericAction('hide', 'Esconder'),
      this.makeGenericAction('ready', 'Preparar'),
      this.makeGenericAction('search', 'Procurar'),
      this.makeGenericAction('use-object', 'Usar Objeto'),
    ];

    // Spec 005 US13 — `actions` contém apenas ataques/multiataque/ações de monstro
    // (source !== 'generic'); as 8 ações PHB vão em `genericActions` separado, para
    // que a aba "Ações" do frontend possa renderizar subgrupos Ataques + PHB.
    return success({
      participantId: participant.id,
      participantName: participant.displayName,
      participantType: participant.type as 'pc' | 'monster' | 'npc',
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

  /** Monta um TurnActionBlock para uma das 8 ações genéricas PHB (spec 003 T034). */
  private makeGenericAction(
    genericKind:
      | 'dodge'
      | 'dash'
      | 'disengage'
      | 'help'
      | 'hide'
      | 'ready'
      | 'search'
      | 'use-object',
    label: string,
  ): TurnActionBlock {
    // Spec 005 US13 — não marcamos mais como `kind: 'attack'` porque essas ações
    // são agora retornadas em `genericActions[]` (não em `actions[]`), e `kind`
    // é um discriminator para aggregators de ataque.
    return {
      id: `generic-${genericKind}`,
      name: label,
      timing: 'action',
      source: 'generic',
      sourceLabel: 'Ação PHB',
      description: `Ação genérica: ${label}`,
    } as unknown as TurnActionBlock;
  }

  private toTurnActionBlock(a: any): TurnActionBlock {
    return {
      id: a.id,
      name: a.name,
      timing: a.timing,
      source: a.source,
      sourceLabel: a.sourceLabel,
      description: a.description,
      attackBonus: a.attackBonus,
      damage: a.damage,
      range: a.range,
      spellLevel: a.spellLevel,
      requiresConcentration: a.requiresConcentration,
      aoe: a.aoe,
    };
  }

  private parseMonsterActions(monster: any): TurnActionBlock[] {
    const monsterActions = (monster.actions as any[]) ?? [];
    return monsterActions.map((a: any, i: number) =>
      this.buildMonsterActionBlock(monster, a, i, 'monster-action'),
    );
  }

  private buildMonsterActionBlock(
    monster: any,
    a: any,
    i: number,
    idPrefix: string,
  ): TurnActionBlock {
    // Delegate attack bonus + damage resolution to the single source of truth.
    // Keeps the number displayed in turn-actions identical to the one rolled
    // in resolveAttack (US4 / D7).
    const resolved = this.monsterActionResolver.resolve(a, monster?.name);
    const desc = resolved.description;
    const attackBonus = resolved.hasAttack ? resolved.attackBonus : undefined;
    const damage = resolved.damageDice
      ? {
          dice: resolved.damageDice,
          type: resolved.damageType ?? 'bludgeoning',
          bonus: 0,
        }
      : undefined;

    // --- AoE detection ---
    // Statblocks de monstro quase sempre descrevem AoE que emana do monstro
    // (breath weapons, roars, auras). Por isso default = originType: 'self'.
    // Se surgir counterexample (ex: monstro com fireball num ponto descrito em prose),
    // tratar caso a caso. Ações de spell-casting reais vão por outra rota e usam deriveOriginType().
    const coneMatch = desc.match(/(\d+)[- ]?foot\s+cone/i);
    const lineMatch = desc.match(/(\d+)[- ]?foot(?:\s+long)?\s+line/i);
    const sphereMatch = desc.match(/(\d+)[- ]?foot[- ]?radius/i);
    const cubeMatch = desc.match(/(\d+)[- ]?foot\s+cube/i);
    let aoe: TurnActionBlock['aoe'];
    if (coneMatch) {
      const size = parseInt(coneMatch[1], 10);
      aoe = { originType: 'self', shape: 'cone', sizeFt: size, rangeFt: 0 };
    } else if (lineMatch) {
      const size = parseInt(lineMatch[1], 10);
      aoe = { originType: 'self', shape: 'line', sizeFt: size, rangeFt: 0 };
    } else if (sphereMatch) {
      const size = parseInt(sphereMatch[1], 10);
      aoe = { originType: 'self', shape: 'sphere', sizeFt: size, rangeFt: 0 };
    } else if (cubeMatch) {
      const size = parseInt(cubeMatch[1], 10);
      aoe = { originType: 'self', shape: 'cube', sizeFt: size, rangeFt: 0 };
    }

    // --- Save detection ---
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

    return {
      id: `${idPrefix}-${i}`,
      name: a.name ?? 'Ataque',
      timing: 'action',
      source: 'base',
      sourceLabel: monster.name,
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
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');
    if (encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const currentParticipantId =
      encounter.turnOrder[encounter.currentTurnIndex];

    const events: GameEventData[] = [
      {
        event_type: 'turn_end',
        actor_participant_id: currentParticipantId,
        data: { round: encounter.currentRound },
      },
    ];

    // Spec 003 T013: limpa estados reativos que expiram no início do próximo
    // turno do próprio ator (Dodge, Help armado, Ready não disparado).
    const currentParticipant = await this.participantRepo.findOne({
      where: { id: currentParticipantId },
    });
    if (currentParticipant) {
      const expired: string[] = [];
      if (
        currentParticipant.dodgingUntilTurnOfParticipantId ===
        currentParticipant.id
      ) {
        currentParticipant.dodgingUntilTurnOfParticipantId = null;
        expired.push('dodge');
      }
      if (
        currentParticipant.helpingUntilTurnOfParticipantId ===
        currentParticipant.id
      ) {
        currentParticipant.helpingAllyParticipantId = null;
        currentParticipant.helpingTargetParticipantId = null;
        currentParticipant.helpingUntilTurnOfParticipantId = null;
        expired.push('help');
      }
      if (currentParticipant.readiedAction) {
        currentParticipant.readiedAction = null;
        expired.push('ready');
      }
      if (expired.length > 0) {
        await this.participantRepo.save(currentParticipant);
        for (const state of expired) {
          events.push({
            event_type: 'state_expired',
            actor_participant_id: currentParticipantId,
            data: { state, round: encounter.currentRound },
          });
        }
      }
    }

    let nextIndex = encounter.currentTurnIndex + 1;
    let newRound = encounter.currentRound;

    if (nextIndex >= encounter.turnOrder.length) {
      nextIndex = 0;
      newRound += 1;
      events.push({ event_type: 'round_start', data: { round: newRound } });
      await this.pruneDeadFromTurnOrder(encounter);
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

      // Monster: skip when isDefeated.
      if (p.type !== 'pc' && p.isDefeated) {
        nextIndex = (nextIndex + 1) % turnOrderLen;
        if (nextIndex === 0) newRound += 1;
        skipped++;
        continue;
      }

      // PC dead: skip (participants-ordered removal happens at round boundary).
      if (p.type === 'pc' && p.dyingState === 'dead') {
        nextIndex = (nextIndex + 1) % turnOrderLen;
        if (nextIndex === 0) newRound += 1;
        skipped++;
        continue;
      }

      // PC stable: deliver turn but mark autoSkip so frontend calls end-turn immediately.
      if (p.type === 'pc' && p.dyingState === 'stable') {
        autoSkip = true;
        break;
      }

      // Everyone else (including PC dying): deliver turn normally.
      break;
    }

    encounter.currentTurnIndex = nextIndex;
    encounter.currentRound = newRound;
    await this.encounterRepo.save(encounter);

    const nextParticipantId = encounter.turnOrder[nextIndex];

    const nextParticipant = await this.participantRepo.findOne({
      where: { id: nextParticipantId },
      relations: ['monster'],
    });
    if (nextParticipant) {
      const ownerId = await this.resolveParticipantOwner(nextParticipant, '');
      await this.movementService.initializeTurn(nextParticipant, ownerId || undefined);
    }

    events.push({
      event_type: 'turn_start',
      actor_participant_id: nextParticipantId,
      data: {
        round: newRound,
        dyingState: nextParticipant?.dyingState,
        autoSkip,
      },
    });

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({
      encounterId,
      round: newRound,
      participantId: nextParticipantId,
      participantName: nextParticipant?.displayName ?? '',
      participantType: (nextParticipant?.type as 'pc' | 'monster' | 'npc') ?? 'monster',
      isDefeated: nextParticipant?.isDefeated ?? false,
      dyingState: nextParticipant?.dyingState,
      autoSkip,
    }, events);
  }

  /**
   * Removes dead PCs from the turnOrder. Called at round boundary so indices
   * stay stable during the round. Monsters are never removed (isDefeated
   * monsters stay indexed but are skipped each round).
   */
  private async pruneDeadFromTurnOrder(encounter: EncounterEntity): Promise<void> {
    const toRemove: string[] = [];
    for (const pid of encounter.turnOrder) {
      const p = await this.participantRepo.findOne({ where: { id: pid } });
      if (p?.type === 'pc' && p.dyingState === 'dead') {
        toRemove.push(pid);
      }
    }
    if (toRemove.length === 0) return;
    encounter.turnOrder = encounter.turnOrder.filter((pid) => !toRemove.includes(pid));
    if (encounter.currentTurnIndex >= encounter.turnOrder.length) {
      encounter.currentTurnIndex = 0;
    }
  }

  // --- Attack Resolution ---

  async resolveAttack(
    encounterId: string,
    dto: AttackDto,
  ): Promise<GameResult<AttackResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const attacker = await this.encounterService.getParticipant(
      dto.attackerParticipantId,
    );
    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    if (attacker.isDefeated)
      return failure('Atacante esta derrotado.', 'CONDITION_PREVENTS_ACTION');
    if (target.isDefeated)
      return failure('Alvo ja esta derrotado.', 'TARGET_DEFEATED');

    if (!dto._isSubAttack) {
      const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
      if (currentPid !== dto.attackerParticipantId)
        return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

      if (attacker.actionUsed)
        return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');
    }

    // Check if attacker can act (condition still applies even for sub-attacks).
    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure(
        'Atacante nao pode agir devido a condicoes.',
        'CONDITION_PREVENTS_ACTION',
      );

    // Get attack bonus and damage info
    let attackBonus = 0;
    let damageDice = '1d4';
    let damageType = 'bludgeoning';
    let damageBonus = 0;

    if (attacker.type === 'pc' && attacker.characterId) {
      const actions = await this.actionsService.getActions(
        dto.ownerUserId,
        attacker.characterId,
      );
      const allActions = [
        ...actions.actions,
        ...actions.bonusActions,
      ];
      const action = allActions.find(
        (a) =>
          a.name.toLowerCase() === dto.actionName.toLowerCase() ||
          a.id === dto.actionName,
      );
      if (!action)
        return failure(
          `Acao "${dto.actionName}" nao encontrada.`,
          'INVALID_ACTION',
        );
      attackBonus = action.attackBonus ?? 0;
      if (action.damage) {
        damageDice = action.damage.dice;
        damageType = action.damage.type;
        damageBonus = action.damage.bonus ?? 0;
      }
    } else if (attacker.type === 'monster' && attacker.monster) {
      const resolved = this.monsterActionResolver.resolveByName(
        attacker.monster,
        dto.actionName,
      );
      if (!resolved) {
        return failure(
          `Acao "${dto.actionName}" nao encontrada no statblock do monstro.`,
          'INVALID_ACTION',
        );
      }
      attackBonus = resolved.attackBonus;
      if (resolved.damageDice) damageDice = resolved.damageDice;
      if (resolved.damageType) damageType = resolved.damageType;
      damageBonus = resolved.damageBonus;
    }

    // Determine advantage/disadvantage
    const attackerMods = this.conditionEffects.getAttackModifiers(
      attacker.conditions,
    );
    const defenderMods = this.conditionEffects.getDefenseModifiers(
      target.conditions,
    );

    // Spec 003 T032 — estados reativos (Dodge, Help, Hidden) lidos dos campos
    // da entity (não apenas de `conditions[]`). Help vive no AJUDANTE, não no
    // atacante — buscamos o helper cujo `helpingAllyParticipantId` aponta pro
    // atacante E `helpingTargetParticipantId` pro alvo atual.
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
        dodgingUntilTurnOfParticipantId:
          target.dodgingUntilTurnOfParticipantId,
      },
      helpingState ? { helpingAgainst: helpingState } : undefined,
    );

    let hasAdvantage =
      attackerMods.hasAdvantage ||
      defenderMods.attacksHaveAdvantage ||
      reactive.advantage ||
      (dto.forceAdvantage ?? false);
    let hasDisadvantage =
      attackerMods.hasDisadvantage ||
      defenderMods.attacksHaveDisadvantage ||
      reactive.disadvantage ||
      (dto.forceDisadvantage ?? false);

    // Advantage and disadvantage cancel out
    if (hasAdvantage && hasDisadvantage) {
      hasAdvantage = false;
      hasDisadvantage = false;
    }

    // Roll attack
    let attackRoll: number;
    let advantageResult: { roll1: number; roll2: number; chosen: number; discarded: number } | undefined;

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

    const isCritical = attackRoll === 20;
    const isCriticalMiss = attackRoll === 1;

    // Get target AC
    let targetAc = 10;
    if (target.type === 'pc' && target.characterId) {
      const targetOwnerId = await this.resolveParticipantOwner(target, dto.ownerUserId);
      const sheet = await this.sheetService.computeSheet(
        targetOwnerId,
        target.characterId,
      );
      targetAc = sheet.armorClass;
    } else if (target.type === 'monster' && target.monster) {
      const ac = target.monster.armor_class as any;
      targetAc =
        (Array.isArray(ac) ? ac[0]?.value : ac?.value) ?? 10;
    }

    const totalAttack = attackRoll + attackBonus;
    const hit =
      !isCriticalMiss &&
      (isCritical ||
        defenderMods.autoCritIfMelee ||
        totalAttack >= targetAc);

    const events: GameEventData[] = [];

    const attackRollResult = {
      roll: attackRoll,
      modifier: attackBonus,
      total: totalAttack,
      targetAc,
      hit,
      critical: isCritical || defenderMods.autoCritIfMelee,
      criticalMiss: isCriticalMiss,
      advantage: advantageResult,
    };

    events.push({
      event_type: 'attack_roll',
      actor_participant_id: attacker.id,
      target_participant_id: target.id,
      data: {
        actionName: dto.actionName,
        ...attackRollResult,
      },
    });

    let damageRollResult;
    let targetHpAfter: number | undefined;
    let targetDefeated = false;
    let concentrationBroken: boolean | undefined;

    if (hit) {
      // Roll damage
      const dmgResult = this.diceService.rollExpression(damageDice);
      let totalDamage = dmgResult.total + damageBonus;

      // Critical: double the dice (roll again), keep flat bonus once
      if (isCritical || defenderMods.autoCritIfMelee) {
        const critExtra = this.diceService.rollExpression(damageDice);
        totalDamage += critExtra.total;
      }

      // Check monster immunities/resistances/vulnerabilities
      let resisted = false;
      let immune = false;
      let vulnerable = false;
      let finalDamage = totalDamage;

      if (target.type === 'monster' && target.monster) {
        const immunities =
          ((target.monster.damage_immunities as unknown) as string[]) ?? [];
        const resistances =
          ((target.monster.damage_resistances as unknown) as string[]) ?? [];
        const vulnerabilities =
          ((target.monster.damage_vulnerabilities as unknown) as string[]) ?? [];

        const dtLower = damageType.toLowerCase();
        if (immunities.some((i) => i.toLowerCase().includes(dtLower))) {
          immune = true;
          finalDamage = 0;
        } else if (
          resistances.some((r) => r.toLowerCase().includes(dtLower))
        ) {
          resisted = true;
          finalDamage = Math.floor(totalDamage / 2);
        } else if (
          vulnerabilities.some((v) => v.toLowerCase().includes(dtLower))
        ) {
          vulnerable = true;
          finalDamage = totalDamage * 2;
        }
      }

      damageRollResult = {
        rolls: [dmgResult],
        bonus: damageBonus,
        total: totalDamage,
        type: damageType,
        resisted,
        immune,
        vulnerable,
        finalDamage,
      };

      events.push({
        event_type: 'damage_applied',
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          ...damageRollResult,
          critical: isCritical || defenderMods.autoCritIfMelee,
        },
      });

      // Apply damage
      if (target.type === 'pc' && target.characterId) {
        const targetOwnerId = await this.resolveParticipantOwner(target, dto.ownerUserId);
        const wasDying = target.dyingState === 'dying';
        if (wasDying) {
          // RAW: damage to a dying PC is a death-save failure (2 on crit).
          const failuresDelta = isCritical ? 2 : 1;
          const ds = await this.stateService.updateDeathSaves(
            targetOwnerId,
            target.characterId,
            { failuresDelta },
          );
          targetHpAfter = 0;
          if (ds.dead) {
            target.dyingState = 'dead';
            target.isDefeated = true;
            targetDefeated = true;
            await this.participantRepo.save(target);
          }
          events.push({
            event_type: 'death_save_failed_from_damage',
            target_participant_id: target.id,
            data: { failuresAdded: failuresDelta, failures: ds.failures, dyingState: target.dyingState },
          });
        } else {
          const hpResult = await this.stateService.updateHp(
            targetOwnerId,
            target.characterId,
            { damage: finalDamage },
          );
          targetHpAfter = hpResult.currentHp;
          targetDefeated = hpResult.isDown;
          if (hpResult.instantDeath) {
            target.dyingState = 'dead';
            target.isDefeated = true;
            await this.participantRepo.save(target);
            events.push({
              event_type: 'instant_death',
              target_participant_id: target.id,
              data: { dyingState: 'dead' },
            });
          } else if (targetDefeated) {
            target.dyingState = 'dying';
            target.isDefeated = false;
            await this.participantRepo.save(target);
            events.push({
              event_type: 'fell_unconscious',
              target_participant_id: target.id,
              data: { dyingState: 'dying' },
            });
          }
        }
      } else {
        // Monster: apply directly
        const result = this.applyDamageToMonster(target, finalDamage);
        targetHpAfter = result.hpAfter;
        targetDefeated = result.defeated;
        await this.participantRepo.save(target);
      }

      // Concentration check
      if (target.isConcentrating && finalDamage > 0 && !targetDefeated) {
        const concResult = await this.concentrationCheck(
          target,
          finalDamage,
        );
        concentrationBroken = !concResult.maintained;
        events.push({
          event_type: 'concentration_check',
          target_participant_id: target.id,
          data: concResult,
        });
      }

      if (targetDefeated) {
        // Break concentration if defeated
        if (target.isConcentrating) {
          target.isConcentrating = false;
          target.concentratingOn = undefined;
          await this.participantRepo.save(target);
        }
      }
    }

    if (!dto._isSubAttack) {
      attacker.actionUsed = true;

      // Spec 003 T032 — ataque remove Hidden do atacante (RAW PHB cap. 9).
      if (attacker.conditions?.includes('hidden')) {
        attacker.conditions = attacker.conditions.filter(
          (c) => c !== 'hidden',
        );
        events.push({
          event_type: 'condition_removed',
          actor_participant_id: attacker.id,
          data: { condition: 'hidden', reason: 'attacked' },
        });
      }

      // Spec 003 T032 — consome Help (limpa a tríade no ajudante) se
      // o ataque foi contra o alvo escolhido.
      if (reactive.consumedHelp && activeHelper) {
        activeHelper.helpingAllyParticipantId = null;
        activeHelper.helpingTargetParticipantId = null;
        activeHelper.helpingUntilTurnOfParticipantId = null;
        await this.participantRepo.save(activeHelper);
        events.push({
          event_type: 'help_consumed',
          actor_participant_id: activeHelper.id,
          data: {
            allyParticipantId: attacker.id,
            targetParticipantId: target.id,
          },
        });
      }

      await this.participantRepo.save(attacker);

      await this.eventService.emit(
        encounter.sessionId,
        encounterId,
        events,
      );
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

  // --- Multiattack ---

  async resolveMultiattack(
    encounterId: string,
    dto: AttackDto,
  ): Promise<GameResult<MultiattackResult>> {
    const encounter = await this.encounterRepo.findOne({ where: { id: encounterId } });
    if (!encounter || encounter.status !== 'active')
      return failure('Encontro nao esta ativo.', 'ENCOUNTER_NOT_ACTIVE');

    const attacker = await this.encounterService.getParticipant(dto.attackerParticipantId);

    if (attacker.isDefeated)
      return failure('Atacante esta derrotado.', 'CONDITION_PREVENTS_ACTION');

    const currentPid = encounter.turnOrder[encounter.currentTurnIndex];
    if (currentPid !== dto.attackerParticipantId)
      return failure('Nao e o turno deste participante.', 'NOT_YOUR_TURN');

    if (attacker.actionUsed)
      return failure('Acao ja utilizada neste turno.', 'NO_ACTION_AVAILABLE');

    if (!this.conditionEffects.canTakeAction(attacker.conditions))
      return failure('Atacante nao pode agir devido a condicoes.', 'CONDITION_PREVENTS_ACTION');

    if (attacker.type !== 'monster' || !attacker.monster) {
      return failure('Multiataque só se aplica a monstros.', 'INVALID_MULTIATTACK');
    }
    const multiattack = (attacker.monster as any).multiattack;
    if (!multiattack || !Array.isArray(multiattack.sequence) || multiattack.sequence.length === 0) {
      return failure('Este monstro não possui multiataque configurado.', 'INVALID_MULTIATTACK');
    }

    const expectedTargets = multiattack.sequence.reduce(
      (acc: number, s: { count: number }) => acc + (s.count ?? 1),
      0,
    );
    const targetIds = Array.isArray(dto.targetParticipantIds) ? dto.targetParticipantIds : [];
    if (targetIds.length !== expectedTargets) {
      return failure(
        `Multiataque exige targetParticipantIds com ${expectedTargets} alvos.`,
        'INVALID_PAYLOAD',
      );
    }

    const subAttacks: SubAttackResult[] = [];
    const allEvents: GameEventData[] = [
      {
        event_type: 'multiattack_start',
        actor_participant_id: attacker.id,
        data: { sequence: multiattack.sequence },
      },
    ];

    let targetIdx = 0;
    let interruptedAt: MultiattackResult['interruptedAt'] = null;

    outer: for (const sub of multiattack.sequence) {
      for (let i = 0; i < (sub.count ?? 1); i++) {
        const tid = targetIds[targetIdx];
        targetIdx++;
        const target = await this.encounterService.getParticipant(tid);
        if (target.isDefeated) {
          interruptedAt = { index: targetIdx - 1, reason: 'target_defeated' };
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
          interruptedAt = { index: targetIdx - 1, reason: 'action_cancelled' };
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
          interruptedAt = { index: targetIdx - 1, reason: 'target_defeated' };
          break outer;
        }
      }
    }

    attacker.actionUsed = true;
    await this.participantRepo.save(attacker);

    allEvents.push({
      event_type: 'multiattack_end',
      actor_participant_id: attacker.id,
      data: { subAttackCount: subAttacks.length, interruptedAt },
    });

    await this.eventService.emit(encounter.sessionId, encounterId, allEvents);

    return success(
      { kind: 'multiattack', actionConsumed: true, subAttacks, interruptedAt },
      allEvents,
    );
  }

  // --- Arbitrary Damage/Heal ---

  async applyDamage(
    encounterId: string,
    dto: DamageDto,
  ): Promise<
    GameResult<{
      hpAfter: number;
      defeated: boolean;
      dyingState?: 'none' | 'dying' | 'stable' | 'dead';
      instantDeath?: boolean;
    }>
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    let hpAfter: number;
    let defeated: boolean;
    let dyingState: 'none' | 'dying' | 'stable' | 'dead' | undefined;
    let instantDeath = false;
    const events: GameEventData[] = [];

    if (target.type === 'pc' && target.characterId) {
      const wasDying = target.dyingState === 'dying';

      // Rule: PC already at 0 HP and dying takes damage → death-save failure
      // (+2 on crit, +1 otherwise) instead of further HP loss.
      if (wasDying) {
        const failuresDelta = dto.fromCriticalHit ? 2 : 1;
        const ds = await this.stateService.updateDeathSaves(
          dto.ownerUserId,
          target.characterId,
          { failuresDelta },
        );
        hpAfter = 0;
        if (ds.dead) {
          target.dyingState = 'dead';
          target.isDefeated = true;
          dyingState = 'dead';
          defeated = true;
          events.push({
            event_type: 'death_save_failed_from_damage',
            target_participant_id: target.id,
            data: { failuresAdded: failuresDelta, failures: ds.failures, dyingState: 'dead' },
          });
        } else {
          dyingState = 'dying';
          defeated = false;
          events.push({
            event_type: 'death_save_failed_from_damage',
            target_participant_id: target.id,
            data: { failuresAdded: failuresDelta, failures: ds.failures, dyingState: 'dying' },
          });
        }
        await this.participantRepo.save(target);
      } else {
        const result = await this.stateService.updateHp(
          dto.ownerUserId,
          target.characterId,
          { damage: dto.amount },
        );
        hpAfter = result.currentHp;
        instantDeath = result.instantDeath;

        if (instantDeath) {
          target.dyingState = 'dead';
          target.isDefeated = true;
          dyingState = 'dead';
          defeated = true;
          events.push({
            event_type: 'instant_death',
            target_participant_id: target.id,
            data: { damage: dto.amount, dyingState: 'dead' },
          });
          await this.participantRepo.save(target);
        } else if (result.isDown) {
          target.dyingState = 'dying';
          target.isDefeated = false;
          dyingState = 'dying';
          defeated = false;
          events.push({
            event_type: 'fell_unconscious',
            target_participant_id: target.id,
            data: { dyingState: 'dying' },
          });
          await this.participantRepo.save(target);
        } else {
          dyingState = target.dyingState;
          defeated = false;
        }
      }
    } else {
      const result = this.applyDamageToMonster(target, dto.amount);
      hpAfter = result.hpAfter;
      defeated = result.defeated;
      await this.participantRepo.save(target);
    }

    events.unshift({
      event_type: 'hp_change',
      target_participant_id: target.id,
      data: { damage: dto.amount, type: dto.damageType, hpAfter, defeated, dyingState },
    });

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ hpAfter, defeated, dyingState, instantDeath }, events);
  }

  async applyHealing(
    encounterId: string,
    dto: HealDto,
  ): Promise<
    GameResult<{
      hpAfter: number;
      defeated: boolean;
      dyingState?: 'none' | 'dying' | 'stable' | 'dead';
      deathSavesReset?: boolean;
    }>
  > {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const target = await this.encounterService.getParticipant(
      dto.targetParticipantId,
    );

    let hpAfter: number;
    let deathSavesReset = false;
    let dyingState: 'none' | 'dying' | 'stable' | 'dead' | undefined;
    let defeated = false;

    if (target.type === 'pc' && target.characterId) {
      const wasDyingOrStable =
        target.dyingState === 'dying' || target.dyingState === 'stable';
      const isDead = target.dyingState === 'dead';

      if (isDead) {
        return failure('Este participante ja esta morto.', 'ALREADY_DEAD');
      }

      const result = await this.stateService.updateHp(
        dto.ownerUserId,
        target.characterId,
        { healing: dto.amount },
      );
      hpAfter = result.currentHp;

      if (wasDyingOrStable && result.currentHp > 0) {
        target.dyingState = 'none';
        target.isDefeated = false;
        dyingState = 'none';
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
        event_type: 'hp_change',
        target_participant_id: target.id,
        data: { healing: dto.amount, hpAfter, dyingState, deathSavesReset },
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ hpAfter, defeated, dyingState, deathSavesReset }, events);
  }

  // --- Conditions ---

  async applyCondition(
    encounterId: string,
    dto: ConditionDto,
  ): Promise<GameResult<{ conditions: string[] }>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const participant = await this.encounterService.getParticipant(
      dto.participantId,
    );

    let conditions = [...participant.conditions];

    if (dto.apply) {
      if (!conditions.includes(dto.condition)) {
        conditions.push(dto.condition);
      }
    } else {
      conditions = conditions.filter((c) => c !== dto.condition);
    }

    participant.conditions = conditions;
    await this.participantRepo.save(participant);

    // Sync to CharacterState for PCs
    if (participant.type === 'pc' && participant.characterId) {
      await this.stateService.updateConditions(
        dto.ownerUserId,
        participant.characterId,
        { conditions },
      );
    }

    const events: GameEventData[] = [
      {
        event_type: dto.apply ? 'condition_applied' : 'condition_removed',
        target_participant_id: participant.id,
        data: { condition: dto.condition, conditions },
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success({ conditions }, events);
  }

  // --- Death Saves ---

  async resolveDeathSave(
    encounterId: string,
    participantId: string,
    ownerUserId: string,
  ): Promise<GameResult<DeathSaveResult>> {
    const encounter = await this.encounterRepo.findOne({
      where: { id: encounterId },
    });
    if (!encounter) return failure('Encontro nao encontrado.', 'ENCOUNTER_NOT_FOUND');

    const participant = await this.encounterService.getParticipant(
      participantId,
    );

    if (participant.type !== 'pc' || !participant.characterId) {
      return failure(
        'Death saves so se aplicam a PCs.',
        'INVALID_PARTICIPANT',
      );
    }

    if (participant.dyingState !== 'dying') {
      return failure('NOT_DYING');
    }

    const roll = this.diceService.roll(20);
    const naturalOne = roll === 1;
    const naturalTwenty = roll === 20;

    const dsResult = await this.stateService.updateDeathSaves(
      ownerUserId,
      participant.characterId,
      { rollValue: roll },
    );

    let dyingState: 'none' | 'dying' | 'stable' | 'dead' = 'dying';
    let revivedHp: number | null = null;

    if (dsResult.revivedHp) {
      dyingState = 'none';
      revivedHp = dsResult.revivedHp;
    } else if (dsResult.dead) {
      dyingState = 'dead';
    } else if (dsResult.stabilized) {
      dyingState = 'stable';
    }

    participant.dyingState = dyingState;
    participant.isDefeated = dyingState === 'dead';
    await this.participantRepo.save(participant);

    const result: DeathSaveResult = {
      roll,
      naturalOne,
      naturalTwenty,
      successes: dsResult.successes,
      failures: dsResult.failures,
      dyingState,
      stabilized: dyingState === 'stable',
      dead: dyingState === 'dead',
      revivedHp,
    };

    const events: GameEventData[] = [
      {
        event_type: 'death_save',
        actor_participant_id: participantId,
        data: result,
      },
    ];

    await this.eventService.emit(
      encounter.sessionId,
      encounterId,
      events,
    );

    return success(result, events);
  }

  // --- Private Helpers ---

  private applyDamageToMonster(
    participant: EncounterParticipantEntity,
    amount: number,
  ): { hpAfter: number; defeated: boolean } {
    let remaining = amount;

    // Temp HP absorbs first
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

    if (participant.type === 'monster' && participant.monster) {
      conMod = getAbilityModifier(participant.monster.constitution);
    } else if (participant.type === 'pc' && participant.characterId) {
      // Read real CON save bonus from the computed sheet (includes proficiency
      // when the class grants it — e.g., Barbarian, Cleric, Fighter, etc.).
      try {
        const ownerId = await this.resolveParticipantOwner(participant, '');
        if (ownerId) {
          const sheet = await this.sheetService.computeSheet(ownerId, participant.characterId);
          const conSave = sheet.savingThrows?.find((s: any) => s.slug === 'con');
          if (conSave) conMod = conSave.bonus;
        }
      } catch {
        // Fall through: conMod stays 0. The check still runs, just with no bonus.
      }
    }

    const roll = this.diceService.roll(20);
    const total = roll + conMod;
    const maintained = total >= dc;

    if (!maintained) {
      participant.isConcentrating = false;
      participant.concentratingOn = undefined;
      await this.participantRepo.save(participant);
    }

    return {
      dc,
      roll,
      modifier: conMod,
      total,
      maintained,
      spellName: participant.concentratingOn ?? undefined,
    };
  }
}
