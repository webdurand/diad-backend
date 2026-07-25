import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

export type AbjureFoesTurnChoice = "movement" | "action" | "bonus";

export function hasAbjureFoesFear(
  participant: EncounterParticipantEntity,
): boolean {
  return (participant.conditionInstances ?? []).some(
    (condition) =>
      condition.slug === "frightened" &&
      condition.source === "feature:abjure-foes",
  );
}

export function chooseAbjureFoesTurnOption(
  participant: EncounterParticipantEntity,
  choice: AbjureFoesTurnChoice,
  turnKey: string,
): { allowed: true } | { allowed: false; currentChoice: AbjureFoesTurnChoice } {
  if (!hasAbjureFoesFear(participant)) return { allowed: true };

  const existing = (participant.effectInstances ?? []).find(
    (effect) => effect.kind === "abjure_foes_turn_choice",
  );
  const currentChoice =
    existing?.payload?.turnKey === turnKey
      ? (existing.payload.abjureFoesTurnChoice as
          | AbjureFoesTurnChoice
          | undefined)
      : undefined;
  if (currentChoice && currentChoice !== choice) {
    return { allowed: false, currentChoice };
  }
  if (existing) {
    existing.payload = {
      ...existing.payload,
      turnKey,
      abjureFoesTurnChoice: choice,
    };
  } else {
    participant.effectInstances = [
      ...(participant.effectInstances ?? []),
      {
        id: `abjure-foes-choice:${participant.id}`,
        sourceFeatureSlug: "abjure-foes",
        sourceCasterParticipantId:
          (participant.conditionInstances ?? []).find(
            (condition) =>
              condition.slug === "frightened" &&
              condition.source === "feature:abjure-foes",
          )?.appliedBy ?? participant.id,
        kind: "abjure_foes_turn_choice",
        payload: { turnKey, abjureFoesTurnChoice: choice },
        expiresAt: { kind: "end_of_encounter" },
        requiresConcentration: false,
        appliedAt: new Date().toISOString(),
      },
    ];
  }
  return { allowed: true };
}

export function abjureFoesChoiceError(
  currentChoice: AbjureFoesTurnChoice,
): string {
  const labels: Record<AbjureFoesTurnChoice, string> = {
    movement: "Movimento",
    action: "Ação",
    bonus: "Ação Bônus",
  };
  return `Abjurar Inimigos: esta criatura já escolheu ${labels[currentChoice]} neste turno.`;
}
