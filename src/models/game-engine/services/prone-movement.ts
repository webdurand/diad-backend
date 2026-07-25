export function standingMovementCost(speedFt: number): number {
  return Math.max(0, Math.floor(speedFt / 2));
}

export function movementCellCostFt(input: {
  difficultTerrain: boolean;
  ignoresDifficultTerrain: boolean;
  prone: boolean;
}): number {
  return (
    5 +
    (input.prone ? 5 : 0) +
    (input.difficultTerrain && !input.ignoresDifficultTerrain ? 5 : 0)
  );
}
