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
import { CharacterStateEntity } from 'src/entities/character-state.entity';
import {
  TransformationForm,
  TransformationOriginalSnapshot,
  TransformationRevertReason,
  TransformationSource,
  TransformationState,
} from '../interfaces/transformation.interfaces';

/**
 * Spec 012 — TransformationService.
 *
 * Pipeline compartilhado por Wild Shape, Polymorph, Form of Dread, Draconic
 * Transformation, etc. Cada fonte chama `enterForm` com seus par\u00e2metros.
 *
 * Contrato core:
 * - `enterForm`: snapshota HP original (e displayName), popula `form` com
 *   stats/AC/speed/actions copiados do monster alvo, persiste no participant.
 * - `revertForm`: restaura HP original, limpa transformationState.
 * - `applyDamageToForm`: dano vai pro form HP primeiro; se zera, reverte e
 *   excesso vai pro HP original.
 *
 * Invariantes:
 * - Enquanto transformado, HP original fica intacto (RAW 2024 Wild Shape).
 * - Speed/AC/stats f\u00edsicos do form substituem os do PC no combate.
 * - Mentais (INT/WIS/CHA) ficam com original (RAW explicit).
 */
@Injectable()
export class TransformationService {
  private readonly logger = new Logger(TransformationService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    @InjectRepository(MonsterEntity)
    private readonly monsterRepo: Repository<MonsterEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
  ) {}

  isTransformed(participant: EncounterParticipantEntity): boolean {
    return !!participant.transformationState;
  }

  getActiveForm(
    participant: EncounterParticipantEntity,
  ): TransformationState | null {
    return participant.transformationState ?? null;
  }

  /**
   * Entra em forma nova. Retorna o participant atualizado.
   */
  async enterForm(
    participantId: string,
    dto: {
      source: TransformationSource;
      monsterSlug: string;
      formDisplayName?: string;
      durationRoundsTotal?: number | null;
      retainedAbilities?: TransformationState['retainedAbilities'];
      equipmentHandling?: TransformationState['equipmentHandling'];
      revertTriggers?: Partial<TransformationState['revertTriggers']>;
      currentEncounterRound?: number;
    },
  ): Promise<EncounterParticipantEntity> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) {
      throw new NotFoundException(`participant ${participantId} not found`);
    }
    if (participant.transformationState) {
      throw new BadRequestException(
        'ALREADY_TRANSFORMED: participant j\u00e1 est\u00e1 em outra forma',
      );
    }
    const monster = await this.monsterRepo.findOne({
      where: { slug: dto.monsterSlug },
    });
    if (!monster) {
      throw new NotFoundException(
        `MONSTER_NOT_FOUND: slug=${dto.monsterSlug}`,
      );
    }

    // Snapshot HP original. Pro PC, busca HP atual do character_state.
    const original: TransformationOriginalSnapshot = await this.snapshotOriginal(participant);

    // Popula form do monster
    const form: TransformationForm = this.buildFormFromMonster(
      monster,
      dto.formDisplayName,
    );

    const state: TransformationState = {
      source: dto.source,
      enteredAtRound: dto.currentEncounterRound ?? 0,
      durationRoundsTotal: dto.durationRoundsTotal ?? null,
      durationRoundsRemaining: dto.durationRoundsTotal ?? null,
      original,
      form,
      retainedAbilities: dto.retainedAbilities ?? ['mental-stats', 'speech'],
      equipmentHandling: dto.equipmentHandling ?? 'merge',
      revertTriggers: {
        hpZero: dto.revertTriggers?.hpZero ?? true,
        concentrationBroken: dto.revertTriggers?.concentrationBroken ?? false,
        durationEnd: dto.revertTriggers?.durationEnd ?? true,
        playerDismiss: dto.revertTriggers?.playerDismiss ?? true,
      },
    };

    participant.transformationState = state;
    // Display name do token vira "Original (Forma)"
    const newDisplay = dto.formDisplayName ?? `${original.displayName} (${form.formName})`;
    participant.displayName = newDisplay;
    form.displayName = newDisplay;

    // Wild Shape \u00e9 bonus action em 2024 XPHB \u2014 consome agora se for a fonte
    if (dto.source === 'wild-shape') {
      participant.bonusActionUsed = true;
    }

    await this.participantRepo.save(participant);
    this.logger.log(
      `[transformation] ${participantId} \u2192 ${form.formName} (source=${dto.source}, maxHp=${form.maxHp})`,
    );
    return participant;
  }

  /**
   * Reverte pra forma original. Idempotente se n\u00e3o transformado.
   */
  async revertForm(
    participantId: string,
    reason: TransformationRevertReason,
  ): Promise<EncounterParticipantEntity> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant) {
      throw new NotFoundException(`participant ${participantId} not found`);
    }
    if (!participant.transformationState) {
      return participant; // j\u00e1 n\u00e3o-transformado
    }

    const state = participant.transformationState;
    participant.displayName = state.original.displayName;
    participant.transformationState = null;

    await this.participantRepo.save(participant);
    this.logger.log(
      `[transformation] ${participantId} reverteu (${state.form.formName} \u2192 ${state.original.displayName}, reason=${reason})`,
    );
    return participant;
  }

  /**
   * Aplica dano ao HP do form. RAW 2024: quando form chega a 0, reverte e
   * damage excedente vai pro HP original do PC.
   */
  async applyDamageToForm(
    participantId: string,
    amount: number,
  ): Promise<{
    absorbedByForm: number;
    overflowToOriginal: number;
    reverted: boolean;
  }> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.transformationState) {
      return { absorbedByForm: 0, overflowToOriginal: amount, reverted: false };
    }
    const state = participant.transformationState;
    const formHp = state.form.currentHp;
    const absorbed = Math.min(formHp, amount);
    const overflow = Math.max(0, amount - formHp);
    state.form.currentHp = Math.max(0, formHp - amount);

    const reverted = state.form.currentHp <= 0 && state.revertTriggers.hpZero;

    if (reverted) {
      // Revert + apply overflow to original via character_state
      participant.displayName = state.original.displayName;
      participant.transformationState = null;
      await this.participantRepo.save(participant);
      if (overflow > 0 && participant.characterId) {
        const cstate = await this.stateRepo.findOne({
          where: { character_id: participant.characterId },
        });
        if (cstate) {
          cstate.current_hp = Math.max(0, cstate.current_hp - overflow);
          await this.stateRepo.save(cstate);
        }
      }
      this.logger.log(
        `[transformation] ${participantId} reverted (hp-zero, overflow=${overflow})`,
      );
    } else {
      await this.participantRepo.save(participant);
    }

    return {
      absorbedByForm: absorbed,
      overflowToOriginal: overflow,
      reverted,
    };
  }

  /**
   * Helper: retorna speed efetivo considerando transforma\u00e7\u00e3o.
   */
  getEffectiveSpeed(
    participant: EncounterParticipantEntity,
  ): TransformationForm['speed'] | null {
    return participant.transformationState?.form.speed ?? null;
  }

  getEffectiveAc(participant: EncounterParticipantEntity): number | null {
    return participant.transformationState?.form.ac ?? null;
  }

  getEffectiveActions(
    participant: EncounterParticipantEntity,
  ): TransformationForm['actions'] | null {
    return participant.transformationState?.form.actions ?? null;
  }

  // ---- internals ----

  private async snapshotOriginal(
    participant: EncounterParticipantEntity,
  ): Promise<TransformationOriginalSnapshot> {
    if (participant.characterId) {
      const state = await this.stateRepo.findOne({
        where: { character_id: participant.characterId },
      });
      // max_hp \u00e9 derivado do sheet (computeMaxHp), guardamos s\u00f3 current+temp.
      return {
        maxHp: 0, // sentinel \u2014 revert usa sheet.maxHp atual do char (n\u00e3o muda)
        currentHp: state?.current_hp ?? 1,
        tempHp: state?.temp_hp ?? 0,
        displayName: participant.displayName,
      };
    }
    // Monster/NPC snapshot (maxHp relevante pois participant guarda seu pr\u00f3prio)
    return {
      maxHp: participant.maxHp ?? 1,
      currentHp: participant.currentHp ?? 1,
      tempHp: participant.tempHp ?? 0,
      displayName: participant.displayName,
    };
  }

  private buildFormFromMonster(
    monster: MonsterEntity,
    displayName?: string,
  ): TransformationForm {
    const speed = monster.speed as Record<string, unknown>;
    const parseSpeedValue = (v: unknown): number | undefined => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const match = v.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : undefined;
      }
      return undefined;
    };
    const ac = this.extractAc(monster.armor_class);
    return {
      monsterSlug: monster.slug,
      formName: monster.name,
      displayName: displayName ?? monster.name,
      size: monster.size,
      ac,
      maxHp: monster.hit_points,
      currentHp: monster.hit_points,
      tempHp: 0,
      speed: {
        walk: parseSpeedValue(speed?.walk) ?? 30,
        fly: parseSpeedValue(speed?.fly),
        swim: parseSpeedValue(speed?.swim),
        climb: parseSpeedValue(speed?.climb),
        burrow: parseSpeedValue(speed?.burrow),
      },
      stats: {
        str: monster.strength,
        dex: monster.dexterity,
        con: monster.constitution,
        int: monster.intelligence,
        wis: monster.wisdom,
        cha: monster.charisma,
      },
      actions: Array.isArray((monster as unknown as { actions?: unknown[] }).actions)
        ? ((monster as unknown as { actions: unknown[] }).actions as Record<string, unknown>[])
        : [],
      challengeRating: typeof (monster as unknown as { challenge_rating?: unknown }).challenge_rating === 'number'
        ? (monster as unknown as { challenge_rating: number }).challenge_rating
        : undefined,
    };
  }

  private extractAc(ac: unknown): number {
    if (typeof ac === 'number') return ac;
    if (Array.isArray(ac) && ac.length > 0) {
      const first = ac[0] as { value?: number };
      if (typeof first?.value === 'number') return first.value;
    }
    if (typeof ac === 'object' && ac !== null) {
      const v = (ac as { value?: number }).value;
      if (typeof v === 'number') return v;
    }
    return 10;
  }
}
