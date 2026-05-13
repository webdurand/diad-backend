

export type PCPersonaAlignment =
  | "lawful-good"
  | "neutral-good"
  | "chaotic-good"
  | "lawful-neutral"
  | "true-neutral"
  | "chaotic-neutral"
  | "lawful-evil"
  | "neutral-evil"
  | "chaotic-evil"
  | "unaligned";

export type PCPersonaPersonaField =
  | "trait"
  | "ideal"
  | "bond"
  | "flaw"
  | "backstory"
  | "alignment"
  | "race";

export interface PCPersonaPersonality {
  trait?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;

  backstory?: string;
  [customKey: string]: string | undefined;
}

export interface PCPersonaEquipmentItem {
  slug: string;
  name: string;
  kind: "weapon" | "armor" | "shield" | "magic-item" | "focus" | "other";
  attuned: boolean;
}

export interface PCPersonaVoiceHints {
  preferredPronouns?: string;
  speechRegister?: "formal" | "informal" | "vulgar" | "arcaico" | "técnico";
}

export interface PCPersona {
  characterId: string;
  name: string;
  race: string;
  subrace: string | null;
  class: string;
  subclass: string | null;
  level: number;
  background: string;
  alignment: PCPersonaAlignment;
  personality: PCPersonaPersonality;
  currentHpPercent: number;
  conditionsActive: string[];
  keyEquipmentSummary: PCPersonaEquipmentItem[];
  voiceHints?: PCPersonaVoiceHints;
}


export const PERSONA_BACKSTORY_CHAR_CAP = 2000;


export const PERSONA_KEY_EQUIPMENT_CAP = 5;
