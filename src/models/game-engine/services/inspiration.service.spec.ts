import { InspirationService } from "./inspiration.service";


describe("InspirationService", () => {
  function setup(
    overrides: Partial<{
      armed: boolean;
      type: "pc" | "monster";
      characterId: string | null;
    }> = {},
  ) {
    const participant = {
      id: "p1",
      inspirationArmed: overrides.armed ?? false,
      type: overrides.type ?? "pc",
      characterId:
        overrides.characterId === undefined ? "char-1" : overrides.characterId,
    };
    const findOne = jest.fn().mockResolvedValue({ ...participant });
    const save = jest.fn().mockImplementation(async (p: any) => p);
    const setInspiration = jest.fn().mockResolvedValue({ inspiration: false });
    const svc = new InspirationService(
      { findOne, save } as any,
      { setInspiration } as any,
    );
    return { svc, findOne, save, setInspiration };
  }

  it("consumeIfArmed → consumed=false quando flag está falsa", async () => {
    const { svc, save, setInspiration } = setup({ armed: false });
    const r = await svc.consumeIfArmed("p1", "attack_roll");
    expect(r.consumed).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(setInspiration).not.toHaveBeenCalled();
  });

  it("consumeIfArmed → reseta flag + zera ficha + retorna evento quando armed", async () => {
    const { svc, save, setInspiration } = setup({ armed: true });
    const r = await svc.consumeIfArmed("p1", "attack_roll");
    expect(r.consumed).toBe(true);
    expect(r.eventData).toMatchObject({
      event_type: "inspiration_used",
      actor_participant_id: "p1",
      data: { context: "attack_roll" },
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].inspirationArmed).toBe(false);
    expect(setInspiration).toHaveBeenCalledWith("char-1", false);
  });

  it("consumeIfArmed → context vira saving_throw / ability_check no evento", async () => {
    const { svc: svc1 } = setup({ armed: true });
    const r1 = await svc1.consumeIfArmed("p1", "saving_throw");
    expect((r1.eventData?.data as any).context).toBe("saving_throw");

    const { svc: svc2 } = setup({ armed: true });
    const r2 = await svc2.consumeIfArmed("p1", "ability_check");
    expect((r2.eventData?.data as any).context).toBe("ability_check");
  });

  it("consumeIfArmed em monster → não chama setInspiration (não tem ficha)", async () => {
    const { svc, setInspiration } = setup({
      armed: true,
      type: "monster",
      characterId: null,
    });
    const r = await svc.consumeIfArmed("p1", "attack_roll");
    expect(r.consumed).toBe(true);
    expect(setInspiration).not.toHaveBeenCalled();
  });

  it("isArmed retorna o valor atual da flag", async () => {
    const { svc } = setup({ armed: true });
    expect(await svc.isArmed("p1")).toBe(true);
    const { svc: svc2 } = setup({ armed: false });
    expect(await svc2.isArmed("p2")).toBe(false);
  });

  it("participant ausente → consumeIfArmed retorna consumed=false", async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const save = jest.fn();
    const setInspiration = jest.fn();
    const svc = new InspirationService(
      { findOne, save } as any,
      { setInspiration } as any,
    );
    const r = await svc.consumeIfArmed("nope", "attack_roll");
    expect(r.consumed).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
