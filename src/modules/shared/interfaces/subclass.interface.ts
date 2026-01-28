import { Class } from './class.interface';
import { Feature } from './feature.interface';
import { Spell } from './spell.interface';

export interface Subclass {
  id: string;
  index: string;
  name: string;
  class: Class;
  subclass_flavor: string;
  desc: string[];
  subclass_levels: string;
  spells?: SubclassSpell[];
}

export enum Type {
  Feature = 'feature',
  Level = 'level',
}

export interface SubclassSpell {
  prerequisites: (Class | Feature)[];
  spell: Spell;
}
