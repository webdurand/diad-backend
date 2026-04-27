import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterClassEntity } from "src/entities/character-class.entity";
import type {
  ConditionInstance,
  ConditionSlug,
  ConditionSource,
  RepeatSaveTiming,
  SaveAbility,
} from "../interfaces/combat.interfaces";
import type { GameEventData } from "../interfaces/result.type";
import { ConcentrationService } from "./concentration.service";
import { DiceService } from "./dice.service";
import {
  narrativeForConditionRemoval,
  type RemovalReason,
} from "./narrative-condition-removal";

export interface ApplyConditionInput {
  slug: ConditionSlug;
  appliedBy?: string | null;
  sourceSpell?: string | null;
  sourceConcentration?: boolean;
  /**
   * Spec 015 Eixo 3 — origem semântica (default `'manual'`). Quando não
   * passado mas `sourceSpell` está preenchido, gera `'spell:<slug>'`
   * automaticamente em `applyCondition` pra compat.
   */
  source?: ConditionSource;
  saveAbility?: SaveAbility | null;
  saveDc?: number | null;
  repeatSaveTiming?: RepeatSaveTiming;
  durationRoundsRemaining?: number | null;
  level?: number;
}

/**
 * Spec 015 Eixo 3 — resolve o `ConditionSource` do input da aplicação.
 *
 * Ordem:
 *   1. `input.source` explícito (preferido).
 *   2. Auto-deriva `spell:<slug>` quando só `sourceSpell` foi passado.
 *   3. Fallback `'manual'` (legacy, DM manual).
 */
function resolveSource(input: ApplyConditionInput): ConditionSource {
  if (input.source) return input.source;
  if (input.sourceSpell) {
    return `spell:${input.sourceSpell}` as ConditionSource;
  }
  return "manual";
}

/**
 * Spec 004 — Lifecycle de ConditionInstance:
 *  - aplicar (gera id; sincroniza legacy `conditions: string[]`; trigger concentração quebra se incapacitar próprio alvo concentrando)
 *  - remover por id (precisão)
 *  - processar saves no fim do turno do alvo
 *  - decrementar durações no início de round
 *  - cascata por concentração (delegada para ConcentrationService)
 */
@Injectable()
export class ConditionLifecycleService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly characterClasses: Repository<CharacterClassEntity>,
    private readonly concentration: ConcentrationService,
    private readonly dice: DiceService,
  ) {}

  /**
   * Spec 012 — Nature's Ward (Land Druid L10 XPHB). Imunidade Charmed, Frightened,
   * Poisoned pra PC. Retorna true se a condição deve ser bloqueada.
   */
  private async isBlockedByNaturesWard(
    target: EncounterParticipantEntity,
    slug: string,
  ): Promise<boolean> {
    if (target.type !== "pc" || !target.characterId) return false;
    if (!["charmed", "frightened", "poisoned"].includes(slug)) return false;
    const classes = await this.characterClasses.find({
      where: { character_id: target.characterId },
      relations: ["class", "subclass"],
    });
    const druid = classes.find(
      (c) => c.class?.slug === "druid" || c.class?.slug === "druid-phb",
    );
    if (!druid || druid.class_level < 10) return false;
    const sub = (
      druid.subclass as { slug?: string } | undefined
    )?.slug?.replace(/-(phb|xphb)$/, "");
    return sub === "land";
  }

  /**
   * Cria uma ConditionInstance no participante.
   * Retorna eventos + a instância criada (id).
   */
  async applyCondition(
    target: EncounterParticipantEntity,
    input: ApplyConditionInput,
  ): Promise<{
    events: GameEventData[];
    instance: ConditionInstance;
    concentrationBroken: boolean;
  }> {
    // Spec 012 Gap #6 — Land Druid L10+ imune a charmed/frightened/poisoned.
    const blockedByWard = await this.isBlockedByNaturesWard(target, input.slug);
    if (blockedByWard) {
      const stubInstance: ConditionInstance = {
        id: randomUUID(),
        slug: input.slug,
        appliedBy: input.appliedBy ?? null,
        sourceSpell: input.sourceSpell ?? null,
        sourceConcentration: false,
        source: resolveSource(input),
        saveAbility: null,
        saveDc: null,
        repeatSaveTiming: "never",
        durationRoundsRemaining: 0,
        level: input.level,
        appliedAt: new Date().toISOString(),
      };
      return {
        events: [
          {
            event_type: "condition_blocked_by_immunity",
            target_participant_id: target.id,
            data: {
              slug: input.slug,
              source: "natures-ward",
              feature: "Land Druid L10",
            },
          },
        ],
        instance: stubInstance,
        concentrationBroken: false,
      };
    }

    const instance: ConditionInstance = {
      id: randomUUID(),
      slug: input.slug,
      appliedBy: input.appliedBy ?? null,
      sourceSpell: input.sourceSpell ?? null,
      sourceConcentration: input.sourceConcentration ?? false,
      source: resolveSource(input),
      saveAbility: input.saveAbility ?? null,
      saveDc: input.saveDc ?? null,
      repeatSaveTiming: input.repeatSaveTiming ?? "never",
      durationRoundsRemaining: input.durationRoundsRemaining ?? null,
      level: input.level,
      appliedAt: new Date().toISOString(),
    };

    target.conditionInstances = [
      ...(target.conditionInstances ?? []),
      instance,
    ];
    target.conditions = this.deriveSlugs(target.conditionInstances);

    // Vínculo grappledByParticipantId quando aplica grappled com appliedBy
    if (input.slug === "grappled" && input.appliedBy) {
      target.grappledByParticipantId = input.appliedBy;
    }

    await this.participants.save(target);

    const events: GameEventData[] = [
      {
        event_type: "condition_applied",
        target_participant_id: target.id,
        actor_participant_id: input.appliedBy ?? undefined,
        data: {
          instanceId: instance.id,
          slug: instance.slug,
          sourceSpell: instance.sourceSpell,
          sourceConcentration: instance.sourceConcentration,
          saveAbility: instance.saveAbility,
          saveDc: instance.saveDc,
          durationRoundsRemaining: instance.durationRoundsRemaining,
          level: instance.level,
        },
      },
    ];

    // Trigger: nova condição incapacitante quebra a própria concentração do alvo
    const conc = await this.concentration.checkBreakOnCondition(
      target,
      input.slug,
    );
    events.push(...conc.events);

    return { events, instance, concentrationBroken: conc.broken };
  }

  /** Remove uma instância específica por id. Sincroniza legacy. */
  async removeConditionInstance(
    target: EncounterParticipantEntity,
    instanceId: string,
    reason: RemovalReason | string = "manual",
  ): Promise<{ events: GameEventData[]; removed: boolean }> {
    const before = (target.conditionInstances ?? []).length;
    const removed = (target.conditionInstances ?? []).find(
      (ci) => ci.id === instanceId,
    );
    target.conditionInstances = (target.conditionInstances ?? []).filter(
      (ci) => ci.id !== instanceId,
    );
    if (target.conditionInstances.length === before) {
      return { events: [], removed: false };
    }
    target.conditions = this.deriveSlugs(target.conditionInstances);

    // Se a instância removida era 'grappled', limpar vínculo
    if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
      target.grappledByParticipantId = null;
    }

    await this.participants.save(target);
    const narrativeDescriptor = removed
      ? narrativeForConditionRemoval(removed.slug, reason)
      : "";
    return {
      events: [
        {
          event_type: "condition_removed",
          target_participant_id: target.id,
          data: {
            instanceId,
            slug: removed?.slug ?? null,
            source: removed?.source ?? "manual",
            removalReason: reason,
            narrativeDescriptor,
            // legado — manter `reason` por retrocompat com listeners antigos
            reason,
          },
        },
      ],
      removed: true,
    };
  }

  /**
   * Spec 015 Eixo 3 — revalida condições após mudança de HP.
   *
   * Quando HP sai de ≤0 pra >0 (heal clássico), instâncias com
   * `source='hp_zero'` são removidas (Unconscious derivada de dying acaba).
   * Instâncias com outra source (spell:faerie-fire, feature:stun, etc.)
   * permanecem — RAW 5e consistente.
   *
   * Retorna ids removidos + events pra caller incluir no stream.
   */
  async revalidateAfterHpChange(
    target: EncounterParticipantEntity,
    prevHp: number,
    newHp: number,
  ): Promise<{ events: GameEventData[]; removed: ConditionInstance[] }> {
    if (!(prevHp <= 0 && newHp > 0)) {
      return { events: [], removed: [] };
    }
    const before = target.conditionInstances ?? [];
    const toRemove = before.filter((ci) => ci.source === "hp_zero");
    if (toRemove.length === 0) {
      return { events: [], removed: [] };
    }
    target.conditionInstances = before.filter((ci) => ci.source !== "hp_zero");
    target.conditions = this.deriveSlugs(target.conditionInstances);
    if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
      target.grappledByParticipantId = null;
    }
    await this.participants.save(target);

    const events: GameEventData[] = toRemove.map((ci) => ({
      event_type: "condition_removed",
      target_participant_id: target.id,
      data: {
        instanceId: ci.id,
        slug: ci.slug,
        source: ci.source,
        removalReason: "hp_restored" as RemovalReason,
        narrativeDescriptor: narrativeForConditionRemoval(
          ci.slug,
          "hp_restored",
        ),
        reason: "hp_restored",
      },
    }));
    return { events, removed: toRemove };
  }

  /**
   * Spec 015 Eixo 3 — remove todas as instâncias de UMA source específica
   * dos targets passados. Usado pela cascata de concentration break.
   *
   * Ex: `removeConditionsBySource([g1,g2,g3], 'spell:faerie-fire', 'concentration_broken')`
   * → remove Faerie Fire nos 3 goblins atomicamente, emitindo 3 events.
   */
  async removeConditionsBySource(
    targets: EncounterParticipantEntity[],
    source: ConditionSource,
    reason: RemovalReason = "source_ended",
  ): Promise<{ events: GameEventData[]; removedCount: number }> {
    const events: GameEventData[] = [];
    let removedCount = 0;
    for (const target of targets) {
      const before = target.conditionInstances ?? [];
      const toRemove = before.filter((ci) => ci.source === source);
      if (toRemove.length === 0) continue;
      target.conditionInstances = before.filter((ci) => ci.source !== source);
      target.conditions = this.deriveSlugs(target.conditionInstances);
      if (!target.conditionInstances.some((ci) => ci.slug === "grappled")) {
        target.grappledByParticipantId = null;
      }
      await this.participants.save(target);
      for (const ci of toRemove) {
        events.push({
          event_type: "condition_removed",
          target_participant_id: target.id,
          data: {
            instanceId: ci.id,
            slug: ci.slug,
            source: ci.source,
            removalReason: reason,
            narrativeDescriptor: narrativeForConditionRemoval(ci.slug, reason),
            reason,
          },
        });
        removedCount += 1;
      }
    }
    return { events, removedCount };
  }

  /**
   * Processa saves no fim do turno do participante.
   * Para cada ConditionInstance com `repeatSaveTiming='end_of_turn'`,
   * rola o save automaticamente. Sucesso remove; falha decrementa duração.
   */
  async processEndOfTurn(
    target: EncounterParticipantEntity,
    getSaveModifier: (ability: SaveAbility) => Promise<{
      modifier: number;
      advantage: boolean;
      disadvantage: boolean;
    }>,
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    const remaining: ConditionInstance[] = [];
    for (const ci of target.conditionInstances ?? []) {
      if (
        ci.repeatSaveTiming === "end_of_turn" &&
        ci.saveAbility &&
        ci.saveDc != null
      ) {
        const mod = await getSaveModifier(ci.saveAbility);
        let rolled: number;
        if (mod.advantage && !mod.disadvantage) {
          rolled = this.dice.rollWithAdvantage().chosen;
        } else if (mod.disadvantage && !mod.advantage) {
          rolled = this.dice.rollWithDisadvantage().chosen;
        } else {
          rolled = this.dice.roll(20);
        }
        const total = rolled + mod.modifier;
        const passed = total >= ci.saveDc;
        events.push({
          event_type: "end_of_turn_save_rolled",
          target_participant_id: target.id,
          data: {
            instanceId: ci.id,
            slug: ci.slug,
            ability: ci.saveAbility,
            dc: ci.saveDc,
            rolled,
            modifier: mod.modifier,
            total,
            passed,
          },
        });
        if (passed) {
          // remove
          continue;
        }
        // falha: decrementa duração se aplicável
        if (ci.durationRoundsRemaining != null) {
          ci.durationRoundsRemaining -= 1;
          if (ci.durationRoundsRemaining <= 0) {
            events.push({
              event_type: "condition_expired",
              target_participant_id: target.id,
              data: { instanceId: ci.id, slug: ci.slug },
            });
            continue;
          }
        }
      }
      remaining.push(ci);
    }
    if (remaining.length !== (target.conditionInstances ?? []).length) {
      target.conditionInstances = remaining;
      target.conditions = this.deriveSlugs(remaining);
      if (!remaining.some((ci) => ci.slug === "grappled")) {
        target.grappledByParticipantId = null;
      }
      await this.participants.save(target);
    }
    return { events };
  }

  /**
   * Decrementa durações no início de cada round para condições com
   * duração não-nula e timing != 'end_of_turn' (estas decrementam no save).
   */
  async decrementDurationsAtRoundStart(
    participants: EncounterParticipantEntity[],
  ): Promise<{ events: GameEventData[] }> {
    const events: GameEventData[] = [];
    for (const p of participants) {
      const remaining: ConditionInstance[] = [];
      let changed = false;
      for (const ci of p.conditionInstances ?? []) {
        if (
          ci.repeatSaveTiming !== "end_of_turn" &&
          ci.durationRoundsRemaining != null
        ) {
          ci.durationRoundsRemaining -= 1;
          if (ci.durationRoundsRemaining <= 0) {
            changed = true;
            events.push({
              event_type: "condition_expired",
              target_participant_id: p.id,
              data: { instanceId: ci.id, slug: ci.slug },
            });
            continue;
          }
          changed = true;
        }
        remaining.push(ci);
      }
      if (changed) {
        p.conditionInstances = remaining;
        p.conditions = this.deriveSlugs(remaining);
        if (!remaining.some((ci) => ci.slug === "grappled")) {
          p.grappledByParticipantId = null;
        }
        await this.participants.save(p);
      }
    }
    return { events };
  }

  private deriveSlugs(instances: ConditionInstance[]): string[] {
    return Array.from(new Set(instances.map((i) => i.slug)));
  }
}
