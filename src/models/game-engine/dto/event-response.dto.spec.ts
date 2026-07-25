import { GameEventEntity } from "src/entities/game-event.entity";
import { toEventResponseDto } from "./event-response.dto";

describe("toEventResponseDto — nomes históricos", () => {
  it("preserva o nome gravado mesmo que o participante mude de forma", () => {
    const event = {
      id: "event-1",
      sessionId: "session-1",
      encounterId: "encounter-1",
      sequence: 1,
      eventType: "spell_cast",
      actorParticipantId: "druid-1",
      data: {
        actorName: "Druida Elowen",
        spellName: "Heal",
        slotLevel: 6,
      },
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
    } as GameEventEntity;

    const dto = toEventResponseDto(
      event,
      new Map([["druid-1", "Giant Scorpion"]]),
    );

    expect(dto.actorName).toBe("Druida Elowen");
    expect(dto.description).toContain("Druida Elowen");
  });

  it("usa o nome atual como fallback para eventos legados", () => {
    const event = {
      id: "event-2",
      sessionId: "session-1",
      encounterId: "encounter-1",
      sequence: 2,
      eventType: "turn_start",
      actorParticipantId: "druid-1",
      data: { round: 2 },
      createdAt: new Date("2026-07-25T00:01:00.000Z"),
    } as GameEventEntity;

    expect(
      toEventResponseDto(
        event,
        new Map([["druid-1", "Giant Scorpion"]]),
      ).actorName,
    ).toBe("Giant Scorpion");
  });
});
