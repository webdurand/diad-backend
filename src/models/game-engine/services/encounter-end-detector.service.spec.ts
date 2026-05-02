import { EncounterEndDetectorService } from "./encounter-end-detector.service";

/**
 * Spec 027 (M2 follow-up) — auto-end de combate solo com cálculo de XP +
 * loot transient via LootRollService. Tests cobrem o fluxo completo:
 *  - Vitória: soma XP, escolhe CR band, chama LootRollService, monta payload
 *    com xpRewards.equal-split + goldRewards e chama resolveEncounter.
 *  - Loot falhou: XP ainda aplicado (best-effort).
 *  - Derrota: só `{ outcome: 'defeat' }`, sem XP nem loot.
 *  - Multiplayer (≥2 user_ids): tryAutoEnd retorna null (DM humano resolve).
 */
describe("EncounterEndDetectorService — auto-end + rewards (spec 027)", () => {
  const ENCOUNTER_ID = "enc-1";
  const SESSION_ID = "ses-1";
  const CAMPAIGN_ID = "cmp-1";

  function setup(
    overrides: Partial<{
      encounterStatus: "active" | "completed";
      distinctUsers: number;
      participants: any[];
      lootResult: any | Error;
    }> = {},
  ) {
    const encounter = {
      id: ENCOUNTER_ID,
      status: overrides.encounterStatus ?? "active",
      sessionId: SESSION_ID,
    };

    const encounterRepo: any = {
      findOne: jest.fn().mockResolvedValue(encounter),
    };

    const participantRepo: any = {
      find: jest.fn().mockResolvedValue(overrides.participants ?? []),
    };

    const sessionRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        campaignId: CAMPAIGN_ID,
      }),
    };

    const campaignPlayerRepo: any = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest
          .fn()
          .mockResolvedValue({ n: String(overrides.distinctUsers ?? 1) }),
      }),
    };

    const encounterService: any = {
      resolveEncounter: jest.fn().mockResolvedValue({ ok: true, value: {} }),
    };

    const lootRollService: any = {
      roll: jest.fn().mockImplementation(async () => {
        if (overrides.lootResult instanceof Error) {
          throw overrides.lootResult;
        }
        return (
          overrides.lootResult ?? {
            lootTableId: null,
            items: [],
            currency: { cp: 0, sp: 0, gp: 25, pp: 0 },
            awarded: false,
          }
        );
      }),
    };

    const svc = new EncounterEndDetectorService(
      encounterRepo,
      participantRepo,
      sessionRepo,
      campaignPlayerRepo,
      encounterService,
      lootRollService,
    );

    return {
      svc,
      encounterRepo,
      participantRepo,
      sessionRepo,
      campaignPlayerRepo,
      encounterService,
      lootRollService,
    };
  }

  function pcParticipant(opts: { dyingState?: string; characterId?: string } = {}) {
    return {
      type: "pc",
      controlledBy: "pc",
      faction: "ally",
      characterId: opts.characterId ?? "char-1",
      dyingState: opts.dyingState ?? "none",
      currentHp: 10,
      maxHp: 20,
      isDefeated: false,
      monster: null,
    };
  }

  function monsterParticipant(opts: {
    xp: number;
    cr: number;
    defeated?: boolean;
  }) {
    return {
      type: "monster",
      controlledBy: "ai",
      faction: "enemy",
      currentHp: opts.defeated ? 0 : 10,
      isDefeated: opts.defeated ?? false,
      monster: {
        xp: opts.xp,
        challenge_rating: opts.cr,
        slug: `mon-cr${opts.cr}`,
      },
      displayName: `Monstro CR${opts.cr}`,
    };
  }

  it("vitória solo: soma XP + escolhe CR band + monta payload com gold", async () => {
    const { svc, encounterService, lootRollService } = setup({
      participants: [
        pcParticipant(),
        monsterParticipant({ xp: 50, cr: 1, defeated: true }),
        monsterParticipant({ xp: 100, cr: 3, defeated: true }),
      ],
      lootResult: {
        lootTableId: null,
        items: [],
        currency: { cp: 0, sp: 0, gp: 30, pp: 0 },
        awarded: false,
      },
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBe("victory");
    expect(lootRollService.roll).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      crBand: "cr_0_4",
      hoardOrIndividual: "individual",
    });
    expect(encounterService.resolveEncounter).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      {
        outcome: "victory",
        xpRewards: { mode: "equal-split", value: 150 },
        goldRewards: { cp: 0, sp: 0, gp: 30, pp: 0 },
      },
      "system",
    );
  });

  it("vitória com CR alto pega banda correta (cr_5_10)", async () => {
    const { svc, lootRollService } = setup({
      participants: [
        pcParticipant(),
        monsterParticipant({ xp: 1100, cr: 6, defeated: true }),
      ],
    });
    await svc.tryAutoEnd(ENCOUNTER_ID);
    expect(lootRollService.roll).toHaveBeenCalledWith(
      expect.objectContaining({ crBand: "cr_5_10" }),
    );
  });

  it("LootRollService falha: XP ainda aplicado, sem goldRewards", async () => {
    const { svc, encounterService, lootRollService } = setup({
      participants: [
        pcParticipant(),
        monsterParticipant({ xp: 50, cr: 1, defeated: true }),
      ],
      lootResult: new Error("loot service down"),
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBe("victory");
    expect(lootRollService.roll).toHaveBeenCalledTimes(1);
    expect(encounterService.resolveEncounter).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      {
        outcome: "victory",
        xpRewards: { mode: "equal-split", value: 50 },
      },
      "system",
    );
  });

  it("derrota: só { outcome: 'defeat' }, sem XP nem loot", async () => {
    const { svc, encounterService, lootRollService } = setup({
      participants: [
        pcParticipant({ dyingState: "dead" }),
        monsterParticipant({ xp: 50, cr: 1, defeated: false }),
      ],
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBe("defeat");
    expect(lootRollService.roll).not.toHaveBeenCalled();
    expect(encounterService.resolveEncounter).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      { outcome: "defeat" },
      "system",
    );
  });

  it("multiplayer (≥2 user_ids): tryAutoEnd retorna null sem chamar resolveEncounter", async () => {
    const { svc, encounterService, lootRollService } = setup({
      distinctUsers: 2,
      participants: [
        pcParticipant(),
        monsterParticipant({ xp: 50, cr: 1, defeated: true }),
      ],
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBeNull();
    expect(lootRollService.roll).not.toHaveBeenCalled();
    expect(encounterService.resolveEncounter).not.toHaveBeenCalled();
  });

  it("encounter não-active: tryAutoEnd retorna null cedo (idempotência)", async () => {
    const { svc, encounterService } = setup({
      encounterStatus: "completed",
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBeNull();
    expect(encounterService.resolveEncounter).not.toHaveBeenCalled();
  });

  it("vitória sem hostis derrotados (CR=0): payload sem goldRewards", async () => {
    const { svc, encounterService, lootRollService } = setup({
      participants: [
        pcParticipant(),
        // Hostil sem monster relation (xp=0, cr=0). Filtragem mantém ele
        // (faction enemy + ai + defeated), mas crBand vira null → loot skip.
        {
          type: "monster",
          controlledBy: "ai",
          faction: "enemy",
          currentHp: 0,
          isDefeated: true,
          monster: null,
          displayName: "Hostil sem stats",
        },
      ],
    });

    const outcome = await svc.tryAutoEnd(ENCOUNTER_ID);

    expect(outcome).toBe("victory");
    expect(lootRollService.roll).not.toHaveBeenCalled();
    // xp=0 não inclui xpRewards. cr=0 não inclui goldRewards. Apenas outcome.
    expect(encounterService.resolveEncounter).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      { outcome: "victory" },
      "system",
    );
  });
});
