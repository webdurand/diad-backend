import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LoreEntryEntity } from "src/entities/lore-entry.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { SceneEntity } from "src/entities/scene.entity";
import { CharacterSheetService } from "src/models/characters/services/character-sheet.service";
import { SceneContextService } from "./scene-context.service";
import type { MetaQueryIntentCategory } from "src/entities/meta-query-audit.entity";

export type MetaQueryFactKind =
  | "pc_capability"
  | "scene_observation"
  | "npc_public"
  | "lore"
  | "rule_reference"
  | "inspected_stat"
  | "hidden_dc"
  | "future_beat"
  | "secret_identity"
  | "closed_container";

export interface MetaQueryAllowedFact {
  factId: string;
  kind: MetaQueryFactKind;
  text: string;
  source: string;
  topics: string[];
}

export interface ResolveMetaQueryFactsInput {
  userId: string;
  session: GameSessionEntity;
  scene: SceneEntity;
  characterId: string | null;
  question: string;
  intentCategory: MetaQueryIntentCategory;
}

const SKILL_RULE_HINTS: Record<string, string> = {
  acrobatics:
    "Acrobatics cobre equilíbrio e acrobacias; o DM decide quando pedir o teste.",
  athletics:
    "Athletics cobre escalar, saltar e nadar quando há esforço físico relevante.",
  insight:
    "Insight pode revelar sinais qualitativos de intenção, sem ler pensamentos.",
  perception:
    "Perception cobre notar sinais no ambiente; percepção passiva é observação constante.",
  investigation:
    "Investigation cobre deduzir pistas a partir de detalhes examinados.",
  persuasion:
    "Persuasion cobre influência social de boa-fé; não força controle mental.",
  intimidation:
    "Intimidation cobre influência por ameaça ou pressão, com consequência social possível.",
  deception:
    "Deception cobre esconder a verdade de modo convincente.",
};

@Injectable()
export class MetaQueryFactResolver {
  constructor(
    private readonly sceneContextService: SceneContextService,
    private readonly characterSheetService: CharacterSheetService,
    @InjectRepository(LoreEntryEntity)
    private readonly loreRepo: Repository<LoreEntryEntity>,
  ) {}

  async resolve(
    input: ResolveMetaQueryFactsInput,
  ): Promise<MetaQueryAllowedFact[]> {
    const facts: MetaQueryAllowedFact[] = [];
    const context = await this.sceneContextService.assembleContext(input.scene.id);

    facts.push(...this.sceneFacts(input.scene, context));
    facts.push(...this.npcPublicFacts(context));
    facts.push(...this.partyKnowledgeFacts(context));
    facts.push(...(await this.characterFacts(input)));
    facts.push(...(await this.activatedLoreFacts(input)));

    return this.uniqueFacts(facts);
  }

  private sceneFacts(
    scene: SceneEntity,
    context: Awaited<ReturnType<SceneContextService["assembleContext"]>>,
  ): MetaQueryAllowedFact[] {
    const textParts = [
      scene.title,
      scene.description,
      context.scene?.location?.name,
      context.scene?.poi?.name,
      context.scene?.mood,
    ].filter((value): value is string => !!value && value.trim().length > 0);

    if (textParts.length === 0) return [];
    const text = `Cena atual: ${textParts.join(" | ")}`;
    return [
      {
        factId: `scene:${scene.id}`,
        kind: "scene_observation",
        text,
        source: "scene_context",
        topics: this.extractTopics(text),
      },
    ];
  }

  private npcPublicFacts(
    context: Awaited<ReturnType<SceneContextService["assembleContext"]>>,
  ): MetaQueryAllowedFact[] {
    return (context.npcsPresent ?? []).map((npc) => {
      const tags = Array.isArray((npc as { tags?: string[] }).tags)
        ? (npc as { tags: string[] }).tags.filter((tag) =>
            tag.startsWith("public_hook:"),
          )
        : [];
      const text = [
        `NPC presente: ${npc.name}`,
        npc.title ? `título: ${npc.title}` : "",
        `disposição observável: ${npc.disposition}`,
        tags.length ? `ganchos públicos: ${tags.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      return {
        factId: `npc:${npc.id}`,
        kind: "npc_public" as const,
        text,
        source: "scene_npcs",
        topics: this.extractTopics([npc.id, npc.name, npc.title, ...tags].join(" ")),
      };
    });
  }

  private partyKnowledgeFacts(
    context: Awaited<ReturnType<SceneContextService["assembleContext"]>>,
  ): MetaQueryAllowedFact[] {
    return (context.partyKnowledge ?? []).map((fact, index) => {
      const text = fact.knowledgeValue
        ? `${fact.knowledgeKey}: ${fact.knowledgeValue}`
        : fact.knowledgeKey;
      return {
        factId: `party_knowledge:${index}:${fact.knowledgeKey}`,
        kind: "lore" as const,
        text,
        source: "party_knowledge",
        topics: this.extractTopics(text),
      };
    });
  }

  private async characterFacts(
    input: ResolveMetaQueryFactsInput,
  ): Promise<MetaQueryAllowedFact[]> {
    if (!input.characterId) return [];

    const sheet = await this.characterSheetService.computeSheet(
      input.userId,
      input.characterId,
    );
    const facts: MetaQueryAllowedFact[] = [];

    for (const skill of sheet.skills ?? []) {
      const proficiency = skill.proficient
        ? "proficiente"
        : "não proficiente, mas ainda pode tentar quando a ficção permitir";
      facts.push({
        factId: `pc_skill:${skill.slug}`,
        kind: "pc_capability",
        text: `Skill do PC: ${skill.name} (${proficiency}).`,
        source: "character_sheet",
        topics: this.extractTopics(`${skill.slug} ${skill.name} skill teste`),
      });
      const hint = SKILL_RULE_HINTS[skill.slug];
      if (hint) {
        facts.push({
          factId: `rule_skill:${skill.slug}`,
          kind: "rule_reference",
          text: hint,
          source: "srd_skill_reference",
          topics: this.extractTopics(`${skill.slug} ${skill.name} raw regra`),
        });
      }
    }

    facts.push({
      factId: `pc_passive_perception:${input.characterId}`,
      kind: "pc_capability",
      text: `Percepção passiva do PC está disponível como observação qualitativa (${this.qualitativePassive(sheet.passivePerception)}).`,
      source: "character_sheet",
      topics: ["perception", "percepcao", "passiva", "notar", "observar"],
    });

    return facts;
  }

  private async activatedLoreFacts(
    input: ResolveMetaQueryFactsInput,
  ): Promise<MetaQueryAllowedFact[]> {
    if (!input.session.campaignId) return [];
    const entries = await this.loreRepo.find({
      where: { campaignId: input.session.campaignId },
      order: { priority: "DESC", createdAt: "ASC" },
    });
    const normalizedQuestion = this.normalize(input.question);
    return entries
      .filter((entry) =>
        (entry.activationKeys ?? []).some((key) =>
          normalizedQuestion.includes(this.normalize(key)),
        ),
      )
      .slice(0, 6)
      .map((entry) => ({
        factId: `lore:${entry.id}`,
        kind: "lore" as const,
        text: `${entry.name}: ${entry.description.slice(0, 600)}`,
        source: "lorebook_activation",
        topics: this.extractTopics(
          `${entry.name} ${entry.activationKeys?.join(" ") ?? ""}`,
        ),
      }));
  }

  private uniqueFacts(facts: MetaQueryAllowedFact[]): MetaQueryAllowedFact[] {
    const seen = new Set<string>();
    const out: MetaQueryAllowedFact[] = [];
    for (const fact of facts) {
      const text = fact.text.trim();
      if (!text || seen.has(fact.factId)) continue;
      seen.add(fact.factId);
      out.push({ ...fact, text, topics: [...new Set(fact.topics)] });
    }
    return out.slice(0, 32);
  }

  private qualitativePassive(value: number | undefined): string {
    if ((value ?? 10) >= 15) return "alta";
    if ((value ?? 10) <= 9) return "baixa";
    return "normal";
  }

  private extractTopics(value: string): string[] {
    return this.normalize(value)
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9_:-]/g, ""))
      .filter((token) => token.length >= 3)
      .slice(0, 24);
  }

  private normalize(value: string): string {
    return (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }
}
