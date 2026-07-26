import {
  BEACON_OF_HOPE_DURATION_ROUNDS,
  beaconHealingAmount,
  hasBeaconOfHope,
  hasBeaconWisdomSaveAdvantage,
} from "./beacon-of-hope";

function participantWithBeacon() {
  return {
    effectInstances: [
      {
        kind: "beacon_of_hope",
        requiresConcentration: true,
      },
    ],
  } as never;
}

describe("Beacon of Hope rules", () => {
  it("lasts up to one minute", () => {
    expect(BEACON_OF_HOPE_DURATION_ROUNDS).toBe(10);
  });

  it("grants advantage only to Wisdom saves while the effect is active", () => {
    const participant = participantWithBeacon();
    expect(hasBeaconOfHope(participant)).toBe(true);
    expect(hasBeaconWisdomSaveAdvantage(participant, "wis")).toBe(true);
    expect(hasBeaconWisdomSaveAdvantage(participant, "Wisdom")).toBe(true);
    expect(hasBeaconWisdomSaveAdvantage(participant, "con")).toBe(false);
  });

  it("uses the maximum available healing without reducing a fixed heal", () => {
    const participant = participantWithBeacon();
    expect(beaconHealingAmount(participant, 7, 12)).toEqual({
      amount: 12,
      maximized: true,
    });
    expect(beaconHealingAmount(participant, 10, 10)).toEqual({
      amount: 10,
      maximized: false,
    });
    expect(beaconHealingAmount({ effectInstances: [] } as never, 7, 12)).toEqual(
      {
        amount: 7,
        maximized: false,
      },
    );
  });
});
