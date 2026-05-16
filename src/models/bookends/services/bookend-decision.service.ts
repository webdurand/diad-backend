import { Injectable } from "@nestjs/common";

export interface ShouldShowPreviouslyInput {
  gapMinutes: number;
  sceneNumber: number;
  crossDay?: boolean;
  phaseChangedSinceLastSession?: boolean;
  previouslySeen?: boolean;
}

@Injectable()
export class BookendDecisionService {
  shouldShowPreviously(input: ShouldShowPreviouslyInput): boolean {
    if (input.sceneNumber === 1) return false;
    if (input.previouslySeen) return false;
    return (
      input.gapMinutes >= 30 ||
      input.crossDay === true ||
      input.phaseChangedSinceLastSession === true
    );
  }
}
