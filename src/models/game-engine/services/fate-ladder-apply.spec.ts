import { FateLadderService } from "./fate-ladder.service";

/**
 * Spec 027 (M2 follow-up) — applyResolution traduz `stateChanges`
 * descritivos do `resolveLadder` em mutações reais no `character_state`.
 *
 * Sem isso, narrativa do turno seguinte mente sobre estado do PC
 * (ex: "você desperta com HP=1" mas current_hp=0 no DB).
 *
 * Tests cobrem cada string descritor mapeada e a sincronização de
 * `participant.dyingState` quando há encounter ativo.
 */
describe("FateLadderService.applyResolution (spec 027)", () => {
  function setup(
    overrides: Partial<{
      initialState: {
        current_hp: number;
        max_hp_bonus: number;
        conditions: string[];
      };
      activeParticipant: { id: string; dyingState: string } | null;
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
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(activeParticipant),
    };
    const participantRepo: any = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      save: jest.fn().mockImplementation(async (p: any) => p),
    };

    const svc = new FateLadderService(
      characterRepo,
      stateRepo,
      campaignRepo,
      participantRepo,
    );
    return { svc, stateRepo, stateRow, participantRepo, activeParticipant };
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

    // Participant.dyingState sincroniza com unconscious → stable.
    expect(activeParticipant!.dyingState).toBe("stable");
    expect(participantRepo.save).toHaveBeenCalledTimes(1);

    // appliedChanges marca quais strings foram aplicadas.
    expect(
      result.appliedChanges.find((a) => a.change === "pc_hp=1")?.applied,
    ).toBe(true);
    expect(
      result.appliedChanges.find(
        (a) => a.change === "pc_status=stable_unconscious",
      )?.applied,
    ).toBe(true);
    // Descritores narrativos: applied=false (consumo via Coordinator).
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
    );

    await expect(svc.applyResolution("char-1", ["pc_hp=1"])).rejects.toThrow(
      /character_state.*char-1/,
    );
  });
});
