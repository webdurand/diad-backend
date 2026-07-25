import { stripTags } from "src/data/transformers/tag-stripper";

export type MonsterRechargeRange = "4-6" | "5-6" | "6";

export function monsterActionDisplayName(action: Record<string, unknown>): string {
  return stripTags(String(action.name ?? "Ataque")).replace(
    /\(Recharge\s+([456])(?:-6)?\)/gi,
    (_match, minimum: string) =>
      minimum === "6" ? "(Recarga 6)" : `(Recarga ${minimum}–6)`,
  );
}

export function getMonsterRechargeRange(
  action: Record<string, unknown>,
): MonsterRechargeRange | null {
  const explicit = String(action.recharge ?? "").trim();
  if (explicit === "4-6" || explicit === "5-6" || explicit === "6") {
    return explicit;
  }

  const usage = action.usage;
  if (usage && typeof usage === "object") {
    const minValue = Number(
      (usage as Record<string, unknown>).min_value ??
        (usage as Record<string, unknown>).minValue,
    );
    if (minValue === 4) return "4-6";
    if (minValue === 5) return "5-6";
    if (minValue === 6) return "6";
  }

  const text = `${String(action.name ?? "")} ${String(
    action.desc ?? action.description ?? "",
  )}`;
  const tagged = text.match(/\{@recharge\s+([456])}/i);
  const written = text.match(
    /\(Recharge\s*([456])(?:\s*[\u2013\u2014-]\s*6)?\)/i,
  );
  const minimum = Number(tagged?.[1] ?? written?.[1]);
  if (minimum === 4) return "4-6";
  if (minimum === 5) return "5-6";
  if (minimum === 6) return "6";
  return null;
}

export function rechargeMinimum(range: MonsterRechargeRange): number {
  if (range === "4-6") return 4;
  if (range === "5-6") return 5;
  return 6;
}
