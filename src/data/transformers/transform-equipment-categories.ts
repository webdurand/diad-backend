import * as fs from "fs";
import * as path from "path";
import { ITEM_TYPE_MAP } from "./code-maps";

export interface TransformedEquipmentCategory {
  slug: string;
  name: string;
  source_code: string;
}


const TYPE_NAME_MAP: Record<string, string> = {
  M: "Melee Weapon",
  R: "Ranged Weapon",
  LA: "Light Armor",
  MA: "Medium Armor",
  HA: "Heavy Armor",
  S: "Shield",
  A: "Ammunition",
  G: "Adventuring Gear",
  AT: "Artisan's Tools",
  T: "Tool",
  INS: "Instrument",
  GS: "Gaming Set",
  SCF: "Spellcasting Focus",
  P: "Potion",
  SC: "Scroll",
  RD: "Rod",
  RG: "Ring",
  WD: "Wand",
  FD: "Food and Drink",
  MNT: "Mount",
  TAH: "Tack and Harness",
  TG: "Trade Good",
  $: "Treasure",
  $A: "Art Object",
  $C: "Coinage",
  $G: "Gemstone",
  VEH: "Vehicle (Land)",
  SHP: "Vehicle (Water)",
  AIR: "Vehicle (Air)",
  SPC: "Vehicle (Space)",
  EXP: "Explosive",
  AF: "Ammunition (Firearm)",
  OTH: "Other",
  GV: "Generic Variant",
  TB: "Trade Bar",
};

export function transformEquipmentCategories(): TransformedEquipmentCategory[] {
  const filePath = path.resolve(
    process.cwd(),
    "../5etools-src/data/items-base.json",
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));


  const itemTypes: { abbreviation: string; name: string; source: string }[] =
    data.itemType ?? [];

  const seen = new Map<string, TransformedEquipmentCategory>();

  for (const t of itemTypes) {
    const abbr = t.abbreviation;
    const slug = ITEM_TYPE_MAP[abbr] ?? abbr.toLowerCase();


    if (!seen.has(slug) || t.source === "XPHB") {
      seen.set(slug, {
        slug,
        name: t.name || TYPE_NAME_MAP[abbr] || abbr,
        source_code: t.source,
      });
    }
  }


  for (const [code, slug] of Object.entries(ITEM_TYPE_MAP)) {
    if (!seen.has(slug)) {
      seen.set(slug, {
        slug,
        name: TYPE_NAME_MAP[code] || slug,
        source_code: "XPHB",
      });
    }
  }

  return Array.from(seen.values());
}
