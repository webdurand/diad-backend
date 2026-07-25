import type { ConditionInstance } from "../interfaces/combat.interfaces";

export function isWebRestraint(
  instance: Pick<ConditionInstance, "slug" | "source" | "sourceSpell">,
): boolean {
  if (instance.slug !== "restrained") return false;
  const spell = (instance.sourceSpell ?? "")
    .toLowerCase()
    .replace(/-(phb|xphb|srd52)$/, "");
  if (spell === "web") return true;
  return (instance.source ?? "").toLowerCase().includes("web");
}
