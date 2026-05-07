import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import type { GameEventData } from "../interfaces/result.type";

/**
 * Reactions de monstros — RAW MM/XPHB.
 *
 * V1: Parry (adds X to AC against one melee attack).
 * V2 deferido: Counterspell, Shield, OA auto-resolve via Reaction Broker.
 *
 * Parry pattern em statblock: `reactions: [{ name: "Parry", desc: "Monster adds N to its AC against one melee attack..." }]`.
 * O bonus N é parseado da descrição via regex.
 */
@Injectable()
export class MonsterReactionService {
  private readonly logger = new Logger(MonsterReactionService.name);

  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participants: Repository<EncounterParticipantEntity>,
  ) {}

  /**
   * Testa se a Parry deve disparar contra um ataque corpo-a-corpo que iria acertar.
   *
   * Retorna:
   *  - `null` se Parry não aplica (sem reação, sem reaction disponível, ranged, etc)
   *  - `{ newAc, bonus, events, hitAfter }` se Parry foi consumida.
   *    `hitAfter=false` significa que o ataque virou miss; caller deve abortar damage.
   *
   * Side effect: persiste `reactionsUsed=1` no target quando consome.
   */
  async tryParryAfterAttackRoll(
    target: EncounterParticipantEntity,
    attackTotal: number,
    isMelee: boolean,
    currentAc: number,
  ): Promise<{
    newAc: number;
    bonus: number;
    events: GameEventData[];
    hitAfter: boolean;
  } | null> {
    if (!isMelee) return null;
    if (target.type !== "monster") return null;
    if (target.isDefeated || target.dyingState === "dead") return null;
    if ((target.reactionsUsed ?? 0) > 0) return null;
    if (!target.monster) return null;

    const reactions = target.monster.reactions;
    const list = Array.isArray(reactions)
      ? reactions
      : reactions && typeof reactions === "object"
        ? (Object.values(reactions as Record<string, unknown>) as Array<unknown>)
        : [];

    let parryBonus = 0;
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      const rec = r as { name?: string; desc?: string; description?: string };
      if (!rec.name || !/parry/i.test(rec.name)) continue;
      const text = rec.desc ?? rec.description ?? "";
      const match = text.match(/adds?\s+(\d+)\s+to\s+(?:its|her|his|the)?\s*AC/i);
      if (match) {
        parryBonus = parseInt(match[1], 10);
        break;
      }
    }
    if (parryBonus <= 0) return null;

    const newAc = currentAc + parryBonus;
    const wouldStillHit = attackTotal >= newAc;

    target.reactionsUsed = (target.reactionsUsed ?? 0) + 1;
    await this.participants.save(target);

    const events: GameEventData[] = [
      {
        event_type: "reaction_used",
        actor_participant_id: target.id,
        data: {
          reactionName: "Parry",
          bonus: parryBonus,
          attackTotal,
          originalAc: currentAc,
          newAc,
          turnedToMiss: !wouldStillHit,
        },
      },
    ];
    this.logger.log(
      `parry monsterId=${target.id} attack=${attackTotal} ac=${currentAc} bonus=${parryBonus} turnedToMiss=${!wouldStillHit}`,
    );
    return {
      newAc,
      bonus: parryBonus,
      events,
      hitAfter: wouldStillHit,
    };
  }
}
