import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { MonsterEntity } from "./monster.entity";

/**
 * Spec 026 / Pillar 6 — NPC archetype registry.
 *
 * Mapeia archetypes narrativos canônicos (PT-BR e EN) para stat blocks RAW
 * do Monster Manual 2024. Usado pelo PreFlightOracle ao materializar NPCs
 * mencionados só na prosa quando jogador declara hostilidade.
 *
 * Princípio: zero invenção de regras — Bertram = Bandit Captain stat block;
 * customização vive em `npc.name` + `npc.description` (cosmético), nunca
 * em mecânica.
 */
@Entity("npc_archetype_templates")
export class NpcArchetypeTemplateEntity {
  /** Slug canônico em inglês (`thug`, `bandit_captain`, `cult_fanatic`, ...). */
  @PrimaryColumn({ type: "varchar", length: 50 })
  slug: string;

  @Column({ name: "monster_id", type: "uuid" })
  monsterId: string;

  @ManyToOne(() => MonsterEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "monster_id" })
  monster: MonsterEntity;

  /** Label PT-BR exibida em UI/admin. Ex: "Bandido", "Capataz / Líder de Bandidos". */
  @Column({ name: "archetype_label_pt", type: "varchar", length: 100 })
  archetypeLabelPt: string;

  /** Hostility default quando oracle materializa sem hint explícito. */
  @Column({
    name: "hostility_default",
    type: "varchar",
    length: 16,
    default: "neutral",
  })
  hostilityDefault: "volatile" | "low" | "high" | "neutral";

  /** Página de referência no MM 2024 (NULL pra archetypes pre-2024). */
  @Column({ name: "mm_2024_page", type: "int", nullable: true })
  mm2024Page?: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
