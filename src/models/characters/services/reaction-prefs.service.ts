import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CharacterEntity,
  CharacterClassEntity,
  CharacterStateEntity,
  CampaignPartyMemberEntity,
  ReactionDefaultEntity,
} from "src/entities";
import type { ReactionState } from "src/entities/reaction-default.entity";
import {
  ensureCharacterReadAccess,
  ensureCharacterWriteAccess,
  getCharacterState,
} from "src/shared/character-guard";


export interface ReactionPrefEntry {
  reactionName: string;
  state: ReactionState;
  consumesSpellSlot: boolean;
  description?: string;
  source: "default" | "override";
}

@Injectable()
export class ReactionPrefsService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(CampaignPartyMemberEntity)
    private readonly partyMemberRepo: Repository<CampaignPartyMemberEntity>,
    @InjectRepository(CharacterClassEntity)
    private readonly charClassRepo: Repository<CharacterClassEntity>,
    @InjectRepository(CharacterStateEntity)
    private readonly stateRepo: Repository<CharacterStateEntity>,
    @InjectRepository(ReactionDefaultEntity)
    private readonly reactionDefaultRepo: Repository<ReactionDefaultEntity>,
  ) {}

  async getPrefs(
    userId: string,
    characterId: string,
  ): Promise<ReactionPrefEntry[]> {
    await ensureCharacterReadAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
    );
    const state = await getCharacterState(this.stateRepo, characterId);
    const overrides = (state.reaction_prefs ?? {}) as Record<
      string,
      ReactionState
    >;

    const charClasses = await this.charClassRepo.find({
      where: { character_id: characterId } as any,
      relations: ["class"],
    });
    const slugs = charClasses
      .map((c: any) => c.class?.slug)
      .filter((s: unknown): s is string => typeof s === "string");

    const defaults = slugs.length
      ? await this.reactionDefaultRepo
          .createQueryBuilder("rd")
          .where("rd.classSlug IN (:...slugs)", { slugs })
          .getMany()
      : [];

    const seen = new Set<string>();
    const merged: ReactionPrefEntry[] = [];
    for (const d of defaults) {
      seen.add(d.reactionName);
      const overridden = overrides[d.reactionName];
      merged.push({
        reactionName: d.reactionName,
        state: overridden ?? d.defaultState,
        consumesSpellSlot: d.consumesSpellSlot,
        description: d.description,
        source: overridden ? "override" : "default",
      });
    }

    for (const [name, state] of Object.entries(overrides)) {
      if (seen.has(name)) continue;
      merged.push({
        reactionName: name,
        state,
        consumesSpellSlot: false,
        source: "override",
      });
    }
    return merged;
  }

  async setPref(
    userId: string,
    characterId: string,
    reactionName: string,
    state: ReactionState,
  ): Promise<{ ok: true; reactionName: string; state: ReactionState }> {
    if (!["auto", "ask", "off"].includes(state)) {
      throw new NotFoundException(
        `Estado de reaction inválido: "${state}". Use auto|ask|off.`,
      );
    }
    await ensureCharacterWriteAccess(
      this.characterRepo,
      userId,
      characterId,
      this.partyMemberRepo,
    );
    const stateRow = await getCharacterState(this.stateRepo, characterId);
    const prefs = (stateRow.reaction_prefs ?? {}) as Record<
      string,
      ReactionState
    >;
    prefs[reactionName] = state;
    stateRow.reaction_prefs = prefs;
    await this.stateRepo.save(stateRow);
    return { ok: true, reactionName, state };
  }
}
