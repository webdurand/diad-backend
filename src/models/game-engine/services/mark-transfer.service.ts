import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EffectInstanceService } from "./effect-instance.service";
import { PermissionResolver } from "./permission-resolver.service";
import { chebyshevDistanceFt } from "./combat-range";
import type { GameEventData } from "../interfaces/result.type";
import type { EffectInstance } from "../interfaces/combat.interfaces";

export interface TransferMarkDto {
  encounterId: string;
  casterParticipantId: string;
  newTargetParticipantId: string;
  sourceSpellSlug: "hunters-mark" | "hex";
  ownerUserId: string;
}

export interface TransferMarkResult {
  ok: boolean;
  code?: string;
  message?: string;
  events?: GameEventData[];
  transferredEffectId?: string;
}

@Injectable()
export class MarkTransferService {
  private readonly logger = new Logger(MarkTransferService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(EncounterEntity)
    private readonly encounters: Repository<EncounterEntity>,
    private readonly effects: EffectInstanceService,
    private readonly permissionResolver: PermissionResolver,
  ) {}

  async transferMark(dto: TransferMarkDto): Promise<TransferMarkResult> {
    if (
      dto.sourceSpellSlug !== "hunters-mark" &&
      dto.sourceSpellSlug !== "hex"
    ) {
      return {
        ok: false,
        code: "INVALID_MARK_SOURCE",
        message: "Apenas Hunter's Mark ou Hex podem ser transferidos.",
      };
    }

    await this.permissionResolver.resolveMutationOwner(
      dto.casterParticipantId,
      dto.ownerUserId,
      dto.encounterId,
    );

    const encounter = await this.encounters.findOne({
      where: { id: dto.encounterId },
    });
    if (!encounter || encounter.status !== "active") {
      return {
        ok: false,
        code: "ENCOUNTER_NOT_ACTIVE",
        message: "O encontro não está ativo.",
      };
    }
    if (
      encounter.turnOrder[encounter.currentTurnIndex] !==
      dto.casterParticipantId
    ) {
      return {
        ok: false,
        code: "NOT_CASTER_TURN",
        message: "A marca só pode ser transferida no turno do conjurador.",
      };
    }

    const caster = await this.participants.findOne({
      where: { id: dto.casterParticipantId },
    });
    if (!caster) {
      throw new NotFoundException(
        `caster ${dto.casterParticipantId} not found`,
      );
    }
    if (caster.encounterId !== dto.encounterId) {
      throw new BadRequestException(
        "CASTER_NOT_IN_ENCOUNTER: caster não está no encontro informado",
      );
    }

    const expectedKind =
      dto.sourceSpellSlug === "hunters-mark" ? "hunter_mark" : "hex_mark";

    const normalizedConcentration = caster.concentratingOn
      ?.trim()
      .toLowerCase()
      .replace(/-(phb|xphb|srd52)$/, "");
    if (
      !caster.isConcentrating ||
      normalizedConcentration !== dto.sourceSpellSlug
    ) {
      return {
        ok: false,
        code: "MARK_CONCENTRATION_ENDED",
        message: "A concentração nessa marca já terminou.",
      };
    }

    const encounterParticipants = await this.participants.find({
      where: { encounterId: dto.encounterId },
    });

    let orphanEffect: EffectInstance | undefined;
    let previousTarget: EncounterParticipantEntity | undefined;
    for (const p of encounterParticipants) {
      const hit = (p.effectInstances ?? []).find(
        (e) =>
          e.kind === expectedKind &&
          e.sourceCasterParticipantId === caster.id &&
          e.sourceSpellSlug === dto.sourceSpellSlug,
      );
      if (hit) {
        orphanEffect = hit;
        previousTarget = p;
        break;
      }
    }

    if (!orphanEffect || !previousTarget) {
      return {
        ok: false,
        code: "NO_TRANSFERABLE_MARK",
        message: `Nenhuma ${dto.sourceSpellSlug} ativa deste caster para transferir.`,
      };
    }

    if (caster.bonusActionUsed) {
      return {
        ok: false,
        code: "BONUS_ACTION_UNAVAILABLE",
        message: "Bonus action já foi usada neste turno.",
      };
    }

    if (
      !previousTarget.isDefeated &&
      previousTarget.dyingState !== "dead" &&
      (previousTarget.currentHp ?? 1) > 0
    ) {
      return {
        ok: false,
        code: "PREVIOUS_TARGET_STILL_ACTIVE",
        message:
          "A marca só pode ser transferida depois que o alvo anterior cair a 0 PV.",
      };
    }

    const currentTurnKey = `${encounter.currentRound}:${encounter.currentTurnIndex}`;
    const transferReadyTurnKey =
      typeof orphanEffect.payload?.transferReadyTurnKey === "string"
        ? orphanEffect.payload.transferReadyTurnKey
        : null;
    if (transferReadyTurnKey === currentTurnKey) {
      return {
        ok: false,
        code: "TRANSFER_NOT_YET_AVAILABLE",
        message:
          "Hunter's Mark só pode ser transferida em um turno posterior do conjurador.",
      };
    }

    if (dto.newTargetParticipantId === previousTarget.id) {
      return {
        ok: false,
        code: "SAME_TARGET",
        message: "Novo alvo deve ser diferente do alvo anterior.",
      };
    }

    const newTarget = encounterParticipants.find(
      (p) => p.id === dto.newTargetParticipantId,
    );
    if (!newTarget) {
      return {
        ok: false,
        code: "TARGET_NOT_FOUND",
        message: `Participant ${dto.newTargetParticipantId} não existe no encontro.`,
      };
    }
    if (newTarget.isDefeated || newTarget.dyingState === "dead") {
      return {
        ok: false,
        code: "TARGET_DEFEATED",
        message: "Não é possível marcar um alvo já derrotado.",
      };
    }
    if (
      !newTarget.isVisible ||
      (newTarget.conditions ?? []).includes("banished")
    ) {
      return {
        ok: false,
        code: "TARGET_NOT_VISIBLE",
        message: "O novo alvo precisa ser uma criatura visível.",
      };
    }
    if (
      caster.positionX == null ||
      caster.positionY == null ||
      newTarget.positionX == null ||
      newTarget.positionY == null
    ) {
      return {
        ok: false,
        code: "TARGET_POSITION_UNKNOWN",
        message: "Não foi possível medir o alcance até o novo alvo.",
      };
    }
    const distanceFt = chebyshevDistanceFt(
      { x: caster.positionX, y: caster.positionY },
      { x: newTarget.positionX, y: newTarget.positionY },
    );
    if (distanceFt > 90) {
      return {
        ok: false,
        code: "TARGET_OUT_OF_RANGE",
        message: `O novo alvo está a ${distanceFt} pés; o alcance máximo é 90 pés.`,
      };
    }

    const removed = await this.effects.removeEffect(
      previousTarget,
      orphanEffect.id,
      "manual",
    );

    const transferredPayload = { ...(orphanEffect.payload ?? {}) };
    delete transferredPayload.transferReadyTurnKey;
    delete transferredPayload.transferReadyRound;
    delete transferredPayload.transferReadyTurnIndex;
    const applied = await this.effects.addEffect(newTarget, {
      kind: expectedKind,
      sourceSpellSlug: dto.sourceSpellSlug,
      sourceCasterParticipantId: caster.id,
      payload: transferredPayload,
      expiresAt: orphanEffect.expiresAt,
      requiresConcentration: orphanEffect.requiresConcentration,
    });

    const casterAfterEffectMove =
      (await this.participants.findOne({ where: { id: caster.id } })) ?? caster;
    casterAfterEffectMove.bonusActionUsed = true;
    await this.participants.save(casterAfterEffectMove);

    const events: GameEventData[] = [
      ...removed.events,
      ...applied.events,
      {
        event_type: "mark_transferred",
        actor_participant_id: caster.id,
        target_participant_id: newTarget.id,
        data: {
          sourceSpell: dto.sourceSpellSlug,
          fromTargetId: previousTarget.id,
          toTargetId: newTarget.id,
          fromTargetName: previousTarget.displayName,
          toTargetName: newTarget.displayName,
          distanceFt,
          rangeFt: 90,
          previousEffectId: orphanEffect.id,
          newEffectId: applied.effect.id,
          bonusActionConsumed: true,
          spellSlotConsumed: false,
          concentrationPreserved: true,
          concentrationRoundsRemaining:
            casterAfterEffectMove.concentrationRoundsRemaining ?? null,
        },
      },
    ];

    this.logger.log(
      `[mark-transfer] ${dto.sourceSpellSlug} caster=${caster.id} ${previousTarget.id} → ${newTarget.id}`,
    );

    return {
      ok: true,
      events,
      transferredEffectId: applied.effect.id,
    };
  }
}
