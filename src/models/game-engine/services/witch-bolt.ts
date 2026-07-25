import { randomUUID } from "crypto";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { AppliedEffect } from "../interfaces/combat.interfaces";
import { chebyshevDistanceFt } from "./combat-range";

export const WITCH_BOLT_TETHER_TYPE = "witch-bolt-tether";
export const WITCH_BOLT_RANGE_FT = 60;

export interface WitchBoltTether {
  refId: string;
  targetParticipantId: string;
  targetName: string;
  rangeFt: number;
  createdRound: number;
}

export function createWitchBoltTether(
  targetParticipantId: string,
  targetName: string,
  createdRound: number,
): AppliedEffect {
  return {
    kind: "effect-instance",
    refId: randomUUID(),
    targetParticipantId,
    description: `Witch Bolt conectado a ${targetName}.`,
    metadata: {
      type: WITCH_BOLT_TETHER_TYPE,
      targetParticipantId,
      targetName,
      rangeFt: WITCH_BOLT_RANGE_FT,
      createdRound,
    },
  };
}

export function findWitchBoltTether(
  participant: Pick<
    EncounterParticipantEntity,
    "isConcentrating" | "concentratingOn" | "appliedEffects"
  >,
): WitchBoltTether | null {
  const concentratingOn = String(participant.concentratingOn ?? "")
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");
  if (!participant.isConcentrating || concentratingOn !== "witch-bolt") {
    return null;
  }

  const effect = (participant.appliedEffects ?? []).find(
    (candidate) =>
      candidate.kind === "effect-instance" &&
      candidate.metadata?.type === WITCH_BOLT_TETHER_TYPE,
  );
  const targetParticipantId =
    effect?.targetParticipantId ??
    (effect?.metadata?.targetParticipantId as string | undefined);
  if (!effect || !targetParticipantId) return null;

  return {
    refId: effect.refId,
    targetParticipantId,
    targetName:
      (effect.metadata?.targetName as string | undefined) ?? "alvo",
    rangeFt:
      (effect.metadata?.rangeFt as number | undefined) ?? WITCH_BOLT_RANGE_FT,
    createdRound:
      (effect.metadata?.createdRound as number | undefined) ?? -1,
  };
}

export function witchBoltDistanceFt(
  caster: Pick<EncounterParticipantEntity, "positionX" | "positionY">,
  target: Pick<EncounterParticipantEntity, "positionX" | "positionY">,
): number | null {
  if (
    caster.positionX == null ||
    caster.positionY == null ||
    target.positionX == null ||
    target.positionY == null
  ) {
    return null;
  }
  return chebyshevDistanceFt(
    { x: caster.positionX, y: caster.positionY },
    { x: target.positionX, y: target.positionY },
  );
}
