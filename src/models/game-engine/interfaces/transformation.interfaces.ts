/**
 * Spec 012 — Transformation pipeline.
 *
 * Representa um participant temporariamente virando outra coisa (Wild Shape,
 * Polymorph, Form of Dread, Draconic Transformation, etc). O state original
 * \u00e9 snapshotado em `original` e o form ativo fica em `form`. Ao reverter,
 * restaura do snapshot.
 *
 * RAW 2024 (Wild Shape):
 * - HP do form \u00e9 separado. Damage cai no form; quando form vai a 0, excesso
 *   vai pro HP original e o participant reverte \u00e0 forma original.
 * - Stats f\u00edsicos (STR/DEX/CON) e AC do form substituem os do PC. Mentais
 *   (INT/WIS/CHA) ficam com o original (RAW explicit).
 * - A\u00e7\u00f5es: o PC usa as a\u00e7\u00f5es do form. Features baseadas em INT/WIS/CHA
 *   (spellcasting, features de subclass que n\u00e3o dependem de forma f\u00edsica)
 *   ficam dispon\u00edveis se allowSpellcasting=true (Moon Druid L20 Beast Spells).
 * - Speed substitu\u00eddo pelo speed do form (incluindo fly/swim).
 */

/** Shape do monster.actions[i] varia muito (SRD JSON). Tipagem frouxa consciente. */
export type MonsterActionLike = Record<string, unknown>;

export type TransformationSource =
  | 'wild-shape'
  | 'polymorph-spell'
  | 'true-polymorph-spell'
  | 'shapechange-spell'
  | 'alter-self-spell'
  | 'form-of-dread'
  | 'draconic-transformation';

export interface TransformationForm {
  /** Slug do monster usado como template (quando formKind='monster'). */
  monsterSlug: string | null;
  /** Nome do form ("Wolf", "Brown Bear", "Dragon"). */
  formName: string;
  /** Nome exibido no token ("Araxis (Wolf)"). */
  displayName: string;
  size: string;
  ac: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  speed: { walk: number; fly?: number; swim?: number; climb?: number; burrow?: number };
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  actions: MonsterActionLike[];
  senses?: Record<string, unknown>;
  challengeRating?: number;
}

export interface TransformationOriginalSnapshot {
  /** HP original preservado (dano no form n\u00e3o afeta este). */
  maxHp: number;
  currentHp: number;
  tempHp: number;
  /** Display name original pra restaurar no revert. */
  displayName: string;
}

export interface TransformationState {
  source: TransformationSource;
  enteredAtRound: number;
  /**
   * Spec 012 Lote B \u2014 Quando a fonte \u00e9 uma spell de concentra\u00e7\u00e3o
   * (polymorph-spell, true-polymorph-spell, shapechange-spell), rastreia o
   * caster para que a quebra de concentra\u00e7\u00e3o dele dispare revertForm
   * automaticamente. Null para fontes que n\u00e3o dependem de caster externo
   * (wild-shape, form-of-dread).
   */
  sourceCasterParticipantId?: string | null;
  /** Null = indefinido (dura at\u00e9 dismiss/HP zero); em rounds. */
  durationRoundsTotal: number | null;
  durationRoundsRemaining: number | null;

  original: TransformationOriginalSnapshot;
  form: TransformationForm;

  /**
   * Abilities do PC original que ficam dispon\u00edveis mesmo transformado:
   * 'speech' (falar se form permite), 'mental-stats' (manter WIS/INT/CHA),
   * 'class-features' (features n\u00e3o-f\u00edsicas), 'spellcasting'.
   */
  retainedAbilities: Array<'speech' | 'mental-stats' | 'class-features' | 'spellcasting'>;

  /** RAW 2024: como tratar equipment empunhado/vestido. */
  equipmentHandling: 'merge' | 'drop' | 'keep';

  /** Condi\u00e7\u00f5es pra reverter. */
  revertTriggers: {
    hpZero: boolean;
    concentrationBroken: boolean;
    durationEnd: boolean;
    playerDismiss: boolean;
  };
}

export type TransformationRevertReason =
  | 'player-dismiss'
  | 'hp-zero'
  | 'duration-end'
  | 'concentration-broken'
  | 'caster-death';
