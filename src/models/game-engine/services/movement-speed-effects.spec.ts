import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import {
  applyEffectSpeedModifiers,
  reconcileRemainingMovement,
} from "./movement.service";

type Effects = EncounterParticipantEntity["effectInstances"];

const effects = (...entries: Array<{ kind: string; amount: number }>) =>
  entries.map(
    ({ kind, amount }, index) =>
      ({
        id: `effect-${index}`,
        kind,
        payload: { amount },
      }) as NonNullable<Effects>[number],
  );

describe("applyEffectSpeedModifiers", () => {
  it("uses Fly's 60-foot speed when it is faster than walking", () => {
    expect(
      applyEffectSpeedModifiers(30, effects({ kind: "flight_speed", amount: 60 })),
    ).toBe(60);
  });

  it("doubles the active speed for Haste", () => {
    expect(
      applyEffectSpeedModifiers(
        30,
        effects({ kind: "speed_multiplier", amount: 2 }),
      ),
    ).toBe(60);
  });

  it("adds the Large Form speed increase before multiplicative effects", () => {
    expect(
      applyEffectSpeedModifiers(
        35,
        effects(
          { kind: "speed_bonus", amount: 10 },
          { kind: "speed_multiplier", amount: 2 },
        ),
      ),
    ).toBe(90);
  });

  it("combines Fly, Haste, and a speed reduction in rules order", () => {
    expect(
      applyEffectSpeedModifiers(
        30,
        effects(
          { kind: "flight_speed", amount: 60 },
          { kind: "speed_multiplier", amount: 2 },
          { kind: "speed_reduction", amount: 10 },
        ),
      ),
    ).toBe(110);
  });

  it("preserves movement already spent when speed changes", () => {
    expect(reconcileRemainingMovement(20, 30, 60)).toBe(50);
    expect(reconcileRemainingMovement(50, 60, 30)).toBe(20);
  });
});
