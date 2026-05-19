import { NotFoundException } from "@nestjs/common";
import { SessionScopedWorldController } from "../session-scoped.controller";

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const LOCATION_ID = "44444444-4444-4444-8444-444444444444";

function makeController() {
  const sessionService = {
    ensureAccess: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      campaignId: "campaign-1",
      characterIds: ["pc-1", "pc-2"],
      lastSceneLocationId: LOCATION_ID,
      scenesAtCurrentLocation: 3,
    }),
  };
  const npcStateService = {
    listByLocation: jest.fn().mockResolvedValue([
      {
        npcId: "npc-ally",
        disposition: "friendly",
        posture: "uneasy",
        npc: { name: "Mira" },
      },
      {
        npcId: "npc-enemy",
        disposition: "hostile",
        posture: "drawing_weapon",
        npc: { name: "Guard" },
      },
      {
        npcId: "npc-witness",
        disposition: "neutral",
        posture: "peaceful",
        npc: { name: "Witness" },
      },
    ]),
    listBySession: jest.fn(),
  };
  const controller = new SessionScopedWorldController(
    sessionService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    npcStateService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    controller,
    sessionService,
    npcStateService,
  };
}

function request() {
  return { user: { id: USER_ID } } as never;
}

describe("SessionScopedWorldController.getStateSnapshot", () => {
  it("projeta participants, partySize, localização e npcPostureSnapshot", async () => {
    const { controller, npcStateService } = makeController();

    const result = await controller.getStateSnapshot(request(), SESSION_ID);

    expect(npcStateService.listByLocation).toHaveBeenCalledWith(
      SESSION_ID,
      LOCATION_ID,
    );
    expect(result).toMatchObject({
      lastSceneLocationId: LOCATION_ID,
      scenesAtCurrentLocation: 3,
      partySize: 2,
      npcPostureSnapshot: {
        "npc-ally": "uneasy",
        "npc-enemy": "drawing_weapon",
        "npc-witness": "peaceful",
      },
    });
    expect(result.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "pc-1", role: "pc" }),
        expect.objectContaining({ id: "pc-2", role: "pc" }),
        expect.objectContaining({
          id: "npc-ally",
          role: "ally_npc",
          name: "Mira",
        }),
        expect.objectContaining({
          id: "npc-enemy",
          role: "enemy",
          posture: "drawing_weapon",
        }),
        expect.objectContaining({ id: "npc-witness", role: "witness" }),
      ]),
    );
  });

  it("propaga 404 quando sessão não existe", async () => {
    const { controller, sessionService } = makeController();
    sessionService.ensureAccess.mockRejectedValue(
      new NotFoundException("Sessao nao encontrada."),
    );

    await expect(
      controller.getStateSnapshot(request(), SESSION_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
