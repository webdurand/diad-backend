export interface Class {
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices: ProficiencyChoice[];
  proficiencies: Proficiency[];
  saving_throws: Proficiency[];
  starting_equipment: StartingEquipment[];
  starting_equipment_options: StartingEquipmentOption[];
  class_levels: string;
  multi_classing: MultiClassing;
  subclasses: Proficiency[];
  url: string;
  spellcasting?: Spellcasting;
  spells?: string;
}

export interface MultiClassing {
  prerequisites?: MultiClassingPrerequisite[];
  proficiencies: Proficiency[];
  proficiency_choices?: ProficiencyChoiceElement[];
  prerequisite_options?: PrerequisiteOptions;
}

export interface PrerequisiteOptions {
  type: string;
  choose: number;
  from: PrerequisiteOptionsFrom;
}

export interface PrerequisiteOptionsFrom {
  option_set_type: OptionSetType;
  options: PurpleOption[];
}

export enum OptionSetType {
  EquipmentCategory = 'equipment_category',
  OptionsArray = 'options_array',
}

export interface PurpleOption {
  option_type: string;
  ability_score: Proficiency;
  minimum_score: number;
}

export interface Proficiency {
  index: string;
  name: string;
  url: string;
}

export interface MultiClassingPrerequisite {
  ability_score: Proficiency;
  minimum_score: number;
}

export interface ProficiencyChoiceElement {
  desc?: string;
  choose: number;
  type: ProficiencyChoiceType;
  from: PurpleFrom;
}

export interface PurpleFrom {
  option_set_type: OptionSetType;
  options: FluffyOption[];
}

export interface FluffyOption {
  option_type: PurpleOptionType;
  item: Proficiency;
}

export enum PurpleOptionType {
  Choice = 'choice',
  Reference = 'reference',
}

export enum ProficiencyChoiceType {
  Proficiencies = 'proficiencies',
}

export interface ProficiencyChoice {
  desc: string;
  choose: number;
  type: ProficiencyChoiceType;
  from: FluffyFrom;
}

export interface FluffyFrom {
  option_set_type: OptionSetType;
  options: TentacledOption[];
}

export interface TentacledOption {
  option_type: PurpleOptionType;
  item?: Proficiency;
  choice?: ProficiencyChoiceElement;
}

export interface Spellcasting {
  level: number;
  spellcasting_ability: Proficiency;
  info: Info[];
}

export interface Info {
  name: string;
  desc: string[];
}

export interface StartingEquipment {
  equipment: Proficiency;
  quantity: number;
}

export interface StartingEquipmentOption {
  desc: string;
  choose: number;
  type: StartingEquipmentOptionType;
  from: StartingEquipmentOptionFrom;
}

export interface StartingEquipmentOptionFrom {
  option_set_type: OptionSetType;
  options?: StickyOption[];
  equipment_category?: Proficiency;
}

export interface StickyOption {
  option_type: ItemOptionType;
  count?: number;
  of?: Proficiency;
  choice?: ItemChoice;
  prerequisites?: OptionPrerequisite[];
  items?: Item[];
}

export interface ItemChoice {
  desc: string;
  choose: number;
  type: StartingEquipmentOptionType;
  from: TentacledFrom;
}

export interface TentacledFrom {
  option_set_type: OptionSetType;
  equipment_category: Proficiency;
}

export enum StartingEquipmentOptionType {
  Equipment = 'equipment',
}

export interface Item {
  option_type: ItemOptionType;
  count?: number;
  of?: Proficiency;
  choice?: ItemChoice;
}

export enum ItemOptionType {
  Choice = 'choice',
  CountedReference = 'counted_reference',
  Multiple = 'multiple',
}

export interface OptionPrerequisite {
  type: string;
  proficiency: Proficiency;
}
