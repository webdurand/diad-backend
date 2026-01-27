export interface Background {
  index: string;
  name: string;
  ability_scores: Feat[];
  feat: Feat;
  proficiencies: Feat[];
  equipment_options: EquipmentOption[] | EquipmentOptionsClass;
  url: string;
  proficiency_choices?: ProficiencyChoice[];
}

export interface Feat {
  index: string;
  name: string;
  url: string;
  note?: string;
}

export interface EquipmentOption {
  option_type: OptionType;
  choice: EquipmentOptionChoice;
}

export interface EquipmentOptionChoice {
  choose: number;
  type: string;
  from: PurpleFrom;
}

export interface PurpleFrom {
  option_set_type: string;
  options: PurpleOption[];
}

export interface PurpleOption {
  option_type: string;
  items?: Item[];
  count?: number;
  unit?: string;
}

export interface Item {
  option_type: OptionType;
  count?: number;
  of?: Feat;
  unit?: string;
  choice?: ItemChoice;
}

export interface ItemChoice {
  choose: number;
  type: string;
  from: FluffyFrom;
}

export interface FluffyFrom {
  option_set_type: string;
  equipment_category: Feat;
}

export enum OptionType {
  Choice = 'choice',
  CountedReference = 'counted_reference',
  Money = 'money',
}

export interface EquipmentOptionsClass {
  choose: number;
  type: string;
  from: EquipmentOptionsFrom;
}

export interface EquipmentOptionsFrom {
  option_set_type: string;
  options: ItemElement[];
}

export interface ItemElement {
  option_type: string;
  items?: ItemElement[];
  count?: number;
  unit?: string;
  of?: Feat;
}

export interface ProficiencyChoice {
  choose: number;
  type: string;
  from: ProficiencyChoiceFrom;
}

export interface ProficiencyChoiceFrom {
  option_set_type: string;
  options: FluffyOption[];
}

export interface FluffyOption {
  option_type: string;
  item: Feat;
}
