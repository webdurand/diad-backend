import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { CharacterStateService } from "src/models/characters/services/character-state.service";
import { GameEventData } from "../interfaces/result.type";


@Injectable()
export class InspirationService {
  constructor(
    @InjectRepository(EncounterParticipantEntity)
    private readonly participantRepo: Repository<EncounterParticipantEntity>,
    private readonly stateService: CharacterStateService,
  ) {}


  async isArmed(participantId: string): Promise<boolean> {
    const p = await this.participantRepo.findOne({
      where: { id: participantId },
      select: ["id", "inspirationArmed"],
    });
    return p?.inspirationArmed === true;
  }


  /**
   * `preloaded` evita a mesma classe de bug do `consumeBardicInspirationIfPresent`:
   * carregar uma SEGUNDA copia da linha e grava-la faz o save posterior do
   * caller (que ainda detem `inspirationArmed = true`) desfazer o consumo. Com a
   * entidade do caller a mutacao cai no objeto que ele ja vai persistir.
   */
  async consumeIfArmed(
    participantId: string,
    context: "attack_roll" | "saving_throw" | "ability_check",
    preloaded?: EncounterParticipantEntity,
  ): Promise<{ consumed: boolean; eventData?: GameEventData }> {
    const p =
      preloaded ??
      (await this.participantRepo.findOne({
        where: { id: participantId },
      }));
    if (!p || !p.inspirationArmed) return { consumed: false };

    p.inspirationArmed = false;
    if (!preloaded) await this.participantRepo.save(p);

    if (p.type === "pc" && p.characterId) {
      await this.stateService
        .setInspiration(p.characterId, false)
        .catch(() => null);
    }

    const eventData: GameEventData = {
      event_type: "inspiration_used",
      actor_participant_id: p.id,
      data: { context },
    };
    return { consumed: true, eventData };
  }
}
