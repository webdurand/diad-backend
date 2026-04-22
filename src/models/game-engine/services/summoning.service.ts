import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterParticipantEntity } from 'src/entities/encounter-participant.entity';
import { MonsterEntity } from 'src/entities/monster.entity';
import { EncounterEntity } from 'src/entities/encounter.entity';
import { SummonSpawnDto } from '../interfaces/summoning.interfaces';

/**
 * Spec 012 \u2014 SummoningService.
 *
 * Cria participants linked ao caster (summons/pets/duplicates/illusions).
 * Cleanup em cascata quando caster morre, perde concentra\u00e7\u00e3o ou a dura\u00e7\u00e3o
 * expira.
 *
 * Clientes futuros (9+ spells/features): Summon Beast/Fey/Elemental (L2-L5
 * spells 2024), Conjure Animals (L3), Find Familiar, Spiritual Weapon,
 * Flaming Sphere, Animate Dead, Ranger Beast Master Companion, Echo Knight.
 */
@Injectable()
export class SummoningService {
  private readonly logger = new Logger(SummoningService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounterRepo: Repository<EncounterEntity>,
  ) {}

  /**
   * Cria 1 summon linkado ao caster. Retorna o participant salvo.
   */
  async spawnSummon(
    encounterId: string,
    dto: SummonSpawnDto,
  ): Promise<EncounterParticipantEntity> {
    const caster = await this.participantRepo.findOne({
      where: { id: dto.casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException(
        `caster participant ${dto.casterParticipantId} not found`,
      );
    }
    if (caster.encounterId !== encounterId) {
      throw new BadRequestException(
        'caster participant n\u00e3o pertence a este encounter',
      );
    }
    const monster = await this.monsterRepo.findOne({
      where: { slug: dto.monsterSlug },
    });
    if (!monster) {
      throw new NotFoundException(`monster ${dto.monsterSlug} n\u00e3o existe`);
    }

    const summon = new EncounterParticipantEntity();
    summon.encounterId = encounterId;
    summon.type = 'monster';
    summon.monsterId = monster.id;
    summon.monster = monster;
    summon.displayName = dto.displayName ?? monster.name;
    summon.faction = dto.faction ?? 'ally';
    summon.currentHp = monster.hit_points;
    summon.maxHp = monster.hit_points;
    summon.tempHp = 0;
    summon.positionX = dto.position?.x ?? caster.positionX ?? 0;
    summon.positionY = dto.position?.y ?? caster.positionY ?? 0;
    summon.isVisible = true;
    summon.isDefeated = false;
    summon.dyingState = 'none';
    summon.actionUsed = false;
    summon.bonusActionUsed = false;
    summon.hasDashed = false;
    summon.hasDisengaged = false;
    summon.reactionsUsed = 0;
    summon.conditions = [];
    summon.conditionInstances = [];
    summon.appliedEffects = [];
    summon.effectInstances = [];
    summon.spellSlotsUsed = {};
    summon.rechargeState = {};
    summon.legendaryActionsUsed = 0;
    summon.freeObjectInteractionsUsed = 0;
    summon.attacksUsedThisTurn = 0;
    summon.attacksMaxThisTurn = 1;
    summon.recklessAttackActive = false;
    summon.cleaveUsedThisTurn = false;
    summon.nickUsedThisTurn = false;
    summon.tacticalMasterOverride = null;
    summon.inspirationArmed = false;
    summon.superiorityDiceUsed = 0;
    summon.relentlessRageUsesUsed = 0;
    summon.sorceryPointsUsed = 0;
    summon.sorcerousRestorationUsed = false;
    summon.indomitableArmed = false;
    summon.dodgingUntilTurnOfParticipantId = null;
    summon.helpingAllyParticipantId = null;
    summon.helpingTargetParticipantId = null;
    summon.helpingUntilTurnOfParticipantId = null;
    summon.readiedAction = null;
    summon.lastAiTurnRound = null;
    summon.lastAiTurnResult = null;
    summon.controlledBy = dto.controlMode === 'ai-controlled' ? 'ai' : 'dm';
    summon.concentrationRoundsRemaining = null;
    summon.concentrationSaveDc = null;
    summon.isConcentrating = false;
    summon.grappledByParticipantId = null;
    summon.transformationState = null;
    summon.linkedCasterParticipantId = caster.id;

    const saved = await this.participantRepo.save(summon);
    this.logger.log(
      `[summoning] ${dto.source} \u2192 ${monster.name} (id=${saved.id}, caster=${caster.id}, faction=${summon.faction})`,
    );
    return saved;
  }

  /**
   * Remove 1 summon espec\u00edfico.
   */
  async dismissSummon(
    summonParticipantId: string,
    reason: 'player-dismiss' | 'caster-death' | 'concentration-broken' | 'duration-end',
  ): Promise<void> {
    const summon = await this.participantRepo.findOne({
      where: { id: summonParticipantId },
    });
    if (!summon || !summon.linkedCasterParticipantId) return;
    await this.participantRepo.remove(summon);
    this.logger.log(
      `[summoning] dismissed ${summonParticipantId} (reason=${reason})`,
    );
  }

  /**
   * Lista todos summons linkados ao caster.
   */
  async getSummonsOf(
    casterParticipantId: string,
  ): Promise<EncounterParticipantEntity[]> {
    return this.participantRepo.find({
      where: { linkedCasterParticipantId: casterParticipantId },
    });
  }

  /**
   * Cascade: caster morreu \u2192 todos summons dele somem.
   */
  async dismissAllOfCaster(
    casterParticipantId: string,
    reason: 'caster-death' | 'concentration-broken',
  ): Promise<number> {
    const summons = await this.getSummonsOf(casterParticipantId);
    await Promise.all(
      summons.map((s) => this.dismissSummon(s.id, reason)),
    );
    return summons.length;
  }
}
