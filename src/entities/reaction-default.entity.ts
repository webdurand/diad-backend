import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Spec 016 — Reaction defaults per (class, reaction) com 3 estados.
 *
 * Defaults sensatos por classe (Fighter: OA always; Wizard: Shield ask;
 * Cleric: ask por padrão). Player override persiste em
 * `character_states.reaction_prefs` jsonb.
 *
 * Solasta dev diary admite hybrid Auto/Ask/Off é o ideal —
 * pop-up bloqueante puro mata flow em chat-first.
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §8.2.
 */
export type ReactionState = 'auto' | 'ask' | 'off';

@Entity('reaction_defaults')
@Unique(['classSlug', 'reactionName'])
export class ReactionDefaultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'class_slug', type: 'varchar', length: 50 })
  classSlug: string;

  @Column({ name: 'reaction_name', type: 'varchar', length: 60 })
  reactionName: string;

  @Column({ name: 'default_state', type: 'varchar', length: 10 })
  defaultState: ReactionState;

  @Column({ name: 'consumes_spell_slot', type: 'boolean', default: false })
  consumesSpellSlot: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
