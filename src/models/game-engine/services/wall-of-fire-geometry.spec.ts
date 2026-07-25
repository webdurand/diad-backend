import {
  cellsOnWallSegment,
  isCellWithinWallHotZone,
  pathCrossesWall,
} from "./wall-of-fire-geometry";

describe("Wall of Fire geometry", () => {
  const eastWall = {
    x: 8,
    y: 10,
    end: { x: 12, y: 10 },
    hotSide: "left" as const,
  };

  it("expands the selected segment without extending it to the catalog maximum", () => {
    expect(cellsOnWallSegment(eastWall, 12)).toEqual([
      { x: 8, y: 10 },
      { x: 9, y: 10 },
      { x: 10, y: 10 },
      { x: 11, y: 10 },
      { x: 12, y: 10 },
    ]);
  });

  it("uses the chosen side and the full 10-foot range", () => {
    expect(isCellWithinWallHotZone({ x: 10, y: 8 }, eastWall, 12, 2)).toBe(
      true,
    );
    expect(isCellWithinWallHotZone({ x: 10, y: 12 }, eastWall, 12, 2)).toBe(
      false,
    );
    expect(isCellWithinWallHotZone({ x: 10, y: 7 }, eastWall, 12, 2)).toBe(
      false,
    );
  });

  it("detects a path that enters a wall cell and ignores a parallel path", () => {
    expect(
      pathCrossesWall(
        [
          { x: 10, y: 9 },
          { x: 10, y: 10 },
          { x: 10, y: 11 },
        ],
        eastWall,
        12,
      ),
    ).toBe(true);
    expect(
      pathCrossesWall(
        [
          { x: 9, y: 9 },
          { x: 10, y: 9 },
          { x: 11, y: 9 },
        ],
        eastWall,
        12,
      ),
    ).toBe(false);
  });
});
