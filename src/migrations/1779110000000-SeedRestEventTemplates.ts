import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Spec 016 M4 — Seed dos camp event templates (BG3-inspired).
 *
 * Pool priorizado: bond > chekhov > dream > mythic > interruption > nothing.
 * Director picker faz weighted roll, max 1 event/long rest. Templates
 * mínimos viáveis pra M4; M5 expande com narrative_template_id linkando
 * a beats curados.
 *
 * Ver `specs/016-play-shell-foundation/spec.md` §6.4.
 */

interface TemplatePayload {
  kind:
    | "npc_dialog_pending"
    | "dream_foreshadow"
    | "chekhov_payoff_reminder"
    | "mythic_random_event"
    | "hostile_interruption"
    | "npc_visit_opportunity"
    | "nothing";
  triggerCondition: string;
  weight: number;
}

const TEMPLATES: TemplatePayload[] = [
  {
    kind: "npc_dialog_pending",
    triggerCondition:
      "companion_bond_score>=3 AND last_companion_dialog_scenes_ago>=2",
    weight: 30,
  },
  {
    kind: "chekhov_payoff_reminder",
    triggerCondition: "unfinished_arcs>0 AND scenes_since_last_payoff>=3",
    weight: 25,
  },
  {
    kind: "npc_visit_opportunity",
    triggerCondition: "companion_bond_score>=2 AND companion_status=alive",
    weight: 20,
  },
  {
    kind: "dream_foreshadow",
    triggerCondition: "arc_beat IN (NEED, GO, FIND) AND foreshadow_count<2",
    weight: 10,
  },
  {
    kind: "mythic_random_event",
    triggerCondition: "chaos_factor>=6",
    weight: 5,
  },
  {
    kind: "hostile_interruption",
    triggerCondition: "location_safety<=2 AND warning_acknowledged=true",
    weight: 5,
  },
  {
    kind: "nothing",
    triggerCondition: "always",
    weight: 5,
  },
];

export class SeedRestEventTemplates1779110000000 implements MigrationInterface {
  name = "SeedRestEventTemplates1779110000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotente: limpa antes de re-seed (ainda não temos slug único).
    await queryRunner.query(
      `DELETE FROM rest_event_templates WHERE narrative_template_id IS NULL`,
    );
    for (const t of TEMPLATES) {
      await queryRunner.query(
        `INSERT INTO rest_event_templates (kind, trigger_condition, weight)
         VALUES ($1, $2, $3)`,
        [t.kind, t.triggerCondition, t.weight],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM rest_event_templates WHERE narrative_template_id IS NULL`,
    );
  }
}
