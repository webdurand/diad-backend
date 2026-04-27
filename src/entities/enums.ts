export enum FeatTypeEnum {
  General = "general",
  Origin = "origin",
  FightingStyle = "fighting_style",
  EpicBoon = "epic_boon",
  Other = "other",
}

export enum ProficiencyTypeEnum {
  Skill = "skill",
  Armor = "armor",
  Weapon = "weapon",
  Tool = "tool",
  SavingThrow = "saving_throw",
  Other = "other",
}

export enum AttackTypeEnum {
  Melee = "melee",
  Ranged = "ranged",
}

export enum CharacterProficiencySourceEnum {
  Class = "class",
  Race = "race",
  Background = "background",
  Multiclass = "multiclass",
  Feat = "feat",
}

export enum SpellSourceEnum {
  Class = "class",
  Race = "race",
  Feat = "feat",
  Item = "item",
}

export enum SpellStatusEnum {
  Known = "known",
  Prepared = "prepared",
  Spellbook = "spellbook",
}

export enum EquipmentSourceEnum {
  Starting = "starting",
  Bought = "bought",
  Loot = "loot",
}

export enum HpMethodEnum {
  Roll = "roll",
  Fixed = "fixed",
}
