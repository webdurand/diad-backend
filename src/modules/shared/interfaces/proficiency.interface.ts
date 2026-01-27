import { APIReference } from './api-reference.interface';

export interface Proficiency extends APIReference {
  type: Type;
  classes: Reference[];
  races: Reference[];
  reference: Reference;
}

export interface Reference extends APIReference {}

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
