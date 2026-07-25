import {
  movementCellCostFt,
  standingMovementCost,
} from "./prone-movement";

describe("prone movement", () => {
  it("spends half the creature's speed to stand", () => {
    expect(standingMovementCost(40)).toBe(20);
  });

  it("stacks crawling and difficult terrain costs", () => {
    expect(
      movementCellCostFt({
        difficultTerrain: true,
        ignoresDifficultTerrain: false,
        prone: true,
      }),
    ).toBe(15);
  });

  it("still charges crawling when difficult terrain is ignored", () => {
    expect(
      movementCellCostFt({
        difficultTerrain: true,
        ignoresDifficultTerrain: true,
        prone: true,
      }),
    ).toBe(10);
  });
});
