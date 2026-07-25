import { getForcedPushDestination } from "./spell-forced-movement";

describe("getForcedPushDestination", () => {
  it("pushes a target two grid cells directly away from the caster", () => {
    expect(
      getForcedPushDestination({
        caster: { x: 8, y: 10 },
        target: { x: 9, y: 10 },
        distanceCells: 2,
        bounds: { cols: 20, rows: 20 },
        occupied: new Set(),
      }),
    ).toEqual({ x: 11, y: 10 });
  });

  it("stops before an occupied cell or the map boundary", () => {
    expect(
      getForcedPushDestination({
        caster: { x: 7, y: 10 },
        target: { x: 8, y: 10 },
        distanceCells: 2,
        bounds: { cols: 10, rows: 20 },
        occupied: new Set(["9,10"]),
      }),
    ).toEqual({ x: 8, y: 10 });
  });

  it("supports diagonal forced movement", () => {
    expect(
      getForcedPushDestination({
        caster: { x: 8, y: 8 },
        target: { x: 9, y: 9 },
        distanceCells: 2,
        bounds: { cols: 20, rows: 20 },
        occupied: new Set(),
      }),
    ).toEqual({ x: 11, y: 11 });
  });
});
