import type {
  TileEffectDirection,
  TileEffectOriginCell,
} from "./tile-effect-catalog";

export interface GridPoint {
  x: number;
  y: number;
}

const DIRECTIONS: Record<TileEffectDirection, GridPoint> = {
  N: { x: 0, y: -1 },
  NE: { x: 1, y: -1 },
  E: { x: 1, y: 0 },
  SE: { x: 1, y: 1 },
  S: { x: 0, y: 1 },
  SW: { x: -1, y: 1 },
  W: { x: -1, y: 0 },
  NW: { x: -1, y: -1 },
};

function segmentEnd(
  origin: TileEffectOriginCell,
  lengthCells: number,
): GridPoint {
  if (origin.end) return origin.end;
  const direction = DIRECTIONS[origin.direction ?? "E"];
  const steps = Math.max(0, Math.floor(lengthCells) - 1);
  return {
    x: origin.x + direction.x * steps,
    y: origin.y + direction.y * steps,
  };
}

export function cellsOnWallSegment(
  origin: TileEffectOriginCell,
  lengthCells: number,
): GridPoint[] {
  const end = segmentEnd(origin, lengthCells);
  const dx = end.x - origin.x;
  const dy = end.y - origin.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const cells: GridPoint[] = [];
  const seen = new Set<string>();
  for (let index = 0; index <= steps; index += 1) {
    const cell = {
      x: Math.round(origin.x + (dx * index) / steps),
      y: Math.round(origin.y + (dy * index) / steps),
    };
    const key = `${cell.x},${cell.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

export function pathCrossesWall(
  cellsTraversed: GridPoint[],
  origin: TileEffectOriginCell,
  lengthCells: number,
): boolean {
  const wall = new Set(
    cellsOnWallSegment(origin, lengthCells).map(
      (cell) => `${cell.x},${cell.y}`,
    ),
  );
  return cellsTraversed.some((cell) => wall.has(`${cell.x},${cell.y}`));
}

export function isCellWithinWallHotZone(
  point: GridPoint,
  origin: TileEffectOriginCell,
  lengthCells: number,
  rangeCells: number,
): boolean {
  const wallCells = cellsOnWallSegment(origin, lengthCells);
  const distanceToWall = wallCells.reduce(
    (nearest, cell) =>
      Math.min(
        nearest,
        Math.max(Math.abs(point.x - cell.x), Math.abs(point.y - cell.y)),
      ),
    Number.POSITIVE_INFINITY,
  );
  if (distanceToWall > rangeCells) return false;

  const isOnWall = wallCells.some(
    (cell) => cell.x === point.x && cell.y === point.y,
  );
  if (isOnWall) return true;
  if (!origin.hotSide) return true;

  const end = segmentEnd(origin, lengthCells);
  const cross =
    (end.x - origin.x) * (point.y - origin.y) -
    (end.y - origin.y) * (point.x - origin.x);
  return origin.hotSide === "left" ? cross <= 0 : cross >= 0;
}
