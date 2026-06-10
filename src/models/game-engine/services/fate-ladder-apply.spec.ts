import { FateLadderService } from "./fate-ladder.service";


describe("FateLadderService.applyResolution (spec 027)", () => {
  function setup(
    overrides: Partial<{
      initialState: {
        current_hp: number;
        max_hp_bonus: number;
        conditions: string[];
      };
      activeParticipant:
        | { id: string; dyingState: string; encounter?: { sessionId: string } }
        | null;
      session: { id: string; campaignId: string | null } | null;
    }> = {},
  ) {
    const initial = overrides.initialState ?? {
      current_hp: 0,
      max_hp_bonus: 0,
      conditions: [] as string[],
    };
    const stateRow: any = { ...initial };

    const stateRepo: any = {
      findOne: jest.fn().mockResolvedValue(stateRow),
      save: jest.fn().mockImplementation(async (s: any) => s),
    };

    const characterRepo: any = {};
    const campaignRepo: any = {};

    const activeParticipant =
      overrides.activeParticipant !== undefined
        ? overrides.activeParticipant
        : { id: "p-1", dyingState: "dying" };

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(activeParticipant),
    };
    const participantRepo: any = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn().mockImplementation(async (p: any) => p),
    };

    const session =
      overrides.session !== undefined
        ? overrides.session
        : { id: "sess-1", campaignId: "camp-1" };
    const sessionRepo: any = {
      findOne: jest.fn().mockResolvedValue(session),
    };
    const eventBus: any = {
      publish: jest.fn().mockImplementation(async (e: any) => e),
    };
    const envelopeFactory: any = {
      build: jest.fn().mockImplementation((input: any) => ({
        eventId: "evt-1",
        ...input,
      })),
    };

    const svc = new FateLadderService(
      characterRepo,
      stateRepo,
      campaignRepo,
      participantRepo,
      sessionRepo,
      eventBus,
      envelopeFactory,
    );
    return {
      svc,
      stateRepo,
      stateRow,
      participantRepo,
      activeParticipant,
      sessionRepo,
      eventBus,
      envelopeFactory,
    };
  }

  it("opção C (Pay Price): hp=1 + stable_unconscious + dyingState=stable", async () => {
    const { svc, stateRepo, stateRow, participantRepo, activeParticipant } =
      setup();

    const result = await svc.applyResolution("char-1", [
      "pc_hp=1",
      "pc_status=stable_unconscious",
      "wakes_next_round",
      "cost_applied=memory_loss",
    ]);

    expect(stateRow.current_hp).toBe(1);
    expect(stateRow.conditions).toContain("unconscious");
    expect(stateRow.conditions).not.toContain("dying");
    expect(stateRepo.save).toHaveBeenCalledTimes(1);


    expect(activeParticipant!.dyingState).toBe("stable");
    expect(participantRepo.save).toHaveBeenCalledTimes(1);


    expect(
      result.appliedChanges.find((a) => a.change === "pc_hp=1")?.applied,
    ).toBe(true);
    expect(
      result.appliedChanges.find(
        (a) => a.change === "pc_status=stable_unconscious",
      )?.applied,
    ).toBe(true);

    expect(
      result.appliedChanges.find((a) => a.change === "wakes_next_round")
        ?.applied,
    ).toBe(false);
    expect(
      result.appliedChanges.find((a) => a.change.startsWith("cost_applied="))
        ?.applied,
    ).toBe(false);

    expect(result.pcFinalState).toEqual({
      current_hp: 1,
      max_hp_bonus: 0,
      conditions: ["unconscious"],
      dyingState: "stable",
    });
  });

  it("opção A (Accept death): pc_status=dead_permanent → conditions=['dead'] + dyingState=dead", async () => {
    const { svc, stateRow, activeParticipant } = setup();

    await svc.applyResolution("char-1", [
      "arc_beat=CHANGE_forced",
      "trigger_epilogue_modal",
      "pc_status=dead_permanent",
    ]);

    expect(stateRow.conditions).toEqual(["dead"]);
    expect(activeParticipant!.dyingState).toBe("dead");
  });

  it("opção A (spec 052): dead_permanent publica quest_failed(isMainQuest) com sessionId", async () => {
    const { svc, eventBus, envelopeFactory } = setup();

    await svc.applyResolution(
      "char-1",
      ["arc_beat=CHANGE_forced", "trigger_epilogue_modal", "pc_status=dead_permanent"],
      { sessionId: "sess-1" },
    );

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const input = envelopeFactory.build.mock.calls[0][0];
    expect(input.eventCategory).toBe("NarrativeEvent");
    expect(input.eventType).toBe("quest_failed");
    expect(input.scope).toEqual({ campaignId: "camp-1", sessionId: "sess-1" });
    expect(input.payload).toMatchObject({
      sessionId: "sess-1",
      isMainQuest: true,
      questName: "Queda do herói",
      evidence: "Morte permanente do personagem.",
    });
  });

  it("opção A sem sessionId (nem encounter ativo): não publica quest_failed", async () => {
    const { svc, eventBus } = setup({ activeParticipant: null });

    await svc.applyResolution("char-1", ["pc_status=dead_permanent"]);

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("opção A usa sessionId do encounter ativo quando o caller não informa", async () => {
    const { svc, eventBus, envelopeFactory } = setup({
      activeParticipant: {
        id: "p-1",
        dyingState: "dying",
        encounter: { sessionId: "sess-enc" },
      },
    });

    await svc.applyResolution("char-1", ["pc_status=dead_permanent"]);

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const input = envelopeFactory.build.mock.calls[0][0];
    expect(input.scope.sessionId).toBe("sess-enc");
    expect(input.payload.sessionId).toBe("sess-enc");
  });

  it("opção C não publica quest_failed", async () => {
    const { svc, eventBus } = setup();

    await svc.applyResolution(
      "char-1",
      ["pc_hp=1", "pc_status=stable_unconscious"],
      { sessionId: "sess-1" },
    );

    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("opção D (Resurrection): hp=1 + alive limpa unconscious + dyingState=none", async () => {
    const { svc, stateRow, activeParticipant } = setup({
      initialState: {
        current_hp: 0,
        max_hp_bonus: 0,
        conditions: ["unconscious", "dying"],
      },
    });

    await svc.applyResolution("char-1", [
      "pc_hp=1",
      "pc_status=alive",
      "consume_diamond_component",
    ]);

    expect(stateRow.current_hp).toBe(1);
    expect(stateRow.conditions).not.toContain("unconscious");
    expect(stateRow.conditions).not.toContain("dying");
    expect(activeParticipant!.dyingState).toBe("none");
  });

  it("consume_diamond_component: log warn + applied=false (V1 não implementado)", async () => {
    const { svc } = setup();

    const result = await svc.applyResolution("char-1", [
      "pc_hp=1",
      "consume_diamond_component",
    ]);

    const diamond = result.appliedChanges.find(
      (a) => a.change === "consume_diamond_component",
    );
    expect(diamond?.applied).toBe(false);
    expect(diamond?.reason).toMatch(/diamond/i);
  });

  it("sem participant ativo: aplica state mas dyingState fica null", async () => {
    const { svc, stateRow, participantRepo } = setup({
      activeParticipant: null,
    });

    const result = await svc.applyResolution("char-1", ["pc_hp=1"]);

    expect(stateRow.current_hp).toBe(1);
    expect(participantRepo.save).not.toHaveBeenCalled();
    expect(result.pcFinalState.dyingState).toBeNull();
  });

  it("character_state ausente: lança erro descritivo", async () => {
    const stateRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const participantRepo: any = {};
    const svc = new FateLadderService(
      {} as any,
      stateRepo,
      {} as any,
      participantRepo,
      {} as any,
      { publish: jest.fn() } as any,
      { build: jest.fn() } as any,
    );

    await expect(svc.applyResolution("char-1", ["pc_hp=1"])).rejects.toThrow(
      /character_state.*char-1/,
    );
  });
});
