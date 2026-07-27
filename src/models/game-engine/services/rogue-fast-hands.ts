import type { ClassBlock } from "src/models/characters/services/character-sheet.service";

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/-(phb|xphb|srd52)$/, "");
}

export function hasFastHandsFeature(
  classes: Pick<ClassBlock, "slug" | "level" | "subclass">[],
): boolean {
  return classes.some((characterClass) => {
    if (normalizeSlug(characterClass.slug) !== "rogue") return false;
    if (characterClass.level < 3) return false;
    const subclassSlug = normalizeSlug(characterClass.subclass?.slug ?? "");
    return (
      subclassSlug === "thief" ||
      subclassSlug === "rogue-thief" ||
      subclassSlug.endsWith("-thief")
    );
  });
}
