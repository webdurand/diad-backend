import { Class } from './class.interface';

export interface Subclass {
  id: string;
  index: string;
  name: string;
  class: Class;
  subclass_flavor: string;
  desc: string[];
  subclass_levels: string;
  spells?: Spell[];
}

export enum Type {
  Feature = 'feature',
  Level = 'level',
}

export interface Spell {
  prerequisites: Class[];
  spell: Class;
}
