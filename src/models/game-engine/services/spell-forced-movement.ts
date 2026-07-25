export interface GridPoint {
  x: number;
  y: number;
}

export function getForcedPushDestination(input: {
  caster: GridPoint;
  target: GridPoint;
  distanceCells: number;
  bounds: { cols: number; rows: number };
  occupied: ReadonlySet<string>;
}): GridPoint {
  const dx = Math.sign(input.target.x - input.caster.x);
  const dy = Math.sign(input.target.y - input.caster.y);
  if (dx === 0 && dy === 0) return input.target;

  let destination = input.target;
  for (let step = 1; step <= input.distanceCells; step += 1) {
    const candidate = {
      x: input.target.x + dx * step,
      y: input.target.y + dy * step,
    };
    if (
      candidate.x < 0 ||
      candidate.x >= input.bounds.cols ||
      candidate.y < 0 ||
      candidate.y >= input.bounds.rows ||
      input.occupied.has(`${candidate.x},${candidate.y}`)
    ) {
      break;
    }
    destination = candidate;
  }
  return destination;
}
