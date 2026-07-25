import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import {
  chooseAbjureFoesTurnOption,
  hasAbjureFoesFear,
} from "./abjure-foes";

describe("Abjure Foes — limite de economia de ação", () => {
  function target(): EncounterParticipantEntity {
    return {
      id: "target-1",
      conditionInstances: [
        {
          id: "fear-1",
          slug: "frightened",
          source: "feature:abjure-foes",
          appliedBy: "paladin-1",
        },
      ],
      effectInstances: [],
    } as EncounterParticipantEntity;
  }

  it("permite repetir a mesma opção e bloqueia uma opção diferente no turno", () => {
    const participant = target();

    expect(hasAbjureFoesFear(participant)).toBe(true);
    expect(
      chooseAbjureFoesTurnOption(participant, "movement", "2:1"),
    ).toEqual({ allowed: true });
    expect(
      chooseAbjureFoesTurnOption(participant, "movement", "2:1"),
    ).toEqual({ allowed: true });
    expect(
      chooseAbjureFoesTurnOption(participant, "action", "2:1"),
    ).toEqual({ allowed: false, currentChoice: "movement" });
  });

  it("libera uma nova escolha no turno seguinte", () => {
    const participant = target();

    chooseAbjureFoesTurnOption(participant, "movement", "2:1");

    expect(
      chooseAbjureFoesTurnOption(participant, "bonus", "3:1"),
    ).toEqual({ allowed: true });
    expect(participant.effectInstances).toEqual([
      expect.objectContaining({
        kind: "abjure_foes_turn_choice",
        payload: {
          turnKey: "3:1",
          abjureFoesTurnChoice: "bonus",
        },
      }),
    ]);
  });
});
