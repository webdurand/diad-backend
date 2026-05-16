import { ErrorCode } from "src/common/observability/errors/error-codes.catalog";
import type {
  OpeningArchetype,
  SlotResolutionContext,
} from "./opening-archetype.types";

export type SlotResolutionResult =
  | { ok: true; slots: Record<string, string> }
  | { ok: false; errorCode: typeof ErrorCode.COLD_OPEN_SLOT_RESOLUTION_FAILED; missingSlots: string[] };

interface ResolvedCandidate {
  archetype: OpeningArchetype;
  slots: Record<string, string>;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function firstNpc(context: SlotResolutionContext): SlotResolutionContext["npcs"][number] | null {
  return context.npcs.find((npc) => firstNonEmpty(npc.name)) ?? null;
}

function firstLocation(context: SlotResolutionContext): SlotResolutionContext["locations"][number] | null {
  return context.locations.find((location) => firstNonEmpty(location.name)) ?? null;
}

function resolveSlot(slot: string, context: SlotResolutionContext): string | null {
  const npc = firstNpc(context);
  const location = firstLocation(context);
  const questText = firstNonEmpty(context.activeQuest?.activeObjective, context.activeQuest?.name);

  if (slot === "pc.name") return firstNonEmpty(context.pc.name, "o aventureiro");
  if (slot === "pc.race") return firstNonEmpty(context.pc.race, "origem desconhecida");
  if (slot === "pc.class") return firstNonEmpty(context.pc.class, "aventureiro");
  if (slot === "location.name") return firstNonEmpty(location?.name, "este lugar");
  if (slot === "location.type") return firstNonEmpty(location?.type, "local");
  if (slot === "sensory.anchor") {
    return firstNonEmpty(location?.atmosphere, location?.description, "o ar pesado da cena");
  }
  if (slot === "imminent_threat") {
    return firstNonEmpty(npc?.motivation, "um perigo sem nome");
  }
  if (slot === "anomaly.detail") {
    return firstNonEmpty(location?.description, "um detalhe impossível onde nada deveria se mover");
  }
  if (slot === "stake_object") return firstNonEmpty(questText, "um símbolo quebrado");
  if (slot === "weather") return firstNonEmpty(context.weather, "um tempo carregado");
  if (slot === "missing_object") return firstNonEmpty(questText, "algo essencial");
  if (slot === "quest.activeObjective") return questText;

  if (/^npc\.[a-z_]+\.name$/.test(slot)) return firstNonEmpty(npc?.name);
  if (/^npc\.[a-z_]+\.first_glance$/.test(slot)) {
    if (!npc) return null;
    return firstNonEmpty(npc.description, npc.title, npc.race, "um rosto marcado por urgência");
  }

  return null;
}

export function resolveSlots(
  archetype: OpeningArchetype,
  context: SlotResolutionContext,
): SlotResolutionResult {
  const slots: Record<string, string> = {};
  const missingSlots: string[] = [];

  for (const slot of [...archetype.requiredSlots, ...archetype.optionalSlots]) {
    const value = resolveSlot(slot, context);
    if (value) {
      slots[slot] = value;
    } else if (archetype.requiredSlots.includes(slot)) {
      missingSlots.push(slot);
    }
  }

  if (missingSlots.length > 0) {
    return {
      ok: false,
      errorCode: ErrorCode.COLD_OPEN_SLOT_RESOLUTION_FAILED,
      missingSlots,
    };
  }

  return { ok: true, slots };
}

export function resolveSlotsForRankedCandidates(
  rankedArchetypes: OpeningArchetype[],
  context: SlotResolutionContext,
): ResolvedCandidate | null {
  for (const archetype of rankedArchetypes) {
    const result = resolveSlots(archetype, context);
    if (result.ok) return { archetype, slots: result.slots };
  }
  return null;
}

export function renderPromptShape(
  promptShape: string,
  slots: Record<string, string>,
): string {
  return promptShape.replace(/\{\{([a-z._]+)\}\}/g, (_, key: string) => {
    return slots[key] ?? "";
  });
}
