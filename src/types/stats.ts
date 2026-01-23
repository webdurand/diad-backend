export enum StatNameEnum {
  STRENGTH = 'Força',
  DEXTERITY = 'Destreza',
  CONSTITUTION = 'Constituição',
  INTELLIGENCE = 'Inteligência',
  WISDOM = 'Sabedoria',
  CHARISMA = 'Carisma',
}

export type StatType = `${StatNameEnum}`;

export interface HabilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}
