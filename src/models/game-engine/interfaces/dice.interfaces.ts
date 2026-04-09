export interface DiceResult {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  dropped?: number[];
}

export interface AdvantageResult {
  roll1: number;
  roll2: number;
  chosen: number;
  discarded: number;
}

export interface InitiativeResult {
  roll: number;
  modifier: number;
  total: number;
}
