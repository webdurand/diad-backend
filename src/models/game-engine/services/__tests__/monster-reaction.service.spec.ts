import { MonsterReactionService } from "../monster-reaction.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

const MON_ID = "11111111-1111-4111-8111-111111111111";

function makeTarget(
  overrides: Partial<EncounterParticipantEntity> = {},
): EncounterParticipantEntity {
  return {
    id: MON_ID,
    type: "monster",
    isDefeated: false,
    dyingState: "none",
    reactionsUsed: 0,
    monster: {
      reactions: [
        {
          name: "Parry",
          desc: "The captain adds 2 to its AC against one melee attack that would hit it.",
        },
      ],
    },
    ...overrides,
  } as unknown as EncounterParticipantEntity;
}

function makeService() {
  const repo = {
    save: jest.fn(async (e: any) => e),
  } as any;
  return new MonsterReactionService(repo);
}

describe("MonsterReactionService.tryParryAfterAttackRoll", () => {
  it("retorna null se ataque é ranged", async () => {
    const svc = makeService();
    const target = makeTarget();
    const res = await svc.tryParryAfterAttackRoll(target, 18, false, 16);
    expect(res).toBeNull();
  });

  it("retorna null se target é PC", async () => {
    const svc = makeService();
    const target = makeTarget({ type: "pc" } as any);
    const res = await svc.tryParryAfterAttackRoll(target, 18, true, 16);
    expect(res).toBeNull();
  });

  it("retorna null se reactionsUsed >= 1", async () => {
    const svc = makeService();
    const target = makeTarget({ reactionsUsed: 1 });
    const res = await svc.tryParryAfterAttackRoll(target, 18, true, 16);
    expect(res).toBeNull();
  });

  it("retorna null se target não tem Parry nas reactions", async () => {
    const svc = makeService();
    const target = makeTarget({
      monster: { reactions: [{ name: "Other Reaction", desc: "..." }] } as any,
    });
    const res = await svc.tryParryAfterAttackRoll(target, 18, true, 16);
    expect(res).toBeNull();
  });

  it("aplica Parry: hit marginal vira miss", async () => {
    const svc = makeService();
    const target = makeTarget();

    const res = await svc.tryParryAfterAttackRoll(target, 17, true, 16);
    expect(res).not.toBeNull();
    expect(res!.bonus).toBe(2);
    expect(res!.newAc).toBe(18);
    expect(res!.hitAfter).toBe(false);
    expect(target.reactionsUsed).toBe(1);
    expect(res!.events[0].event_type).toBe("reaction_used");
  });

  it("Parry consome reaction mesmo se ataque ainda acerta", async () => {
    const svc = makeService();
    const target = makeTarget();

    const res = await svc.tryParryAfterAttackRoll(target, 20, true, 16);
    expect(res).not.toBeNull();
    expect(res!.hitAfter).toBe(true);
    expect(target.reactionsUsed).toBe(1);
  });

  it("parser regex pega bonus alto (Aurelia +7)", async () => {
    const svc = makeService();
    const target = makeTarget({
      monster: {
        reactions: [
          {
            name: "Parry",
            desc: "Aurelia adds 7 to her AC against one melee attack that would hit her.",
          },
        ],
      } as any,
    });
    const res = await svc.tryParryAfterAttackRoll(target, 20, true, 18);
    expect(res!.bonus).toBe(7);
  });

  it("retorna null se monstro derrotado", async () => {
    const svc = makeService();
    const target = makeTarget({ isDefeated: true });
    const res = await svc.tryParryAfterAttackRoll(target, 18, true, 16);
    expect(res).toBeNull();
  });
});
