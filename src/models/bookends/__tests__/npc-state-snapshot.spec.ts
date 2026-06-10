import { selectAliveNpcIds } from "../domain/npc-state-snapshot";
import { NpcStateSnapshotService } from "../services/npc-state-snapshot.service";

describe("NpcStateSnapshot", () => {
  it("npcsAliveAtEndOfPhase ignora npcs com status='dead' e mantém compat deathStatus", () => {
    const alive = selectAliveNpcIds([
      { npcId: "11111111-1111-4111-8111-111111111111", deathStatus: "alive" },
      { npcId: "22222222-2222-4222-8222-222222222222", deathStatus: "dead" },
      { npcId: "33333333-3333-4333-8333-333333333333", status: "missing" },
      { npcId: "44444444-4444-4444-8444-444444444444", status: "dead" },
    ]);

    expect(alive).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("NpcStateSnapshotService consulta o campo real status e filtra mortos", async () => {
    const repo = {
      find: jest.fn(async () => [
        { npcId: "11111111-1111-4111-8111-111111111111", status: "alive" },
        { npcId: "22222222-2222-4222-8222-222222222222", status: "dead" },
      ]),
    };
    const service = new NpcStateSnapshotService(repo as any);

    const snapshot = await service.getSnapshot("session-1");

    expect(repo.find).toHaveBeenCalledWith({
      where: { gameSessionId: "session-1" },
      select: ["npcId", "status"],
    });
    expect(snapshot.npcsAliveAtEndOfPhase).toEqual([
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(snapshot.npcsDeadDuringPhase).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });
});
