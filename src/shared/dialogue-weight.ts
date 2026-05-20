import type { NpcProfileDepth } from "src/entities/npc.entity";

export type DialogueWeight = "plot" | "flavor" | "ambient";

export interface DialogueWeightNpcInput {
  narrativeRole?: string | null;
  profileDepth?: NpcProfileDepth | string | null;
  tags?: string[] | null;
}

const PLOT_TAGS = new Set(["quest_giver", "secret_holder"]);

export function getDialogueWeight(
  npc: DialogueWeightNpcInput | null | undefined,
): DialogueWeight {
  if (!npc) return "ambient";

  const profileDepth = npc.profileDepth ?? "core";
  const hasPlotProfile =
    Boolean(npc.narrativeRole?.trim()) &&
    (profileDepth === "supporting" || profileDepth === "expanded");
  if (hasPlotProfile) return "plot";

  const tags = Array.isArray(npc.tags) ? npc.tags : [];
  if (tags.some((tag) => PLOT_TAGS.has(tag))) return "plot";

  if (profileDepth === "supporting") return "flavor";
  return "ambient";
}
