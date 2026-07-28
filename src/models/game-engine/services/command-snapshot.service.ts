import { Injectable, Logger } from "@nestjs/common";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterService } from "./encounter.service";
import { EventService } from "./event.service";
import { PersistentAreaService } from "./persistent-area.service";
import {
  toEnrichedEncounterResponse,
  toTileEffectResponses,
  type EnrichedEncounterResponse,
} from "../dto/encounter-response.dto";
import { buildParticipantsMap, toEventResponseDto } from "../dto/event-response.dto";
import type { TurnInfo } from "../interfaces/combat.interfaces";

export interface CommandSnapshot {
  encounter: EnrichedEncounterResponse;
  turn: TurnInfo | null;
  events: unknown[];
  /** Versão monotônica usada para ordenar e deduplicar HTTP × WebSocket. */
  at: string;
}

const SNAPSHOT_EVENT_LIMIT = 200;

/**
 * Monta, em UMA passada, exatamente o estado que o frontend refazia com três
 * requests sequenciais depois de cada ação (`GET /encounters/:id` →
 * `GET .../events` + `GET .../turn`).
 *
 * O payload é provadamente independente de quem olha: `GET /encounters/:id` não
 * recebe `@Req()` e `toEnrichedEncounterResponse` é função pura da entidade —
 * não há fog-of-war nem campo exclusivo de DM. Por isso o mesmo objeto pode ir
 * na resposta do comando E no broadcast do encontro.
 *
 * `turn-actions` NÃO entra aqui de propósito: aquilo sim é por-espectador
 * (`combat.service.ts` passa o requester para `computeSheet` no caso do
 * Spiritual Weapon).
 */
@Injectable()
export class CommandSnapshotService {
  private readonly logger = new Logger(CommandSnapshotService.name);
  private lastSnapshotAtMs = 0;

  constructor(
    private readonly encounterService: EncounterService,
    private readonly persistentArea: PersistentAreaService,
    private readonly eventService: EventService,
  ) {}

  async build(encounterId: string): Promise<CommandSnapshot | null> {
    try {
      const [encounter, areas, events] = await Promise.all([
        this.encounterService.getById(encounterId, { withMonsters: true }),
        this.persistentArea.listByEncounter(encounterId),
        this.eventService.getLatestEncounterEvents(
          encounterId,
          SNAPSHOT_EVENT_LIMIT,
        ),
      ]);

      const participants = encounter.participants ?? [];
      const participantsMap = buildParticipantsMap(participants);

      return {
        encounter: toEnrichedEncounterResponse(encounter, {
          tileEffects: toTileEffectResponses(areas),
        }),
        turn: buildTurnInfo(encounterId, encounter, participants),
        events: events.map((event) =>
          toEventResponseDto(event, participantsMap),
        ),
        at: this.nextSnapshotAt(),
      };
    } catch (err) {
      // Snapshot é otimização: se falhar, o cliente cai no refetch de sempre.
      this.logger.warn("command_snapshot.build_failed", {
        "encounter.id": encounterId,
        "error.message": err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * O `at` também é a versão do snapshot no cliente. Date.now() sozinho pode
   * repetir o mesmo milissegundo em dois comandos consecutivos; avançar pelo
   * menos 1 ms torna a versão estritamente monotônica dentro deste processo.
   * O lock de comando já exige processo único, então a mesma invariante vale
   * para a ordenação dos snapshots.
   */
  private nextSnapshotAt(): string {
    const next = Math.max(Date.now(), this.lastSnapshotAtMs + 1);
    this.lastSnapshotAtMs = next;
    return new Date(next).toISOString();
  }
}

/**
 * Deriva o turno do encontro já carregado — zero query extra. Equivalente a
 * `CombatService.getCurrentTurn`, que fazia dois SELECTs para obter os mesmos
 * campos.
 */
function buildTurnInfo(
  encounterId: string,
  encounter: EncounterEntity,
  participants: EncounterParticipantEntity[],
): TurnInfo | null {
  if (encounter.status !== "active") return null;
  const turnOrder = encounter.turnOrder ?? [];
  const participantId = turnOrder[encounter.currentTurnIndex ?? 0];
  if (!participantId) return null;
  const participant = participants.find((p) => p.id === participantId);
  if (!participant) return null;

  return {
    encounterId,
    round: encounter.currentRound ?? 1,
    participantId: participant.id,
    participantName: participant.displayName,
    participantType: participant.type,
    isDefeated: participant.isDefeated,
    dyingState: participant.dyingState,
  };
}
