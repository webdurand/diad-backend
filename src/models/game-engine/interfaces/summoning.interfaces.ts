/**
 * Spec 012 \u2014 Summoning pipeline.
 *
 * Caster invoca entidades no encounter (Summon Beast, Conjure Animals,
 * Spiritual Weapon, Find Familiar, Animate Dead, etc). Cada entidade invocada
 * \u00e9 um EncounterParticipantEntity novo com `linked_caster_participant_id` FK.
 *
 * Cleanup em cascata:
 * - Caster morre \u2192 summons deste caster despawnam
 * - Caster perde concentra\u00e7\u00e3o \u2192 summons com concentrationLinked=true somem
 * - Duration expira \u2192 summon despawna
 * - Dismiss manual via endpoint
 */

export type SummonSource =
  | 'summon-beast-spell'
  | 'summon-fey-spell'
  | 'summon-elemental-spell'
  | 'summon-undead-spell'
  | 'summon-aberration-spell'
  | 'summon-celestial-spell'
  | 'summon-construct-spell'
  | 'summon-dragon-spell'
  | 'conjure-animals-spell'
  | 'conjure-woodland-beings-spell'
  | 'conjure-minor-elementals-spell'
  | 'find-familiar-spell'
  | 'find-steed-spell'
  | 'spiritual-weapon-spell'
  | 'flaming-sphere-spell'
  | 'animate-dead-spell'
  | 'beast-master-companion'
  | 'echo-knight-echo';

export type SummonControlMode =
  /** Summon age no turno do caster (Summon Beast, Spiritual Weapon). */
  | 'shared-turn'
  /** Summon tem initiative pr\u00f3pria (Find Familiar, Conjure Animals RAW). */
  | 'own-initiative'
  /** Controlado pela IA (DM/NPC). */
  | 'ai-controlled';

export interface SummonSpawnDto {
  /** Participant id do caster. */
  casterParticipantId: string;
  /** Slug do monster a instanciar. */
  monsterSlug: string;
  /** Posi\u00e7\u00e3o {x, y} no grid. */
  position?: { x: number; y: number };
  /** Display name customizado ("Celestial Panther"). Default: monster.name. */
  displayName?: string;
  /** Fa\u00e7\u00e3o \u2014 default 'ally' (summons do caster). */
  faction?: 'ally' | 'enemy' | 'neutral';
  controlMode?: SummonControlMode;
  /** Dura\u00e7\u00e3o em rounds (null = indefinido). */
  durationRoundsTotal?: number | null;
  /** Se true, morre quando caster perde concentra\u00e7\u00e3o (Summon Beast, Spiritual Weapon). */
  concentrationLinked?: boolean;
  /** Source \u2014 pra tracking + logs. */
  source: SummonSource;
}
