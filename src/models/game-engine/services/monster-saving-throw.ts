import { getAbilityModifier } from "src/shared/srd-utils";

const ABILITY_FIELDS: Record<string, string> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

export function getMonsterSavingThrowBonus(
  monster: Record<string, unknown>,
  abilityInput: string,
): number {
  const ability = abilityInput.toLowerCase().slice(0, 3);
  const field = ABILITY_FIELDS[ability] ?? ability;
  const direct = monster[`${field}_save`];
  if (typeof direct === "number") return direct;

  const abilityModifier = getAbilityModifier(Number(monster[field] ?? 10));
  const proficiencies = Array.isArray(monster.proficiencies)
    ? monster.proficiencies
    : [];
  const proficiency = proficiencies.find(
    (entry: {
      type?: string;
      name?: string;
      proficiency?: { index?: string; name?: string };
    }) => {
      const index = entry.proficiency?.index?.toLowerCase() ?? "";
      const name = (
        entry.name ??
        entry.proficiency?.name ??
        ""
      ).toLowerCase();
      return (
        index === `saving-throw-${ability}` ||
        name.includes(`saving throw: ${ability}`) ||
        (entry.type === "saving-throw" && name.includes(ability))
      );
    },
  ) as
    | {
        value?: number;
      }
    | undefined;

  if (typeof proficiency?.value === "number") return proficiency.value;
  if (proficiency) {
    return abilityModifier + Number(monster.proficiency_bonus ?? 0);
  }
  return abilityModifier;
}
