import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { EffectInstanceService } from "./effect-instance.service";
import type { GameEventData } from "../interfaces/result.type";


@Injectable()
export class BardFeaturesService {
  private readonly logger = new Logger(BardFeaturesService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly sheetService: CharacterSheetService,
    private readonly effects: EffectInstanceService,
  ) {}


  getBardicInspirationDie(bardLevel: number): 6 | 8 | 10 | 12 {
    if (bardLevel >= 15) return 12;
    if (bardLevel >= 10) return 10;
    if (bardLevel >= 5) return 8;
    return 6;
  }


  async grantBardicInspiration(
    casterParticipantId: string,
    targetParticipantId: string,
    bardLevel: number,
  ): Promise<{ events: GameEventData[]; dieSize: number }> {
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId },
    });
    if (!caster?.characterId) {
      throw new NotFoundException("caster n\u00e3o \u00e9 PC Bard");
    }
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) {
      throw new NotFoundException("target n\u00e3o encontrado");
    }
    const dieSize = this.getBardicInspirationDie(bardLevel);



    const res = await this.effects.addEffect(target, {
      kind: "bardic_inspiration",
      sourceCasterParticipantId: caster.id,
      sourceFeatureSlug: "bardic-inspiration",
      payload: {
        dieSize,
        dieFormula: `1d${dieSize}`,
        bardLevel,
      } as Record<string, unknown>,
      requiresConcentration: false,
      expiresAt: { kind: "until_consumed" as const },
    } as unknown as Parameters<EffectInstanceService["addEffect"]>[1]);

    this.logger.log(
      `[bard] BI granted: caster=${caster.id} \u2192 target=${target.id} (d${dieSize})`,
    );

    return {
      events: [
        ...res.events,
        {
          event_type: "bardic_inspiration_granted",
          actor_participant_id: caster.id,
          target_participant_id: target.id,
          data: { dieSize, bardLevel },
        },
      ],
      dieSize,
    };
  }


  async consumeBardicInspirationIfPresent(
    targetParticipantId: string,
    context: "attack_roll" | "saving_throw" | "ability_check",
    diceRoller: (sides: number) => number,
  ): Promise<{
    consumed: boolean;
    bonus: number;
    dieSize?: number;
    events: GameEventData[];
  }> {
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) return { consumed: false, bonus: 0, events: [] };
    const biEffect = (target.effectInstances ?? []).find(
      (e) => (e as unknown as { kind?: string }).kind === "bardic_inspiration",
    );
    if (!biEffect) return { consumed: false, bonus: 0, events: [] };
    const payload =
      (biEffect as unknown as { payload?: { dieSize?: number } }).payload ?? {};
    const dieSize = payload.dieSize ?? 6;
    const bonus = diceRoller(dieSize);
    const effectId = (biEffect as unknown as { id: string }).id;


    target.effectInstances = (target.effectInstances ?? []).filter(
      (e) => (e as unknown as { id: string }).id !== effectId,
    );
    try {
      await this.participantRepo.save(target);
    } catch {

    }

    return {
      consumed: true,
      bonus,
      dieSize,
      events: [
        {
          event_type: "bardic_inspiration_consumed",
          target_participant_id: target.id,
          data: { dieSize, bonus, context },
        },
      ],
    };
  }


  async applyCuttingWords(
    casterParticipantId: string,
    targetParticipantId: string,
    bardLevel: number,
  ): Promise<{ events: GameEventData[]; dieSize: number }> {
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId },
    });
    if (!caster?.characterId) {
      throw new NotFoundException("caster nao e PC Bard");
    }
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) {
      throw new NotFoundException("target nao encontrado");
    }
    const dieSize = this.getBardicInspirationDie(bardLevel);

    const res = await this.effects.addEffect(target, {
      kind: "cutting_words_penalty",
      sourceCasterParticipantId: caster.id,
      sourceFeatureSlug: "cutting-words",
      payload: {
        dieSize,
        dieFormula: `1d${dieSize}`,
        bardLevel,
      } as Record<string, unknown>,
      requiresConcentration: false,
      expiresAt: { kind: "until_consumed" as const },
    } as unknown as Parameters<EffectInstanceService["addEffect"]>[1]);

    this.logger.log(
      `[bard] Cutting Words: caster=${caster.id} -> target=${target.id} (d${dieSize})`,
    );

    return {
      events: [
        ...res.events,
        {
          event_type: "cutting_words_applied",
          actor_participant_id: caster.id,
          target_participant_id: target.id,
          data: { dieSize, bardLevel },
        },
      ],
      dieSize,
    };
  }


  async applyCountercharm(
    casterParticipantId: string,
    targetParticipantId: string,
  ): Promise<{ events: GameEventData[] }> {
    const caster = await this.participantRepo.findOne({
      where: { id: casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException("caster nao encontrado");
    }
    const target = await this.participantRepo.findOne({
      where: { id: targetParticipantId },
    });
    if (!target) {
      throw new NotFoundException("target nao encontrado");
    }

    const res = await this.effects.addEffect(target, {
      kind: "countercharm_reroll_available",
      sourceCasterParticipantId: caster.id,
      sourceFeatureSlug: "countercharm",
      payload: {
        appliesTo: ["charmed", "frightened"],
      } as Record<string, unknown>,
      requiresConcentration: false,
      expiresAt: { kind: "until_consumed" as const },
    } as unknown as Parameters<EffectInstanceService["addEffect"]>[1]);

    this.logger.log(
      `[bard] Countercharm: caster=${caster.id} -> target=${target.id}`,
    );

    return {
      events: [
        ...res.events,
        {
          event_type: "countercharm_activated",
          actor_participant_id: caster.id,
          target_participant_id: target.id,
          data: { appliesTo: ["charmed", "frightened"] },
        },
      ],
    };
  }
}
