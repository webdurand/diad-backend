import { APIReference } from './api-reference.interface';

export interface Level {
  id?: number;
  index: string;
  level: number;
  url: string;
  ability_score_bonuses?: number;
  prof_bonus?: number;
  features: APIReference[];
  class: APIReference;
  subclass?: APIReference;
  spellcasting?: { [key: string]: number };
  class_specific?: ClassSpecific;
  subclass_specific?: SubclassSpecific;
}

export interface ClassSpecific {
  rage_count?: number;
  rage_damage_bonus?: number;
  brutal_critical_dice?: number;
  bardic_inspiration_die?: number;
  song_of_rest_die?: number;
  magical_secrets_max_5?: number;
  magical_secrets_max_7?: number;
  magical_secrets_max_9?: number;
  channel_divinity_charges?: number;
  destroy_undead_cr?: number;
  wild_shape_max_cr?: number;
  wild_shape_swim?: boolean;
  wild_shape_fly?: boolean;
  action_surges?: number;
  indomitable_uses?: number;
  extra_attacks?: number;
  martial_arts?: MartialArts;
  ki_points?: number;
  unarmored_movement?: number;
  aura_range?: number;
  favored_enemies?: number;
  favored_terrain?: number;
  sneak_attack?: MartialArts;
  sorcery_points?: number;
  metamagic_known?: number;
  creating_spell_slots?: CreatingSpellSlot[];
  invocations_known?: number;
  mystic_arcanum_level_6?: number;
  mystic_arcanum_level_7?: number;
  mystic_arcanum_level_8?: number;
  mystic_arcanum_level_9?: number;
  arcane_recovery_levels?: number;
}

export interface CreatingSpellSlot {
  spell_slot_level: number;
  sorcery_point_cost: number;
}

export interface MartialArts {
  dice_count: number;
  dice_value: number;
}

export interface SubclassSpecific {
  additional_magical_secrets_max_lvl?: number;
  aura_range?: number;
}
