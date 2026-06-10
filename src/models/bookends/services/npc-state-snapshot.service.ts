import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SessionNpcStateEntity } from "src/entities/session-npc-state.entity";
import type { NpcStateSnapshot } from "../domain/bookend.types";
import { selectAliveNpcIds, selectDeadNpcIds } from "../domain/npc-state-snapshot";

@Injectable()
export class NpcStateSnapshotService {
  constructor(
    @InjectRepository(SessionNpcStateEntity)
    private readonly npcStateRepo: Repository<SessionNpcStateEntity>,
  ) {}

  async getSnapshot(sessionId: string): Promise<NpcStateSnapshot> {
    const states = await this.npcStateRepo.find({
      where: { gameSessionId: sessionId },
      select: ["npcId", "status"],
    });

    return {
      npcsAliveAtEndOfPhase: selectAliveNpcIds(states),
      npcsDeadDuringPhase: selectDeadNpcIds(states),
    };
  }
}
