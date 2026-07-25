import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { MonsterEntity } from "src/entities/monster.entity";
import { CharacterStateEntity } from "src/entities/character-state.entity";
import {
  TransformationForm,
  TransformationOriginalSnapshot,
  TransformationRevertReason,
  TransformationSource,
  TransformationState,
} from "../interfaces/transformation.interfaces";
import type { GameEventData } from "../interfaces/result.type";


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


  async enterForm(
    participantId: string,
    dto: {
      source: TransformationSource;
      monsterSlug: string;
      formDisplayName?: string;
      durationRoundsTotal?: number | null;
      rulesMode?: TransformationState["rulesMode"];
      maxChallengeRating?: number;
      druidLevel?: number;
      wisdomModifier?: number;
      isMoonDruid?: boolean;
      originalMaxHp?: number;
      originalWalkSpeed?: number;
      retainedAbilities?: TransformationState["retainedAbilities"];
      equipmentHandling?: TransformationState["equipmentHandling"];
      revertTriggers?: Partial<TransformationState["revertTriggers"]>;
      currentEncounterRound?: number;

      sourceCasterParticipantId?: string | null;
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
        "ALREADY_TRANSFORMED: participant j\u00e1 est\u00e1 em outra forma",
      );
    }
    const monster = await this.monsterRepo.findOne({
      where: { slug: dto.monsterSlug },
    });
    if (!monster) {
      throw new NotFoundException(`MONSTER_NOT_FOUND: slug=${dto.monsterSlug}`);
    }
    if (
      dto.maxChallengeRating != null &&
      monster.challenge_rating > dto.maxChallengeRating
    ) {
      throw new BadRequestException(
        `CR do form (${monster.challenge_rating}) excede o máximo permitido (${dto.maxChallengeRating}).`,
      );
    }


    const original: TransformationOriginalSnapshot =
      await this.snapshotOriginal(participant);


    const form: TransformationForm = this.buildFormFromMonster(
      monster,
      dto.formDisplayName,
    );
    if (dto.originalWalkSpeed != null) {
      original.walkSpeed = dto.originalWalkSpeed;
      participant.movementRemaining = Math.max(
        0,
        (participant.movementRemaining ?? dto.originalWalkSpeed) +
          (form.speed.walk - dto.originalWalkSpeed),
      );
    }
    const isXphbWildShape = dto.rulesMode === "xphb-wild-shape";
    const grantedTempHp = isXphbWildShape
      ? Math.max(
          1,
          (dto.druidLevel ?? 2) * (dto.isMoonDruid ? 3 : 1),
        )
      : 0;
    if (isXphbWildShape) {
      const originalMaxHp = dto.originalMaxHp ?? original.currentHp;
      original.maxHp = originalMaxHp;
      form.maxHp = originalMaxHp;
      form.currentHp = original.currentHp;
      form.tempHp = grantedTempHp;
      if (dto.isMoonDruid) {
        form.ac = Math.max(form.ac, 13 + (dto.wisdomModifier ?? 0));
      }
    }

    const state: TransformationState = {
      source: dto.source,
      rulesMode: dto.rulesMode ?? "legacy-form-hp",
      enteredAtRound: dto.currentEncounterRound ?? 0,
      sourceCasterParticipantId: dto.sourceCasterParticipantId ?? null,
      durationRoundsTotal: dto.durationRoundsTotal ?? null,
      durationRoundsRemaining: dto.durationRoundsTotal ?? null,
      original,
      form,
      grantedTempHp,
      retainedAbilities: dto.retainedAbilities ?? ["mental-stats", "speech"],
      equipmentHandling: dto.equipmentHandling ?? "merge",
      revertTriggers: {
        hpZero: dto.revertTriggers?.hpZero ?? true,
        concentrationBroken: dto.revertTriggers?.concentrationBroken ?? false,
        durationEnd: dto.revertTriggers?.durationEnd ?? true,
        playerDismiss: dto.revertTriggers?.playerDismiss ?? true,
      },
    };

    participant.transformationState = state;




    const newDisplay = dto.formDisplayName ?? form.formName;
    participant.displayName = newDisplay;
    form.displayName = newDisplay;


    if (dto.source === "wild-shape") {
      participant.bonusActionUsed = true;
    }
    if (isXphbWildShape) {
      if (participant.characterId) {
        const characterState = await this.stateRepo.findOne({
          where: { character_id: participant.characterId },
        });
        if (characterState) {
          characterState.temp_hp = Math.max(
            characterState.temp_hp ?? 0,
            grantedTempHp,
          );
          await this.stateRepo.save(characterState);
        }
      }
      participant.tempHp = Math.max(participant.tempHp ?? 0, grantedTempHp);
    }

    await this.participantRepo.save(participant);
    this.logger.log(
      `[transformation] ${participantId} \u2192 ${form.formName} (source=${dto.source}, maxHp=${form.maxHp})`,
    );
    return participant;
  }


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
      return participant;
    }

    const state = participant.transformationState;
    participant.displayName = state.original.displayName;
    participant.transformationState = null;
    if (state.original.walkSpeed != null) {
      participant.movementRemaining = Math.max(
        0,
        (participant.movementRemaining ?? state.form.speed.walk) +
          (state.original.walkSpeed - state.form.speed.walk),
      );
    }
    if (state.rulesMode === "xphb-wild-shape" && state.grantedTempHp) {
      if (participant.characterId) {
        const characterState = await this.stateRepo.findOne({
          where: { character_id: participant.characterId },
        });
        if (characterState) {
          characterState.temp_hp = 0;
          await this.stateRepo.save(characterState);
        }
      }
      participant.tempHp = 0;
    }

    await this.participantRepo.save(participant);
    this.logger.log(
      `[transformation] ${participantId} reverteu (${state.form.formName} \u2192 ${state.original.displayName}, reason=${reason})`,
    );
    return participant;
  }


  async applyDamageToForm(
    participantId: string,
    amount: number,
  ): Promise<{
    absorbedByForm: number;
    overflowToOriginal: number;
    reverted: boolean;
    usesOriginalHp?: boolean;
  }> {
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.transformationState) {
      return { absorbedByForm: 0, overflowToOriginal: amount, reverted: false };
    }
    const state = participant.transformationState;
    if (state.rulesMode === "xphb-wild-shape") {
      return {
        absorbedByForm: 0,
        overflowToOriginal: amount,
        reverted: false,
        usesOriginalHp: true,
      };
    }
    const formHp = state.form.currentHp;
    const absorbed = Math.min(formHp, amount);
    const overflow = Math.max(0, amount - formHp);
    state.form.currentHp = Math.max(0, formHp - amount);

    const reverted = state.form.currentHp <= 0 && state.revertTriggers.hpZero;

    if (reverted) {

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


  async tickDurationOnTurnStart(
    participantId: string,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const participant = await this.participantRepo.findOne({
      where: { id: participantId },
    });
    if (!participant?.transformationState) return { events };
    const state = participant.transformationState;
    if (state.durationRoundsRemaining == null) return { events };

    state.durationRoundsRemaining -= 1;
    if (state.durationRoundsRemaining > 0) {
      await this.participantRepo.save(participant);
      return { events };
    }


    if (state.source === "true-polymorph-spell") {


      state.sourceCasterParticipantId = null;
      state.revertTriggers = {
        ...state.revertTriggers,
        concentrationBroken: false,
        durationEnd: false,
      };
      state.durationRoundsTotal = null;
      state.durationRoundsRemaining = null;
      await this.participantRepo.save(participant);
      events.push({
        event_type: "true_polymorph_became_permanent",
        target_participant_id: participant.id,
        data: {
          formName: state.form.formName,
          narrativeDescriptor: `A transforma\u00e7\u00e3o em ${state.form.formName} torna-se permanente.`,
        },
      });
      this.logger.log(
        `[transformation] ${participantId} true-polymorph \u2192 permanent`,
      );
      return { events };
    }


    const formName = state.form.formName;
    const originalDisplay = state.original.displayName;
    participant.displayName = originalDisplay;
    participant.transformationState = null;
    await this.participantRepo.save(participant);
    events.push({
      event_type: "transformation_reverted",
      target_participant_id: participant.id,
      data: {
        reason: "duration-expired",
        formName,
        source: state.source,
        narrativeDescriptor: `${formName} se desfaz e ${originalDisplay} retorna \u00e0 forma original.`,
      },
    });
    this.logger.log(
      `[transformation] ${participantId} reverted (duration-expired, source=${state.source})`,
    );
    return { events };
  }


  getEffectiveSpeed(
    participant: EncounterParticipantEntity,
  ): TransformationForm["speed"] | null {
    return participant.transformationState?.form.speed ?? null;
  }

  getEffectiveAc(participant: EncounterParticipantEntity): number | null {
    return participant.transformationState?.form.ac ?? null;
  }

  getEffectiveActions(
    participant: EncounterParticipantEntity,
  ): TransformationForm["actions"] | null {
    return participant.transformationState?.form.actions ?? null;
  }



  private async snapshotOriginal(
    participant: EncounterParticipantEntity,
  ): Promise<TransformationOriginalSnapshot> {
    if (participant.characterId) {
      const state = await this.stateRepo.findOne({
        where: { character_id: participant.characterId },
      });

      return {
        maxHp: 0,
        currentHp: state?.current_hp ?? 1,
        tempHp: state?.temp_hp ?? 0,
        displayName: participant.displayName,
      };
    }

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
    const speed = monster.speed;
    const parseSpeedValue = (v: unknown): number | undefined => {
      if (typeof v === "number") return v;
      if (typeof v === "string") {
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
      actions: Array.isArray(
        (monster as unknown as { actions?: unknown[] }).actions,
      )
        ? ((monster as unknown as { actions: unknown[] }).actions as Record<
            string,
            unknown
          >[])
        : [],
      multiattack:
        (
          monster as unknown as {
            multiattack?: TransformationForm["multiattack"];
          }
        ).multiattack ?? null,
      challengeRating:
        typeof (monster as unknown as { challenge_rating?: unknown })
          .challenge_rating === "number"
          ? (monster as unknown as { challenge_rating: number })
              .challenge_rating
          : undefined,
    };
  }

  private extractAc(ac: unknown): number {
    if (typeof ac === "number") return ac;
    if (Array.isArray(ac) && ac.length > 0) {
      const first = ac[0] as { value?: number };
      if (typeof first?.value === "number") return first.value;
    }
    if (typeof ac === "object" && ac !== null) {
      const v = (ac as { value?: number }).value;
      if (typeof v === "number") return v;
    }
    return 10;
  }
}
