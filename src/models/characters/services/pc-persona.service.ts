import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterEquipmentEntity,
  CharacterMagicItemEntity,
  CharacterStateEntity,
  CharacterLevelUpEntity,
  CharacterAbilityScoreEntity,
  CharacterOriginEntity,
} from "src/entities";
import { getAbilityModifier } from "src/shared/srd-utils";
import {
  PCPersona,
  PCPersonaAlignment,
  PCPersonaEquipmentItem,
  PCPersonaPersonality,
  PERSONA_BACKSTORY_CHAR_CAP,
  PERSONA_KEY_EQUIPMENT_CAP,
} from "../dto/pc-persona.dto";

const PERSONA_FIELDS = ["trait", "ideal", "bond", "flaw", "backstory"] as const;

const VALID_ALIGNMENTS = new Set<PCPersonaAlignment>([
  "lawful-good",
  "neutral-good",
  "chaotic-good",
  "lawful-neutral",
  "true-neutral",
  "chaotic-neutral",
  "lawful-evil",
  "neutral-evil",
  "chaotic-evil",
  "unaligned",
]);

/**
 * Spec 018 — assemblePersona(characterId).
 *
 * Monta o bloco enxuto de persona consumido pelo DM Agent (Director/Narrator)
 * e injetado em `SceneContext.playerCharacter`. Lê apenas o necessário —
 * race/class/level/background/alignment do origin, personality jsonb (tolera
 * chaves canônicas + customs), HP percent + conditions ativas, e top-5
 * itens narrativos (arma equipada + armadura + atunidos).
 *
 * NÃO retorna a ficha completa — pra mecânica detalhada o agente segue
 * usando `get_character_sheet`/`get_available_actions`.
 *
 * Princípio X v1.4.0 — primeiro consumo direto da cláusula "PC personality
 * é cross-domain capability" via injeção em scene context base.
 */
@Injectable()
export class PcPersonaService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterAbilityScoreEntity)
    private readonly charAbilityRepo: Repository<CharacterAbilityScoreEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly charStateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(CharacterLevelUpEntity)
    private readonly charLevelUpRepo: Repository<CharacterLevelUpEntity>,
    @InjectRepository(CharacterEquipmentEntity)
    private readonly charEquipRepo: Repository<CharacterEquipmentEntity>,
    @InjectRepository(CharacterMagicItemEntity)
    private readonly charMagicItemRepo: Repository<CharacterMagicItemEntity>,
    @InjectRepository(CharacterOriginEntity)
    private readonly charOriginRepo: Repository<CharacterOriginEntity>,
  ) {}

  /**
   * Resolve persona pra um character. Faz ownership check via userId quando
   * fornecido. `userId=null` permite acesso interno (SceneContext expansion
   * em fluxo já autenticado pelo SessionController guard).
   */
  async assemblePersona(
    characterId: string,
    userId: string | null,
  ): Promise<PCPersona> {
    const where = userId ? { id: characterId, userId } : { id: characterId };
    const character = await this.characterRepo.findOne({ where });
    if (!character) {
      throw new NotFoundException("Personagem nao encontrado.");
    }

    const [
      charOrigin,
      charClasses,
      charAbilities,
      charState,
      charLevelUps,
      charEquip,
      charMagicItems,
    ] = await Promise.all([
      this.charOriginRepo.findOne({
        where: { character_id: characterId },
      }),
      this.charClassRepo.find({
        where: { character_id: characterId },
        order: { order: "ASC" },
      }),
      this.charAbilityRepo.find({
        where: { character_id: characterId },
      }),
      this.charStateRepo.findOne({
        where: { character_id: characterId },
      }),
      this.charLevelUpRepo.find({
        where: { character_id: characterId },
        order: { total_level: "ASC" },
      }),
      this.charEquipRepo.find({
        where: { character_id: characterId },
      }),
      this.charMagicItemRepo.find({
        where: { character_id: characterId },
      }),
    ]);

    if (!charOrigin) {
      throw new NotFoundException(
        "Dados de origem do personagem nao encontrados.",
      );
    }

    const totalLevel =
      charClasses.reduce((sum, cc) => sum + cc.class_level, 0) || 1;
    const conMod = computeConModifier(charAbilities);
    const primaryClass = charClasses[0];
    const maxHp = computeMaxHp({
      primaryClassHitDie: primaryClass?.class.hit_die,
      conMod,
      levelUps: charLevelUps,
      maxHpBonus: charState?.max_hp_bonus ?? 0,
    });
    const currentHp = charState?.current_hp ?? maxHp;
    const currentHpPercent = computeHpPercent(currentHp, maxHp);

    const personality = mapPersonality(charOrigin.personality);
    const alignment = resolveAlignment(charOrigin.alignment?.slug);

    return {
      characterId: character.id,
      name: character.name,
      race: charOrigin.race?.name ?? charOrigin.race?.slug ?? "Unknown",
      subrace: charOrigin.subrace?.name ?? null,
      class: primaryClass?.class?.name ?? primaryClass?.class?.slug ?? "Unknown",
      subclass: primaryClass?.subclass?.name ?? null,
      level: totalLevel,
      background:
        charOrigin.background?.name ?? charOrigin.background?.slug ?? "Unknown",
      alignment,
      personality,
      currentHpPercent,
      conditionsActive: Array.isArray(charState?.conditions)
        ? [...(charState!.conditions as string[])]
        : [],
      keyEquipmentSummary: pickKeyEquipment(charEquip, charMagicItems),
    };
  }
}

function computeConModifier(
  abilities: CharacterAbilityScoreEntity[],
): number {
  const con = abilities.find((a) => a.ability_score?.slug === "con");
  if (!con) return 0;
  return getAbilityModifier(con.base_score + (con.bonus ?? 0));
}

function computeMaxHp(input: {
  primaryClassHitDie: number | undefined;
  conMod: number;
  levelUps: CharacterLevelUpEntity[];
  maxHpBonus: number;
}): number {
  const baseHitDie = input.primaryClassHitDie ?? 10;
  let total = baseHitDie + input.conMod;
  for (const lu of input.levelUps) {
    total += lu.hp_gained;
  }
  total += input.maxHpBonus;
  return Math.max(1, total);
}

function computeHpPercent(currentHp: number, maxHp: number): number {
  if (!maxHp || maxHp <= 0) return 0;
  const pct = Math.round((currentHp / maxHp) * 100);
  return Math.max(0, Math.min(100, pct));
}

function mapPersonality(
  raw: Record<string, string> | null | undefined,
): PCPersonaPersonality {
  if (!raw || typeof raw !== "object") return {};
  const out: PCPersonaPersonality = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (key === "backstory") {
      out.backstory = truncate(trimmed, PERSONA_BACKSTORY_CHAR_CAP);
      continue;
    }
    if ((PERSONA_FIELDS as readonly string[]).includes(key)) {
      out[key as keyof PCPersonaPersonality] = trimmed;
      continue;
    }
    // Customs preservados como additionalProperties (schema permite).
    out[key] = trimmed;
  }
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function resolveAlignment(slug: string | undefined): PCPersonaAlignment {
  if (slug && VALID_ALIGNMENTS.has(slug as PCPersonaAlignment)) {
    return slug as PCPersonaAlignment;
  }
  return "unaligned";
}

interface EquipRow {
  equipped: boolean;
  equipment?: { slug: string; name: string; armor_class?: unknown; weapon_category?: string | null };
}

function pickKeyEquipment(
  charEquip: CharacterEquipmentEntity[],
  charMagicItems: CharacterMagicItemEntity[],
): PCPersonaEquipmentItem[] {
  const out: PCPersonaEquipmentItem[] = [];

  for (const ce of charEquip as unknown as EquipRow[]) {
    if (!ce.equipped || !ce.equipment) continue;
    const eq = ce.equipment;
    const slug = (eq.slug ?? "").toLowerCase();
    const name = eq.name ?? eq.slug;
    let kind: PCPersonaEquipmentItem["kind"] = "other";
    if (slug === "shield" || (name ?? "").toLowerCase() === "shield") {
      kind = "shield";
    } else if (
      eq.armor_class &&
      typeof eq.armor_class === "object" &&
      Object.keys(eq.armor_class as Record<string, unknown>).length > 0
    ) {
      kind = "armor";
    } else if (eq.weapon_category) {
      kind = "weapon";
    }
    out.push({ slug, name, kind, attuned: false });
    if (out.length >= PERSONA_KEY_EQUIPMENT_CAP) return out;
  }

  for (const cmi of charMagicItems) {
    if (!cmi.attuned) continue;
    const item = cmi.magic_item;
    if (!item) continue;
    out.push({
      slug: (item.slug ?? "").toLowerCase(),
      name: item.name ?? item.slug,
      kind: "magic-item",
      attuned: true,
    });
    if (out.length >= PERSONA_KEY_EQUIPMENT_CAP) return out;
  }

  return out;
}
