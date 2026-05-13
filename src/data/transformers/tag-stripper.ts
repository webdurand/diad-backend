import { ABILITY_MAP, ATTACK_TYPE_MAP } from "./code-maps";

const ABILITY_SAVE_LABEL: Record<string, string> = {
  str: "Strength Saving Throw:",
  dex: "Dexterity Saving Throw:",
  con: "Constitution Saving Throw:",
  int: "Intelligence Saving Throw:",
  wis: "Wisdom Saving Throw:",
  cha: "Charisma Saving Throw:",
};

function extractDisplay(inner: string): string {
  const parts = inner.split("|");
  return parts[0].trim();
}

function handleTag(tag: string, inner: string): string {
  switch (tag) {

    case "b":
    case "bold":
      return `**${extractDisplay(inner)}**`;
    case "i":
    case "italic":
      return `*${extractDisplay(inner)}*`;
    case "s":
    case "strike":
      return `~~${extractDisplay(inner)}~~`;
    case "u":
      return extractDisplay(inner);


    case "damage":
    case "dice":
      return extractDisplay(inner);
    case "dc":
      return `DC ${extractDisplay(inner)}`;
    case "hit":
      return extractDisplay(inner);
    case "d20":
      return extractDisplay(inner);
    case "scaledice":
    case "scaledamage":
      return extractDisplay(inner);
    case "chance":
      return `${extractDisplay(inner)}%`;
    case "recharge": {
      const val = inner.trim();
      return val === "6" ? "(Recharge 6)" : `(Recharge ${val}-6)`;
    }


    case "h":
      return "Hit: ";
    case "m":
      return "Miss: ";


    case "atk":
      return ATTACK_TYPE_MAP[inner.trim()] ?? inner;


    case "spell":
    case "item":
    case "creature":
    case "condition":
    case "disease":
    case "action":
    case "skill":
    case "feat":
    case "race":
    case "class":
    case "background":
    case "sense":
    case "optfeature":
    case "variantrule":
    case "language":
    case "vehicle":
    case "object":
    case "trap":
    case "hazard":
    case "reward":
    case "deity":
    case "psionic":
    case "table":
    case "deck":
    case "card":
    case "charoption":
    case "recipe":
    case "cult":
    case "boon":
    case "itemMastery":
      return extractDisplay(inner);


    case "classFeature":
    case "subclassFeature":
      return extractDisplay(inner);


    case "filter":
    case "book":
    case "adventure":
    case "note":
    case "footnote":
    case "5etools":
    case "quickref":
      return extractDisplay(inner);


    case "sup":
    case "sub":
    case "code":
      return extractDisplay(inner);
    case "color":
    case "highlight":
      return extractDisplay(inner);


    case "actSave": {
      const ability = inner.trim().toLowerCase();
      return (
        ABILITY_SAVE_LABEL[ability] ??
        `${capitalize(ABILITY_MAP[ability] ?? ability)} Saving Throw:`
      );
    }
    case "actSaveFail":
      return `Failure: ${extractDisplay(inner)}`;
    case "actSaveSuccess":
      return "Success:";
    case "actTrigger":
      return "Trigger:";
    case "actResponse":
      return "Response:";
    case "dcYourSpellSave":
      return "your spell save DC";
    case "hitYourSpellAttack":
      return "your spell attack modifier";

    default:
      return extractDisplay(inner);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TAG_REGEX = /\{@(\w+)\s*([^{}]*?)}/g;

export function stripTags(text: string): string {
  if (!text || typeof text !== "string") return text ?? "";

  let result = text;
  let previous = "";


  while (result !== previous) {
    previous = result;
    result = result.replace(TAG_REGEX, (_match, tag: string, inner: string) => {
      return handleTag(tag, inner);
    });
  }

  return result;
}
