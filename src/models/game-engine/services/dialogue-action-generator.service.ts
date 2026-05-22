import { Injectable } from "@nestjs/common";
import type { DialogueWeight } from "src/shared/dialogue-weight";

export type DialogueActionType =
  | "talk_npc"
  | "examine_interactable"
  | "investigate_scene"
  | "skill"
  | "topic"
  | "social"
  | "reply_free_text"
  | "exit_dialogue"
  | "meta_query";

export interface DialogueAction {
  actionId: string;
  type: DialogueActionType;
  label: string;
  payload?: Record<string, unknown>;
}

export type DialogueActionStakes =
  | "passive"
  | "casual"
  | "narrative"
  | "high";

export interface DialogueActionGenerationInput {
  characterSkills: string[];
  characterKnownFacts: string[];
  includeGreeting?: boolean;
  npc: {
    id: string;
    name: string;
    tags?: string[];
    knowledgeScope?: string[];
    dialogueWeight?: DialogueWeight;
  };
}

const SKILL_LABELS: Record<string, string> = {
  persuasion: "Persuadir",
  insight: "Ler intenção",
  deception: "Blefar",
  intimidation: "Intimidar",
  history: "Citar história",
  investigation: "Investigar detalhe",
  perception: "Observar reação",
};

const TOPIC_LABELS: Record<string, string> = {
  rumor_amulet: "Perguntar sobre amuleto",
};

const SOCIAL_ACTIONS: Array<{
  key: string;
  label: string;
  firstTurnOnly?: boolean;
}> = [
  { key: "social_ask_more", label: "Pedir mais informações" },
  { key: "social_question", label: "Questionar" },
  { key: "social_convince", label: "Convencer" },
  { key: "social_change_topic", label: "Mudar de assunto" },
  { key: "social_greet", label: "Cumprimentar", firstTurnOnly: true },
  { key: "social_farewell", label: "Despedir-se" },
];

@Injectable()
export class DialogueActionGeneratorService {
  generate(input: DialogueActionGenerationInput): DialogueAction[] {
    const actions: DialogueAction[] = [];
    const seen = new Set<string>();

    for (const social of SOCIAL_ACTIONS) {
      if (social.firstTurnOnly && input.includeGreeting === false) continue;
      this.pushOnce(actions, seen, {
        actionId: social.key,
        type: "social",
        label: social.label,
        payload: { intent: social.key, npcId: input.npc.id },
      });
    }

    for (const skill of input.characterSkills ?? []) {
      const normalized = this.normalizeSlug(skill);
      const label = SKILL_LABELS[normalized];
      if (!label) continue;
      this.pushOnce(actions, seen, {
        actionId: `skill_${normalized}`,
        type: "skill",
        label,
        payload: {
          skill: normalized,
          npcId: input.npc.id,
          stakes: this.computeSkillStakes(
            normalized,
            input.npc.dialogueWeight ?? "ambient",
          ),
        },
      });
    }

    for (const topic of this.safePublicTopics(input)) {
      this.pushOnce(actions, seen, {
        actionId: `topic_${topic}`,
        type: "topic",
        label: TOPIC_LABELS[topic] ?? `Perguntar sobre ${topic.replace(/_/g, " ")}`,
        payload: {
          topic,
          npcId: input.npc.id,
          stakes:
            input.npc.dialogueWeight === "plot" ? "narrative" : "casual",
        },
      });
    }

    const pressTopic = this.pressableTopic(input);
    if (pressTopic) {
      this.pushOnce(actions, seen, {
        actionId: "talk_press_more",
        type: "talk_npc",
        label: "Pressionar por mais",
        payload: {
          action: "press",
          npcId: input.npc.id,
          topic: "unrevealed",
          stakes:
            input.npc.dialogueWeight === "plot" ? "narrative" : "casual",
        },
      });
    }

    this.pushOnce(actions, seen, {
      actionId: "reply_free_text",
      type: "reply_free_text",
      label: "Responder livremente",
    });
    this.pushOnce(actions, seen, {
      actionId: "meta_query",
      type: "meta_query",
      label: "Pergunta meta",
    });
    this.pushOnce(actions, seen, {
      actionId: "exit_dialogue",
      type: "exit_dialogue",
      label: "Sair da conversa",
    });

    return actions;
  }

  private safePublicTopics(input: DialogueActionGenerationInput): string[] {
    const knownFacts = new Set(
      (input.characterKnownFacts ?? []).map((fact) => this.normalizeSlug(fact)),
    );
    const scopedKnownTopics = (input.npc.knowledgeScope ?? [])
      .map((topic) => this.normalizeSlug(topic))
      .filter((topic) => knownFacts.has(topic))
      .filter((topic) => !this.isSecret(topic));
    const publicHooks = (input.npc.tags ?? [])
      .filter((tag) => tag.startsWith("public_hook:"))
      .map((tag) => this.normalizeSlug(tag.slice("public_hook:".length)))
      .filter((topic) => !this.isSecret(topic));
    return [...new Set([...scopedKnownTopics, ...publicHooks])];
  }

  private pressableTopic(input: DialogueActionGenerationInput): string | null {
    const knownFacts = new Set(
      (input.characterKnownFacts ?? []).map((fact) => this.normalizeSlug(fact)),
    );
    const topic = (input.npc.knowledgeScope ?? [])
      .map((item) => this.normalizeSlug(item))
      .find((item) => item && !knownFacts.has(item));
    return topic ?? null;
  }

  private computeSkillStakes(
    skill: string,
    dialogueWeight: DialogueWeight,
  ): DialogueActionStakes {
    if (
      dialogueWeight === "plot" &&
      ["persuasion", "deception", "intimidation"].includes(skill)
    ) {
      return "high";
    }
    if (dialogueWeight === "plot") return "narrative";
    if (["insight", "perception"].includes(skill)) return "passive";
    return dialogueWeight === "flavor" ? "narrative" : "casual";
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

  private normalizeSlug(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9_:-]/g, "");
  }

  private isSecret(value: string): boolean {
    return /secret|traitor|hidden|spoiler/.test(value);
  }
}
