import { AbilityScore } from './ability-score.interface';
import { Class } from './class.interface';
import { EquipmentCategory } from './equipment-category.interface';
import { Equipment } from './equipment.interface';
import { Race } from './race.interface';
import { Skill } from './skill.interface';

export interface Proficiency {
  id: string;
  index: string;
  name: string;
  type: Type;
  classes: Class[];
  races: Race[];
  reference: Equipment | EquipmentCategory | Skill | AbilityScore;
}

export enum Type {
  Armor = 'Armor',
  ArtisanSTools = "Artisan's Tools",
  GamingSets = 'Gaming Sets',
  MusicalInstruments = 'Musical Instruments',
  Other = 'Other',
  SavingThrows = 'Saving Throws',
  Skills = 'Skills',
  Vehicles = 'Vehicles',
  Weapons = 'Weapons',
}
