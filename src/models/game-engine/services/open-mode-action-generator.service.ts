import { Injectable } from "@nestjs/common";
import type { DialogueAction } from "./dialogue-action-generator.service";

export interface OpenModeNpcInput {
  id?: string | null;
  name?: string | null;
  presenceRole?: string | null;
  dialogueWeight?: string | null;
  title?: string | null;
}

export interface OpenModeInteractableInput {
  id?: string | null;
  name?: string | null;
  label?: string | null;
}

export interface OpenModeActionGenerationInput {
  npcsPresent: OpenModeNpcInput[];
  interactables?: OpenModeInteractableInput[];
  characterSkills: string[];
}

@Injectable()
export class OpenModeActionGeneratorService {
  generate(input: OpenModeActionGenerationInput): DialogueAction[] {
    const actions: DialogueAction[] = [];
    const seen = new Set<string>();

    for (const npc of input.npcsPresent ?? []) {
      if (!npc.id || !npc.name) continue;
      if (npc.presenceRole === "companion") continue;
      this.pushOnce(actions, seen, {
        actionId: `talk_npc_${npc.id}`,
        type: "talk_npc",
        label: `Falar com ${npc.name}`,
        payload: { npcId: npc.id },
      });
    }

    for (const interactable of input.interactables ?? []) {
      const name = interactable.name ?? interactable.label;
      if (!name) continue;
      const id = interactable.id ?? this.slug(name);
      this.pushOnce(actions, seen, {
        actionId: `examine_interactable_${id}`,
        type: "examine_interactable",
        label: `Examinar ${name}`,
        payload: { interactableId: id, name },
      });
    }

    const sceneSkill = this.bestSceneSkill(input.characterSkills ?? []);
    if (sceneSkill) {
      this.pushOnce(actions, seen, {
        actionId: "investigate_scene",
        type: "investigate_scene",
        label: "Investigar a cena",
        payload: { skill: sceneSkill },
      });
    }

    return actions;
  }

  private bestSceneSkill(skills: string[]): "investigation" | "perception" | null {
    const normalized = new Set(skills.map((skill) => this.slug(skill)));
    if (normalized.has("investigation")) return "investigation";
    if (normalized.has("perception")) return "perception";
    return null;
  }

  private pushOnce(
    actions: DialogueAction[],
    seen: Set<string>,
    action: DialogueAction,
  ): void {
    if (seen.has(action.actionId)) return;
    seen.add(action.actionId);
    actions.push(action);
  }

  private slug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  }
}
