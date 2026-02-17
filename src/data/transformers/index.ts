export { stripTags } from './tag-stripper';
export { parseEntries, parseEntriesAsText } from './entries-parser';
export { generateSlug } from './slug-generator';
export {
  SPELL_SCHOOL_MAP,
  SIZE_MAP,
  ITEM_TYPE_MAP,
  FEAT_CATEGORY_MAP,
  DAMAGE_TYPE_MAP,
  WEAPON_PROPERTY_MAP,
  ABILITY_MAP,
  ATTACK_TYPE_MAP,
  OPT_FEATURE_TYPE_MAP,
  ALIGNMENT_MAP,
} from './code-maps';

export { transformConditions } from './transform-conditions';
export type { TransformedCondition } from './transform-conditions';
export { transformLanguages } from './transform-languages';
export type { TransformedLanguage } from './transform-languages';
export { transformSkills } from './transform-skills';
export type { TransformedSkill } from './transform-skills';
export { transformEquipmentCategories } from './transform-equipment-categories';
export type { TransformedEquipmentCategory } from './transform-equipment-categories';
export {
  transformWeaponProperties,
  transformWeaponMasteryProperties,
} from './transform-weapon-properties';
export type {
  TransformedWeaponProperty,
  TransformedWeaponMasteryProperty,
} from './transform-weapon-properties';

export {
  transformRaces,
  transformSubraces,
  extractTraitEntries,
} from './transform-races';
export type {
  TransformedRace,
  TransformedSubrace,
  RaceTraitEntry,
} from './transform-races';
export {
  extractTraitsFromRace,
  extractTraitsFromSubrace,
} from './transform-traits';
export type { TransformedTrait } from './transform-traits';

export { transformClasses } from './transform-classes';
export type { TransformedClass } from './transform-classes';
export { transformSubclasses as transformSubclasses5e } from './transform-subclasses';
export type { TransformedSubclass } from './transform-subclasses';
export { transformFeatures } from './transform-features';
export type { TransformedFeature } from './transform-features';
export { transformLevels } from './transform-levels';
export type { TransformedLevel } from './transform-levels';
export { transformSpells, loadSpellClassMappings } from './transform-spells';
export type { TransformedSpell, SpellClassMapping } from './transform-spells';
export { transformFeats } from './transform-feats';
export type { TransformedFeat } from './transform-feats';
export { transformBackgrounds } from './transform-backgrounds';
export type { TransformedBackground, AbilityScoreConfig } from './transform-backgrounds';
export { transformEquipment } from './transform-equipment';
export type { TransformedEquipment } from './transform-equipment';
export { transformMagicItems } from './transform-magic-items';
export type { TransformedMagicItem } from './transform-magic-items';
