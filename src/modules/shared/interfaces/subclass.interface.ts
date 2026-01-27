import { APIReference } from './api-reference.interface';

export interface Subclass extends APIReference {
  class: Class;
  subclass_flavor: string;
  desc: string[];
  subclass_levels: string;
  spells?: Spell[];
}

export interface Class extends APIReference {
  type?: Type;
}

export enum Type {
  Feature = 'feature',
  Level = 'level',
}

export interface Spell {
  prerequisites: Class[];
  spell: Class;
}
