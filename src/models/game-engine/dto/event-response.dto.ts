import { GameEventEntity } from "src/entities/game-event.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";


export interface EventResponseDto {
  id: string;
  encounterId: string;
  sequence: number;
  type: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  description: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

function snakeToCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}


export function camelToSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}


export function toEventResponseDto(
  event: GameEventEntity,
  participantsMap: Map<string, string>,
): EventResponseDto {
  const actorId = event.actorParticipantId ?? null;
  const targetId = event.targetParticipantId ?? null;
  const persistedActorName =
    typeof event.data?.actorName === "string" ? event.data.actorName : null;
  const persistedTargetName =
    typeof event.data?.targetName === "string" ? event.data.targetName : null;
  const actorName = persistedActorName ??
    (actorId ? participantsMap.get(actorId) ?? null : null);
  const targetName = persistedTargetName ??
    (targetId ? participantsMap.get(targetId) ?? null : null);

  return {
    id: event.id,
    encounterId: event.encounterId ?? "",
    sequence: event.sequence,
    type: snakeToCamelCase(event.eventType),
    actorId,
    actorName,
    targetId,
    targetName,
    description: generateEventDescription(
      event.eventType,
      event.data,
      actorName,
      targetName,
    ),
    payload: event.data,
    timestamp:
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : String(event.createdAt),
  };
}


function generateEventDescription(
  eventType: string,
  data: Record<string, unknown>,
  actorName: string | null,
  targetName: string | null,
): string {
  const actor = actorName ?? "Desconhecido";
  const target = targetName ?? "alvo";

  switch (eventType) {
    case "attack_roll": {
      const weapon =
        (data.actionName as string) ?? (data.actionSlug as string) ?? "ataque";
      const total = data.total ?? "?";
      const ac = data.targetAc ?? "?";
      const hit = data.hit ? "acerto" : "erro";
      return `${actor} ataca ${target} com ${weapon} — ${hit}! (${total} vs AC ${ac})`;
    }
    case "damage_applied": {
      const amount = data.finalDamage ?? data.total ?? "?";
      const dmgType = (data.type as string) ?? "";
      return `${actor} causa ${amount} de dano${dmgType ? ` ${dmgType}` : ""} a ${target}`;
    }
    case "spell_cast": {
      const spell =
        (data.spellName as string) ??
        (data.spellSlug as string) ??
        (data.spell as string) ??
        "magia";
      const slot =
        data.slotLevel ?? data.slotUsed ?? data.slot_used ?? data.spell_level ?? "";
      return `${actor} conjura ${spell}${slot ? ` (slot nível ${slot})` : ""}${targetName ? ` em ${target}` : ""}`;
    }
    case "condition_applied": {
      const condition =
        (data.condition as string) ?? (data.slug as string) ?? "?";
      const source = (data.source as string) ?? "";
      return `${target} fica ${condition}${source ? ` (${source})` : ""}`;
    }
    case "condition_removed":
    case "condition_expired": {
      const condition =
        (data.condition as string) ?? (data.slug as string) ?? "?";
      return `${target} perde a condição ${condition}`;
    }
    case "turn_start": {
      const round = data.round ?? "";
      return `Início do turno de ${actor}${round ? ` (Rodada ${round})` : ""}`;
    }
    case "turn_end":
      return `Fim do turno de ${actor}`;
    case "round_start": {
      const round = data.round ?? data.roundNumber ?? "?";
      return `Início da Rodada ${round}`;
    }
    case "concentration_check": {
      const dc = data.dc ?? "?";
      const success = data.success ? "manteve" : "perdeu";
      return `${actor} faz teste de Concentração DC ${dc} — ${success}!`;
    }
    case "concentration_lost":
    case "concentration_started": {
      const spell = (data.spellSlug as string) ?? (data.spell as string) ?? "";
      return eventType === "concentration_started"
        ? `${actor} começa a concentrar em ${spell}`
        : `${actor} perde concentração em ${spell}`;
    }
    case "hp_change": {
      const healing = Number(data.healing ?? 0);
      const damage = Number(data.finalDamage ?? data.damage ?? 0);
      const amount = Number(data.amount ?? data.delta ?? 0);
      if (healing > 0 || amount > 0) {
        const recovered = healing > 0 ? healing : amount;
        return `${target} recupera ${recovered} HP`;
      }
      const lost = damage > 0 ? damage : Math.abs(Math.min(0, amount));
      const mitigation = data.immune
        ? " — imune"
        : data.resisted
          ? " — resistência aplicada"
          : data.vulnerable
            ? " — vulnerabilidade aplicada"
            : "";
      return `${target} perde ${lost} HP${mitigation}`;
    }
    case "death_save": {
      const roll = data.roll ?? "?";
      const success = data.success ? "sucesso" : "falha";
      return `${actor} faz Death Save — ${success} (${roll})`;
    }
    case "effect_applied": {
      const kind = (data.kind as string) ?? (data.effectKind as string) ?? "?";
      const source =
        (data.source as string) ?? (data.sourceSpell as string) ?? "";
      return `${target} recebe efeito ${kind}${source ? ` de ${source}` : ""}`;
    }
    case "effect_expired": {
      const kind = (data.kind as string) ?? (data.effectKind as string) ?? "?";
      return `Efeito ${kind} expira em ${target}`;
    }
    case "encounter_start":
      return "Combate iniciado!";
    case "encounter_end":
      return "Combate encerrado.";
    case "movement": {
      const from = data.from
        ? `(${(data.from as any).x},${(data.from as any).y})`
        : "";
      const to = data.to ? `(${(data.to as any).x},${(data.to as any).y})` : "";
      return `${actor} move${from ? ` de ${from}` : ""}${to ? ` para ${to}` : ""}`;
    }
    case "class_feature_invoked":
    case "class_feature_used": {
      const feat = (data.featureSlug as string) ?? "?";
      return `${actor} usa ${feat}`;
    }
    case "legendary_action_used": {
      const action = (data.actionName as string) ?? "ação lendária";
      return `${actor} usa ${action}`;
    }
    case "spell_damage": {
      const amount = data.totalDamage ?? data.damage ?? data.total ?? "?";
      const spell = (data.spellName as string) ?? (data.spell as string) ?? "";
      const damageType = (data.damageType as string) ?? (data.type as string) ?? "";
      return `${spell ? `${spell}: ` : ""}${actor} rola ${amount}${damageType ? ` de dano ${damageType}` : " de dano"}`;
    }
    case "spell_healing": {
      const amount = data.totalHealing ?? data.healing ?? data.total ?? "?";
      const spell = (data.spellName as string) ?? (data.spell as string) ?? "";
      return `${spell ? `${spell}: ` : ""}${actor} rola ${amount} de cura`;
    }
    case "control_changed": {
      const newMode = (data.newMode as string) ?? "?";
      return `Controle de ${actor} alterado para ${newMode}`;
    }
    case "participant_joined":
      return `${actor} entrou no combate`;
    default:
      return `${snakeToCamelCase(eventType)}${actorName ? `: ${actor}` : ""}${targetName ? ` → ${target}` : ""}`;
  }
}


export function buildParticipantsMap(
  participants: EncounterParticipantEntity[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of participants) {
    map.set(p.id, p.displayName);
  }
  return map;
}
