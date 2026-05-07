import { DiceResult, AdvantageResult } from "./dice.interfaces";
import type { AreaEffect } from "src/shared/aoe-origin.types";

export interface AttackRollResult {
  roll: number;
  modifier: number;
  total: number;
  targetAc: number;
  hit: boolean;
  critical: boolean;
  criticalMiss: boolean;
  advantage?: AdvantageResult;
  /** Spec 004 — flag booleano que veio do pipeline (inclui conditions + effectInstances). */
  hasAdvantage?: boolean;
  hasDisadvantage?: boolean;
  /** Spec 004 — bônus somados de EffectInstance (Bless +1d4, etc). */
  effectBonuses?: Array<{ source: string; dice?: string; amount?: number }>;
}

export interface DamageRollResult {
  rolls: DiceResult[];
  bonus: number;
  total: number;
  type: string;
  resisted: boolean;
  immune: boolean;
  vulnerable: boolean;
  finalDamage: number;
}

export interface AttackResult {
  attackRoll: AttackRollResult;
  damageRoll?: DamageRollResult;
  targetHpAfter?: number;
  targetDefeated: boolean;
  concentrationBroken?: boolean;
}

export interface SavingThrowResult {
  ability: string;
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  advantage?: AdvantageResult;
  /**
   * Fighter L9 Indomitable (RAW 2024) — se o participant armou Indomitable
   * e o save inicial falhou, backend rerola automaticamente. Campos descrevem
   * o reroll: original d20, novo d20, +fighter level bonus. `roll`/`total`/
   * `success` acima já refletem o RESULTADO FINAL (pós-reroll).
   */
  indomitableReroll?: {
    originalRoll: number;
    newRoll: number;
    fighterLevel: number;
  };
}

export interface ConcentrationCheckResult {
  dc: number;
  roll: number;
  modifier: number;
  total: number;
  maintained: boolean;
  spellName?: string;
}

export interface DeathSaveResult {
  roll: number;
  naturalOne: boolean;
  naturalTwenty: boolean;
  successes: number;
  failures: number;
  /** Final dying state after this roll. */
  dyingState: "none" | "dying" | "stable" | "dead";
  /** Back-compat: `dyingState === 'stable'`. */
  stabilized: boolean;
  /** Back-compat: `dyingState === 'dead'`. */
  dead: boolean;
  /** Non-null only on natural 20 revival. */
  revivedHp: number | null;
}

export interface TurnInfo {
  encounterId: string;
  round: number;
  participantId: string;
  participantName: string;
  participantType: "pc" | "monster" | "npc";
  isDefeated: boolean;
  /** Only meaningful for PCs; monsters are always 'none'. */
  dyingState?: "none" | "dying" | "stable" | "dead";
  /** True when turn was auto-skipped (stable PC); frontend should call /end-turn immediately. */
  autoSkip?: boolean;
}

export interface RoundInfo {
  encounterId: string;
  round: number;
  firstParticipantId: string;
}

export interface AttackModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
  autoCrit: boolean;
}

export interface DefenseModifiers {
  attacksHaveAdvantage: boolean;
  attacksHaveDisadvantage: boolean;
  autoHit: boolean;
  autoCritIfMelee: boolean;
}

export interface SaveModifiers {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  autoFail: boolean;
}

export interface ConditionTurnEffect {
  condition: string;
  effect: string;
  description: string;
}

// AoEShape re-exportado de shared/aoe-origin.types pra compat; preferir import direto de lá.
export type { AoEShape } from "src/shared/aoe-origin.types";

export interface TurnActionBlock {
  id: string;
  name: string;
  timing: string;
  source: string;
  sourceLabel: string;
  description: string;
  /** Discriminator for aggregators — 'multiattack' | 'spell-opener' | undefined (regular). */
  kind?: "multiattack" | "spell-opener" | "attack";
  attackBonus?: number;
  damage?: { dice: string; type: string; bonus?: number };
  range?: string;
  spellLevel?: number;
  requiresConcentration?: boolean;
  /** If set, action is area-of-effect. Inclui originType derivado pra decidir picker no frontend. */
  aoe?: AreaEffect;
  /** Saving throw if the action uses one. */
  save?: {
    ability: string;
    dc: number;
    halfOnSuccess?: boolean;
  };
  /** Multiattack aggregator: ordered list of sub-attacks. */
  sequence?: Array<{ actionName: string; count: number }>;
  /** Multiattack recharge gate (e.g. '5-6' on a breath weapon). null when always available. */
  rechargeRequired?: "5-6" | "6" | null;
  /** Spec 011 Phase 3 — slug canônico (ex: 'arcane-recovery', 'second-wind') sem prefixo `feature-{uuid}-`.
   *  Necessário pro front chamar /class-feature com o featureSlug certo do catálogo. */
  featureSlug?: string;
  /** Spec 012 Fase 0 — weapon slug (só armas). Usado pra lookup Fighting Style / mastery. */
  weaponSlug?: string;
  /** Spec 012 Fase 0 — mastery property (Cleave/Graze/Nick/Push/Sap/Slow/Topple/Vex).
   *  Populado só quando o PC escolheu essa arma em weapon_mastery_choices. */
  masterySlug?: string;
  /** Premissa weapons-in-hand — char é proficient com a arma/escudo. */
  proficient?: boolean;
  /** Premissa weapons-in-hand — slot (main | off | null). Unarmed é null (intrínseco). */
  handSlot?: "main" | "off" | null;
  /** Spec 015 — uses restantes (features com carga contável: BI, Second Wind, Rage, etc.). */
  uses?: number;
  /** Spec 015 — max uses no nível atual (usado pra render "3/5" no card). */
  usesMax?: number;
  /** Spec 015 — quando recarrega: `short` / `long` / `day` / `encounter` / `turn`. */
  usesRecharge?: string;
}

export interface AoEResolveResult {
  affectedParticipantIds: string[];
  results: Array<{
    participantId: string;
    participantName: string;
    save?: SavingThrowResult;
    damageRoll?: DamageRollResult;
    targetHpAfter?: number;
    targetDefeated: boolean;
  }>;
}

export interface TurnActionsResult {
  participantId: string;
  participantName: string;
  participantType: "pc" | "monster" | "npc";
  /** Ataques de arma, multiataques e ações específicas (source !== 'generic'). Spec 005 US13. */
  actions: TurnActionBlock[];
  /** As 8 ações PHB (Dodge/Dash/Disengage/Help/Hide/Ready/Search/Use Object). Spec 005 US13.
   *  Opcional durante rollout — clientes antigos leem do `actions[]` filtrando source==='generic'. */
  genericActions?: TurnActionBlock[];
  bonusActions: TurnActionBlock[];
  reactions: TurnActionBlock[];
  canMove: boolean;
  remainingMovement: number;
  speed: number;
  actionUsed: boolean;
  bonusActionUsed: boolean;
  hasDisengaged: boolean;
  hasDashed: boolean;
}

// ============================================================================
// Spec 003 — ações genéricas, estados de reação e orquestração de turno IA
// ============================================================================

/** Gatilho de Ready (PHB cap. 9). Spec 003 cobre apenas os 2 enums pré-definidos;
 * gatilhos textuais livres ("custom") ficam pra spec futura. */
export type ReadyTrigger =
  | { kind: "enemy_enters_range"; rangeFt: number }
  | { kind: "enemy_attacks_ally"; allyParticipantId: string };

/** Ação armada via Ready; dispara quando o gatilho ocorre, consumindo a reação. */
export interface ReadiedAction {
  trigger: ReadyTrigger;
  actionDescriptor: PlannedActionStep;
  armedAtTurnOfParticipantId: string;
}

/** Efeito ativo de Help — o próximo ataque de `allyParticipantId` contra
 * `targetParticipantId` tem vantagem, até o próximo turno do ajudante. */
export interface HelpingState {
  allyParticipantId: string;
  targetParticipantId: string;
  expiresAtNextTurnOfParticipantId: string;
}

/** Discriminated union — planos emitidos pelo `AiTurnExecutor` antes da execução. */
export type PlannedActionStep =
  | { kind: "move"; to: { x: number; y: number } }
  | { kind: "attack"; actionName: string; targetParticipantIds: string[] }
  | {
      kind: "cast-spell";
      spellSlug: string;
      slotLevel?: number;
      targetParticipantIds?: string[];
      point?: { x: number; y: number };
    }
  | { kind: "dodge"; asBonusAction?: boolean }
  | { kind: "dash"; asBonusAction?: boolean }
  | { kind: "disengage"; asBonusAction?: boolean }
  | { kind: "help"; allyParticipantId: string; targetParticipantId: string }
  | { kind: "hide"; asBonusAction?: boolean }
  | { kind: "ready"; trigger: ReadyTrigger; readiedAction: PlannedActionStep }
  | { kind: "search"; ability: "perception" | "investigation" }
  | {
      kind: "use-object";
      objectRef: { source: "inventory" | "environment"; slug: string };
    }
  | { kind: "end-turn" };

/** Resultado de um step executado, com descritor do evento gerado. */
export interface ActionStep {
  kind: PlannedActionStep["kind"];
  payload: Record<string, unknown>;
  result: {
    ok: boolean;
    summary: string;
    events: Array<{ type: string; [k: string]: unknown }>;
    error?: { code: string; message: string };
  };
  timestamp: string;
}

/** Resposta completa de `POST /ai-turn` após aplicar todos os steps. */
export interface TurnExecutionResult {
  steps: ActionStep[];
  finalState: {
    actionUsed: boolean;
    bonusUsed: boolean;
    movementRemaining: number;
    reactionUsed: boolean;
    hp: { current: number; max: number };
    conditions: string[];
    dyingState: "none" | "dying" | "stable" | "dead";
  };
  llmCostUsd?: number;
  tookMs: number;
  rationale?: string;
}

// ============================================================================
// Spec 004 — Encounter RAW Completeness
// ============================================================================

export type ConditionSlug =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
  | "exhaustion"
  | "hidden";

export type SaveAbility = "str" | "dex" | "con" | "int" | "wis" | "cha";

export type RepeatSaveTiming = "end_of_turn" | "start_of_turn" | "never";

/**
 * Spec 015 Eixo 3 — semântica de origem da condição.
 *
 * Tipos de source:
 *   - `'manual'`             → aplicação pelo DM (default legado).
 *   - `'hp_zero'`            → Unconscious derivada de HP=0 (sai ao HP>0).
 *   - `'spell:<slug>'`       → aplicada por magia (break concentration cessa).
 *   - `'feature:<slug>'`     → aplicada por feature de classe (stunning strike, etc).
 *   - `'ability:<slug>'`     → monstro usou ability não-magia (petrifying gaze, etc).
 *   - `'environment:<slug>'` → efeito ambiental (difficult terrain, trap).
 *
 * Usado pra:
 *   1. `ConditionLifecycleService.revalidateAfterHpChange` — remove `hp_zero`
 *      ao HP > 0 mantendo outros sources (ex: Faerie Fire persiste em heal).
 *   2. `removeConditionsBySource('spell:<slug>')` — cascade de concentration
 *      break cessa condições de UMA magia em todos os targets afetados.
 *   3. Narrative descriptor em `condition_removed` events — render UI.
 */
export type ConditionSource =
  | "manual"
  | "hp_zero"
  | `spell:${string}`
  | `feature:${string}`
  | `ability:${string}`
  | `environment:${string}`;

/**
 * Instância de condição com metadata completa.
 * Substitui `conditions: string[]` ao longo do tempo (coexistência por 1 release).
 */
export interface ConditionInstance {
  /** uuid v4 — identificador estável para remoção precisa. */
  id: string;
  slug: ConditionSlug;
  /** Quem aplicou; null para "ambient" (poison de armadilha sem dono). */
  appliedBy: string | null;
  /** Nome da magia/feature/efeito que originou; null para aplicação manual do DM. */
  sourceSpell: string | null;
  /** True se a fonte é magia de concentração — quebrou = removida em cascata. */
  sourceConcentration: boolean;
  /**
   * Spec 015 Eixo 3 — origem semântica (vê `ConditionSource`). Backfill
   * de legados = `'manual'`. Novas aplicações sempre setam source explícito.
   */
  source: ConditionSource;
  saveAbility: SaveAbility | null;
  saveDc: number | null;
  repeatSaveTiming: RepeatSaveTiming;
  /** Quantos rounds restam antes de remoção automática; null = sem prazo. */
  durationRoundsRemaining: number | null;
  /** Para exhaustion, level cumulativo (1-6 para 2014). */
  level?: number;
  appliedAt: string;
}

export type AppliedEffectKind =
  | "condition"
  | "persistent-area"
  | "effect-instance";

/**
 * Rastreia o que uma magia de concentração aplicou.
 * Persistido no caster; ao quebrar concentração, itera e remove tudo atomicamente.
 */
export interface AppliedEffect {
  kind: AppliedEffectKind;
  /** Quando kind='condition': id do ConditionInstance no participante alvo. */
  /** Quando kind='persistent-area': id do PersistentAreaEffect. */
  /** Quando kind='effect-instance': id do EffectInstance (na própria effectInstances do target). */
  refId: string;
  /** Quando kind='condition'|'effect-instance': id do participante alvo. Senão null. */
  targetParticipantId: string | null;
  /** Snapshot textual para auditoria/log. */
  description: string;
}

// ============================================================================
// Spec 004 (Effect Resolution Engine) — EffectInstance carrier
// ============================================================================

export type EffectInstanceKind =
  | "ac_bonus" // Mage Armor, Shield, Haste
  | "attack_bonus" // Bless (attack portion), Divine Favor
  | "attack_penalty" // Bane (attack portion) — rolled dice subtracts
  | "save_bonus" // Bless (save portion)
  | "save_penalty" // Bane (save portion) — rolled dice subtracts
  | "damage_bonus" // Rage, Divine Favor
  | "damage_resistance" // Rage, Protection from Energy, Fire Shield
  | "grant_advantage_to_attackers" // Guiding Bolt, Reckless Attack target
  | "grant_disadvantage_to_attackers" // Dodge, Sanctuary, Blur, Invisibility
  | "self_advantage" // Rage STR checks, Invisibility (attack)
  | "self_disadvantage"
  | "self_advantage_next_attack" // Steady Aim (one-shot flag); Vex (vs target)
  | "self_disadvantage_next_attack" // Sap mastery (one-shot flag no target)
  | "speed_reduction" // Slow mastery: payload.amount = ft subtraidos
  | "hp_shield" // False Life, Heroism absorption
  | "statblock_swap" // Wild Shape
  | "inspiration_die" // Bardic Inspiration (consumível)
  | "flight_speed" // Fly
  | "speed_multiplier" // Haste (×2 speed)
  | "extra_action" // Haste (1 extra action)
  | "true_sight" // True Seeing
  | "damage_immunity_threshold" // Globe of Invulnerability (immune ≤ L5)
  | "hex_mark" // Hex: target recebe +1d6 necrotic rider do caster
  | "hunter_mark" // Hunter's Mark: target recebe +1d6 rider do caster
  | "foe_slayer_used_this_turn" // Ranger L20 Foe Slayer: 1/turn consumed flag
  | "bardic_inspiration" // Bardic Inspiration armada no target
  | "bane"
  | "bless"
  | "capstone_start_combat_done" // Spec 012 Lote C — marker capstone start-of-combat
  | "eldritch_master_used_this_rest" // Warlock L20 — marker 1/LR
  | "stroke_of_luck_armed_attack" // Rogue L20 — próximo attack miss → hit
  | "stroke_of_luck_armed_check" // Rogue L20 — próximo ability check → d20=20
  | "stroke_of_luck_used_this_rest" // Rogue L20 — marker 1/SR
  | "holy_nimbus_armed" // Paladin L20 Devotion — aura 30ft 1min
  | "spell_mastery_slot_free" // Wizard L18 — marcador de cast grátis
  | "signature_spell_used_this_rest"; // Wizard L20 — marker 1/SR por spell

export type EffectExpirationKind =
  | "rounds"
  | "turns"
  | "concentration"
  | "until_caster_turn"
  | "until_consumed"
  | "end_of_encounter";

export interface EffectInstancePayload {
  amount?: number;
  diceExpression?: string;
  damageTypes?: string[];
  beastSlug?: string;
  absorptionHp?: number;
  triggerEventId?: string;
  scope?: "any" | "melee" | "ranged" | "str-check" | "str-save" | "dex-save";
  /** Vex mastery: attacker-side self_advantage_next_attack só aplica se alvo bater.
   *  Se undefined → advantage em qualquer alvo (Steady Aim). */
  requiredTargetId?: string;
  /** Mastery source descriptor pra events/logs — ex: "weapon-mastery:vex". */
  masterySlug?: string;
  /** Hex / Hunter's Mark: dice a somar em cada weapon hit do caster no target. */
  riderDice?: string;
  /** Hex: tipo de dano do rider (necrotic). HM usa weapon damage type. */
  riderType?: string;
}

/**
 * Instância de efeito mecânico aplicada a um participant.
 * Vive em `encounter_participant.effectInstances[]` JSONB.
 * Separado de AppliedEffect por SRP: AppliedEffect rastreia concentração,
 * EffectInstance carrega a mecânica (bônus, advantage grant, resistance, etc).
 */
export interface EffectInstance {
  id: string;
  sourceSpellSlug?: string;
  sourceFeatureSlug?: string;
  /** Quem aplicou o efeito (caster / user da feature). */
  sourceCasterParticipantId: string;
  kind: EffectInstanceKind;
  payload: EffectInstancePayload;
  expiresAt: {
    kind: EffectExpirationKind;
    value?: number;
  };
  /** true = removido em cascata quando ConcentrationService.break(source) dispara. */
  requiresConcentration: boolean;
  appliedAt: string;
}

export interface LairAction {
  name: string;
  description: string;
  rangeFt?: number;
  saveAbility?: SaveAbility;
  saveDc?: number;
  damageDice?: string;
  damageType?: string;
  appliesCondition?: ConditionSlug;
  /** Se a ação cria área persistente, descritor pra criação. */
  createsPersistentArea?: {
    shapeKind: "sphere" | "cube" | "cylinder" | "line" | "cone";
    radiusCells: number;
    damageDice: string;
    damageType: string;
    durationRoundsRemaining: number;
    halfOnSave: boolean;
  };
  /** Algumas lair actions têm half-on-save próprio mesmo sem persistent area. */
  halfOnSave?: boolean;
}

export interface LegendaryActionStatblock {
  name: string;
  description: string;
  cost: 1 | 2 | 3;
  resolverHint: "attack" | "save" | "movement" | "special";
}

export type RechargeState = Record<string, "available" | "used">;

export interface DamageInstance {
  type: string;
  amount: number;
}

export interface ApplyDamageOptions {
  ignoreResistance?: boolean;
  ignoreImmunity?: boolean;
}

export interface DamageProfile {
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
}

export interface ResistanceApplyResult {
  finalDamage: number;
  perPartFinal: Array<
    DamageInstance & {
      afterModifier: number;
      modifier: "resist" | "immune" | "vuln" | "none";
    }
  >;
}
