export function getSecondWindMaxUses(
  fighterLevel: number,
  is2024Rules = true,
): number {
  if (!is2024Rules) return 1;
  if (fighterLevel >= 10) return 4;
  if (fighterLevel >= 4) return 3;
  return 2;
}
