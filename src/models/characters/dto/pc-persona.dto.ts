/**
 * Spec 018 — PC Persona Injection.
 *
 * Espelha specs/018-pc-persona-injection/contracts/pc-persona.json — bloco
 * enxuto enviado ao DM Agent (Director/Narrator) com persona/state do PC.
 * NÃO inclui ficha mecânica detalhada — esse é papel de get_character_sheet.
 */

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
  /**
   * Backstory longa-form. PCPersonaService trunca a 500 tokens (~2000 chars)
   * pra reduzir token bloat no SceneContext; full text segue acessível via
   * tool `recall_pc_backstory_about(character_id, topic)`.
   */
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

/**
 * Cap de tokens — `personality.backstory` truncada antes de injetar no
 * SceneContext. ~500 tokens ≈ 2000 chars (regra de bolso EN+PT-BR).
 */
export const PERSONA_BACKSTORY_CHAR_CAP = 2000;

/** Itens narrativos no summary — RAW: arma equipada + armadura + atunidos. */
export const PERSONA_KEY_EQUIPMENT_CAP = 5;
