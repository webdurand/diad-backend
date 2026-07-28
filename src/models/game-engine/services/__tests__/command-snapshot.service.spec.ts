import { CommandSnapshotService } from "../command-snapshot.service";
import type { EncounterService } from "../encounter.service";
import type { EventService } from "../event.service";
import type { PersistentAreaService } from "../persistent-area.service";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

function participant(
  over: Partial<EncounterParticipantEntity>,
): EncounterParticipantEntity {
  return {
    id: "p1",
    displayName: "Theron",
    type: "pc",
    isDefeated: false,
    dyingState: "none",
    ...over,
  } as EncounterParticipantEntity;
}

function encounter(over: Partial<EncounterEntity> = {}): EncounterEntity {
  return {
    id: "enc-1",
    sessionId: "sess-1",
    name: "Emboscada",
    status: "active",
    turnOrder: ["p1", "p2"],
    currentTurnIndex: 0,
    currentRound: 3,
    participants: [
      participant({ id: "p1", displayName: "Theron" }),
      participant({ id: "p2", displayName: "Goblin", type: "monster" }),
    ],
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-07-27T00:00:00.000Z"),
    ...over,
  } as EncounterEntity;
}

function build(enc: EncounterEntity = encounter()): {
  service: CommandSnapshotService;
  encounterService: { getById: jest.Mock };
  persistentArea: { listByEncounter: jest.Mock };
  eventService: { getEncounterTimelineFiltered: jest.Mock };
} {
  const encounterService = { getById: jest.fn().mockResolvedValue(enc) };
  const persistentArea = { listByEncounter: jest.fn().mockResolvedValue([]) };
  const eventService = {
    getEncounterTimelineFiltered: jest
      .fn()
      .mockResolvedValue({ events: [], total: 0 }),
  };

  return {
    service: new CommandSnapshotService(
      encounterService as unknown as EncounterService,
      persistentArea as unknown as PersistentAreaService,
      eventService as unknown as EventService,
    ),
    encounterService,
    persistentArea,
    eventService,
  };
}

describe("CommandSnapshotService", () => {
  it("monta encounter, turno e eventos em uma passada", async () => {
    const { service, encounterService, persistentArea, eventService } = build();

    const snapshot = await service.build("enc-1");

    expect(snapshot).not.toBeNull();
    expect(snapshot!.encounter.id).toBe("enc-1");
    expect(snapshot!.encounter.participants).toHaveLength(2);
    expect(snapshot!.events).toEqual([]);

    // Uma leitura de encontro, uma de áreas, uma de timeline. Nada mais.
    expect(encounterService.getById).toHaveBeenCalledTimes(1);
    expect(encounterService.getById).toHaveBeenCalledWith("enc-1", {
      withMonsters: true,
    });
    expect(persistentArea.listByEncounter).toHaveBeenCalledTimes(1);
    expect(eventService.getEncounterTimelineFiltered).toHaveBeenCalledTimes(1);
  });

  it("emite currentTurnIndex e currentRound, que o frontend lê e antes vinham undefined", async () => {
    const { service } = build(
      encounter({ currentTurnIndex: 1, currentRound: 5 }),
    );

    const snapshot = await service.build("enc-1");

    expect(snapshot!.encounter.currentTurnIndex).toBe(1);
    expect(snapshot!.encounter.currentRound).toBe(5);
    expect(snapshot!.encounter.currentTurnParticipantId).toBe("p2");
  });

  it("deriva o turno do encontro já carregado, sem query extra", async () => {
    const { service } = build(encounter({ currentTurnIndex: 1 }));

    const snapshot = await service.build("enc-1");

    expect(snapshot!.turn).toEqual({
      encounterId: "enc-1",
      round: 3,
      participantId: "p2",
      participantName: "Goblin",
      participantType: "monster",
      isDefeated: false,
      dyingState: "none",
    });
  });

  it("turno é null quando o encontro não está ativo", async () => {
    const { service } = build(encounter({ status: "preparing" }));

    const snapshot = await service.build("enc-1");

    expect(snapshot!.turn).toBeNull();
  });

  it("turno é null quando o participante do turno não existe mais", async () => {
    const { service } = build(
      encounter({ turnOrder: ["fantasma"], currentTurnIndex: 0 }),
    );

    const snapshot = await service.build("enc-1");

    expect(snapshot!.turn).toBeNull();
  });

  it("degrada para null quando a leitura falha, em vez de derrubar o comando", async () => {
    const { service, encounterService } = build();
    encounterService.getById.mockRejectedValue(new Error("db caiu"));

    await expect(service.build("enc-1")).resolves.toBeNull();
  });
});
