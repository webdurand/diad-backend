import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CombatService } from "./combat.service";
import type { GameEventData } from "../interfaces/result.type";
import { canTakeReactionFromConditions } from "./condition-effects.service";

export interface OpportunityAttackDto {
  encounterId: string;
  attackerParticipantId: string;
  targetParticipantId: string;

  actionSlug?: string;

  actionName?: string;
  ownerUserId: string;
}

export interface OpportunityAttackResult {
  ok: boolean;
  code?: string;
  message?: string;
  events?: GameEventData[];
  attackValue?: unknown;
}


@Injectable()
export class OpportunityAttackService {
  private readonly logger = new Logger(OpportunityAttackService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @Inject(forwardRef(() => CombatService))
    private readonly combat: CombatService,
  ) {}

  async resolve(dto: OpportunityAttackDto): Promise<OpportunityAttackResult> {
    const attacker = await this.participants.findOne({
      where: { id: dto.attackerParticipantId },
    });
    if (!attacker) {
      throw new NotFoundException(
        `attacker ${dto.attackerParticipantId} not found`,
      );
    }
    if (attacker.encounterId !== dto.encounterId) {
      throw new BadRequestException("ATTACKER_NOT_IN_ENCOUNTER");
    }


    if ((attacker.reactionsUsed ?? 0) > 0) {
      return {
        ok: false,
        code: "REACTION_UNAVAILABLE",
        message: "Attacker já usou sua reaction nesta rodada.",
      };
    }
    if (!canTakeReactionFromConditions(attacker.conditions)) {
      return {
        ok: false,
        code: "CONDITION_PREVENTS_REACTION",
        message: "A condição atual impede reactions.",
      };
    }
    if (
      (attacker.effectInstances ?? []).some(
        (effect) => effect.kind === "opportunity_attacks_blocked",
      )
    ) {
      return {
        ok: false,
        code: "OPPORTUNITY_ATTACK_BLOCKED",
        message:
          "Attacker não pode fazer Opportunity Attacks enquanto este efeito durar.",
      };
    }

    if (attacker.isDefeated || attacker.dyingState === "dead") {
      return {
        ok: false,
        code: "ATTACKER_DEFEATED",
        message: "Attacker derrotado não pode atacar.",
      };
    }

    const target = await this.participants.findOne({
      where: { id: dto.targetParticipantId },
    });
    if (!target) {
      throw new NotFoundException(
        `target ${dto.targetParticipantId} not found`,
      );
    }
    if (target.faction === attacker.faction) {
      return {
        ok: false,
        code: "SAME_FACTION",
        message: "Não pode fazer opportunity attack em aliado.",
      };
    }




    const attackRes = await this.combat.resolveAttack(dto.encounterId, {
      attackerParticipantId: attacker.id,
      targetParticipantId: target.id,
      actionSlug: dto.actionSlug,
      actionName: dto.actionName ?? dto.actionSlug ?? "Opportunity Attack",
      ownerUserId: dto.ownerUserId,
      _isSubAttack: true,
      _bypassRangeCheck: true,
    });


    attacker.reactionsUsed = (attacker.reactionsUsed ?? 0) + 1;
    await this.participants.save(attacker);

    const events: GameEventData[] = [
      {
        event_type: "opportunity_attack_resolved",
        actor_participant_id: attacker.id,
        target_participant_id: target.id,
        data: {
          actionName: dto.actionName,
          actionSlug: dto.actionSlug,
          reactionConsumed: true,
          hit: attackRes.ok,
        },
      },
    ];

    this.logger.log(
      `[OA] attacker=${attacker.id} → target=${target.id} (${dto.actionName ?? dto.actionSlug})`,
    );

    const attackEvents: GameEventData[] =
      (attackRes as unknown as { events?: GameEventData[] }).events ?? [];
    const attackOk = attackRes.ok;
    const attackErrorCode = !attackOk
      ? ((attackRes as unknown as { code?: string; error?: string }).code ??
        (attackRes as unknown as { code?: string; error?: string }).error ??
        "ATTACK_FAILED")
      : undefined;

    if (!attackOk) {
      this.logger.warn(
        `[OA] attack failed: attacker=${attacker.id} target=${target.id} code=${attackErrorCode}`,
      );
    }



    return {
      ok: attackOk,
      code: attackErrorCode,
      events: [...events, ...attackEvents],
      attackValue: attackOk
        ? (attackRes as unknown as { value?: unknown }).value
        : undefined,
    };
  }
}
