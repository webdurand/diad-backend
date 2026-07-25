import { SummoningService } from "./summoning.service";


describe("SummoningService (spec 012)", () => {
  function makeWolfMonster() {
    return {
      id: "monster-1",
      slug: "wolf",
      name: "Wolf",
      hit_points: 11,
      size: "Medium",
      speed: { walk: "40" },
      armor_class: [{ value: 13 }],
      strength: 12,
      dexterity: 15,
      constitution: 12,
      intelligence: 3,
      wisdom: 12,
      charisma: 6,
    };
  }

  function setup(
    opts: {
      casterExists?: boolean;
      casterEncounterId?: string;
      casterControlledBy?: "pc" | "ai" | "dm";
      casterFaction?: "ally" | "enemy" | "neutral";
      monsterExists?: boolean;
      existingSummons?: Array<{ id: string }>;
      encounterStatus?: "preparing" | "rolling_initiative" | "active" | "completed";
    } = {},
  ) {
    const caster =
      opts.casterExists === false
        ? null
        : {
            id: "caster-1",
            encounterId: opts.casterEncounterId ?? "enc-1",
            positionX: 5,
            positionY: 5,
            controlledBy: opts.casterControlledBy ?? "pc",
            faction: opts.casterFaction ?? "ally",
            initiativeTotal: 16,
            appliedEffects: [],
          };
    const participantsById = new Map<string, any>();
    if (caster) participantsById.set(caster.id, caster);
    const participantFindOne = jest.fn().mockImplementation(async ({ where }) =>
      participantsById.get(where.id) ?? null,
    );
    const participantFind = jest
      .fn()
      .mockResolvedValue(opts.existingSummons ?? []);
    const participantSave = jest
      .fn()
      .mockImplementation(async (p: any) => {
        const saved = { ...p, id: p.id ?? "summon-new" };
        participantsById.set(saved.id, saved);
        return saved;
      });
    const participantRemove = jest.fn().mockResolvedValue(undefined);

    const monsterFindOne = jest
      .fn()
      .mockResolvedValue(
        opts.monsterExists === false ? null : makeWolfMonster(),
      );

    const encounter = {
      id: "enc-1",
      status: opts.encounterStatus ?? "active",
      turnOrder: ["caster-1", "enemy-1"],
      currentTurnIndex: 0,
    };
    const encounterFindOne = jest.fn().mockImplementation(async ({ where }) =>
      where.id === "enc-1" ? encounter : null,
    );
    const encounterSave = jest.fn().mockImplementation(async (e) => e);

    const svc = new SummoningService(
      {
        findOne: participantFindOne,
        find: participantFind,
        save: participantSave,
        remove: participantRemove,
        delete: jest.fn(),
      } as any,
      { findOne: monsterFindOne } as any,
      { findOne: encounterFindOne, save: encounterSave } as any,
    );

    return {
      svc,
      encounter,
      mocks: {
        participantFindOne,
        participantFind,
        participantSave,
        participantRemove,
        monsterFindOne,
        encounterFindOne,
        encounterSave,
      },
    };
  }

  describe("spawnSummon", () => {
    it("cria participant linkado ao caster com monster data", async () => {
      const { svc, mocks } = setup();
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
      });

      expect(mocks.participantSave).toHaveBeenCalledTimes(1);
      expect(summon.linkedCasterParticipantId).toBe("caster-1");
      expect(summon.encounterId).toBe("enc-1");
      expect(summon.type).toBe("monster");
      expect(summon.displayName).toBe("Wolf");
      expect(summon.faction).toBe("ally");
      expect(summon.controlledBy).toBe("pc");
      expect(summon.currentHp).toBe(11);
      expect(summon.maxHp).toBe(11);
      expect(summon.positionX).toBe(6);
      expect(summon.positionY).toBe(5);
    });

    it("insere summon ativo logo apos o caster no turn order", async () => {
      const { svc, encounter, mocks } = setup();
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
      });

      expect(encounter.turnOrder).toEqual(["caster-1", summon.id, "enemy-1"]);
      expect(summon.initiativeTotal).toBe(16);
      expect(mocks.encounterSave).toHaveBeenCalledWith(encounter);
    });

    it("herda controle e faccao do invocador AI", async () => {
      const { svc } = setup({
        casterControlledBy: "ai",
        casterFaction: "enemy",
      });
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
      });

      expect(summon.controlledBy).toBe("ai");
      expect(summon.faction).toBe("enemy");
    });

    it("registra appliedEffect de summon quando vinculado a concentracao", async () => {
      const { svc, mocks } = setup();
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
        concentrationLinked: true,
      });

      const savedCaster = mocks.participantSave.mock.calls
        .map(([arg]) => arg)
        .find((arg) => arg.id === "caster-1");
      expect(savedCaster.appliedEffects).toContainEqual(
        expect.objectContaining({
          kind: "summon",
          refId: summon.id,
          targetParticipantId: summon.id,
        }),
      );
    });

    it("usa posi\u00e7\u00e3o custom se passada", async () => {
      const { svc } = setup();
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
        position: { x: 10, y: 3 },
      });
      expect(summon.positionX).toBe(10);
      expect(summon.positionY).toBe(3);
    });

    it("reposiciona a invocação quando a célula pedida está ocupada", async () => {
      const { svc } = setup({
        existingSummons: [
          {
            id: "occupant-1",
            encounterId: "enc-1",
            positionX: 6,
            positionY: 5,
            isDefeated: false,
          } as any,
        ],
      });
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
        position: { x: 6, y: 5 },
      });

      expect({ x: summon.positionX, y: summon.positionY }).toEqual({
        x: 4,
        y: 4,
      });
    });

    it("mantém a invocação dentro do grid quando o conjurador está na borda", async () => {
      const { svc, mocks } = setup();
      const caster = await mocks.participantFindOne({
        where: { id: "caster-1" },
      });
      caster.positionX = 19;
      caster.positionY = 19;

      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
        position: { x: 20, y: 19 },
      });

      expect({ x: summon.positionX, y: summon.positionY }).toEqual({
        x: 18,
        y: 18,
      });
    });

    it("usa displayName custom", async () => {
      const { svc } = setup();
      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "conjure-animals-spell",
        displayName: "Celestial Wolf",
      });
      expect(summon.displayName).toBe("Celestial Wolf");
    });

    it("materializa HP e ficha dinâmica no participante invocado", async () => {
      const { svc } = setup();
      const statBlock = {
        kind: "bestial-spirit" as const,
        form: "land" as const,
        slotLevel: 4,
        armorClass: 15,
        maxHp: 40,
        speed: 30,
        movementModes: { walk: 30, climb: 30 },
        attack: {
          name: "Rend" as const,
          attackBonus: 9,
          damageDice: "1d8" as const,
          damageBonus: 8,
          damageType: "piercing" as const,
          reachFt: 5 as const,
          attacksPerAction: 2,
        },
        traits: {
          flyby: false,
          packTactics: true,
          waterBreathing: false,
        },
      };

      const summon = await svc.spawnSummon("enc-1", {
        casterParticipantId: "caster-1",
        monsterSlug: "wolf",
        source: "summon-beast-spell",
        statBlock,
      });

      expect(summon.currentHp).toBe(40);
      expect(summon.maxHp).toBe(40);
      expect(summon.appliedEffects).toContainEqual(
        expect.objectContaining({
          kind: "summon",
          metadata: {
            source: "summon-beast-spell",
            statBlock,
          },
        }),
      );
    });

    it("rejeita quando caster n\u00e3o existe", async () => {
      const { svc } = setup({ casterExists: false });
      await expect(
        svc.spawnSummon("enc-1", {
          casterParticipantId: "ghost",
          monsterSlug: "wolf",
          source: "summon-beast-spell",
        }),
      ).rejects.toThrow(/not found/);
    });

    it("rejeita quando monster n\u00e3o existe", async () => {
      const { svc } = setup({ monsterExists: false });
      await expect(
        svc.spawnSummon("enc-1", {
          casterParticipantId: "caster-1",
          monsterSlug: "unicorn-rainbow",
          source: "summon-beast-spell",
        }),
      ).rejects.toThrow(/monster unicorn-rainbow/);
    });

    it("rejeita quando caster \u00e9 de outro encounter", async () => {
      const { svc } = setup({ casterEncounterId: "enc-9" });
      await expect(
        svc.spawnSummon("enc-1", {
          casterParticipantId: "caster-1",
          monsterSlug: "wolf",
          source: "summon-beast-spell",
        }),
      ).rejects.toThrow(/n\u00e3o pertence/);
    });
  });

  describe("dismissSummon", () => {
    it("remove participant quando existe e \u00e9 summon", async () => {
      const summon = { id: "summon-1", linkedCasterParticipantId: "caster-1" };
      const findOne = jest.fn().mockResolvedValue(summon);
      const remove = jest.fn().mockResolvedValue(undefined);
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        { findOne: jest.fn(), save: jest.fn() } as any,
      );
      await svc.dismissSummon("summon-1", "player-dismiss");
      expect(remove).toHaveBeenCalledWith(summon);
    });

    it("remove summon do turn order ao dispensar", async () => {
      const summon = {
        id: "summon-1",
        encounterId: "enc-1",
        linkedCasterParticipantId: "caster-1",
      };
      const encounter = {
        id: "enc-1",
        turnOrder: ["caster-1", "summon-1", "enemy-1"],
        currentTurnIndex: 2,
      };
      const findOne = jest.fn().mockResolvedValue(summon);
      const remove = jest.fn().mockResolvedValue(undefined);
      const encounterSave = jest.fn().mockResolvedValue(encounter);
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        {
          findOne: jest.fn().mockResolvedValue(encounter),
          save: encounterSave,
        } as any,
      );
      await svc.dismissSummon("summon-1", "player-dismiss");
      expect(encounter.turnOrder).toEqual(["caster-1", "enemy-1"]);
      expect(encounter.currentTurnIndex).toBe(1);
      expect(encounterSave).toHaveBeenCalledWith(encounter);
    });

    it("\u00e9 no-op quando summon n\u00e3o existe", async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const remove = jest.fn();
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        { findOne: jest.fn(), save: jest.fn() } as any,
      );
      await svc.dismissSummon("ghost", "player-dismiss");
      expect(remove).not.toHaveBeenCalled();
    });

    it("\u00e9 no-op quando participant n\u00e3o \u00e9 summon (sem linkedCaster)", async () => {
      const findOne = jest
        .fn()
        .mockResolvedValue({ id: "pc", linkedCasterParticipantId: null });
      const remove = jest.fn();
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        { findOne: jest.fn(), save: jest.fn() } as any,
      );
      await svc.dismissSummon("pc", "player-dismiss");
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe("dismissAllOfCaster", () => {
    it("remove todos summons do caster em cascata e retorna contagem", async () => {
      const summons = [
        { id: "s1", encounterId: "enc-1", linkedCasterParticipantId: "c1" },
        { id: "s2", encounterId: "enc-1", linkedCasterParticipantId: "c1" },
        { id: "s3", encounterId: "enc-1", linkedCasterParticipantId: "c1" },
      ];
      const find = jest.fn().mockResolvedValue(summons);
      const findOne = jest
        .fn()
        .mockImplementation(async ({ where }) =>
          summons.find((s) => s.id === where.id),
        );
      const remove = jest.fn();
      const svc = new SummoningService(
        { find, findOne, remove } as any,
        { findOne: jest.fn() } as any,
        { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() } as any,
      );
      const n = await svc.dismissAllOfCaster("c1", "caster-death");
      expect(n).toBe(3);
      expect(remove).toHaveBeenCalledTimes(3);
    });

    it("retorna 0 quando caster n\u00e3o tem summons", async () => {
      const svc = new SummoningService(
        {
          find: jest.fn().mockResolvedValue([]),
          findOne: jest.fn(),
          remove: jest.fn(),
        } as any,
        { findOne: jest.fn() } as any,
        { findOne: jest.fn(), save: jest.fn() } as any,
      );
      expect(await svc.dismissAllOfCaster("c1", "caster-death")).toBe(0);
    });
  });

  describe("ações especiais de Find Familiar", () => {
    function setupFamiliar(pocketed = false) {
      const caster: any = {
        id: "caster-1",
        encounterId: "enc-1",
        displayName: "Wizard",
        positionX: 5,
        positionY: 5,
        actionUsed: false,
        conditions: [],
        effectInstances: [],
      };
      const familiar: any = {
        id: "familiar-1",
        encounterId: "enc-1",
        linkedCasterParticipantId: caster.id,
        displayName: "Familiar Coruja",
        positionX: pocketed ? null : 7,
        positionY: pocketed ? null : 5,
        isVisible: !pocketed,
        isDefeated: false,
        reactionsUsed: 0,
        monster: { slug: "owl" },
        appliedEffects: [
          {
            kind: "summon",
            refId: "find-familiar-spell",
            targetParticipantId: "familiar-1",
            description: "find-familiar-spell",
            metadata: {
              source: "find-familiar-spell",
              familiarForm: "owl",
              pocketed,
            },
          },
        ],
      };
      const encounter: any = {
        id: "enc-1",
        status: "active",
        turnOrder: pocketed
          ? [caster.id, "enemy-1"]
          : [caster.id, familiar.id, "enemy-1"],
        currentTurnIndex: 0,
        mapData: { gridColumns: 20, gridRows: 20 },
      };
      const participantSave = jest
        .fn()
        .mockImplementation(async (value: any) => value);
      const participantFindOne = jest
        .fn()
        .mockImplementation(async ({ where }: any) => {
          if (where.id === caster.id) return caster;
          if (where.id === familiar.id) return familiar;
          return null;
        });
      const participantFind = jest.fn().mockResolvedValue([familiar]);
      const encounterSave = jest
        .fn()
        .mockImplementation(async (value: any) => value);
      const svc = new SummoningService(
        {
          find: participantFind,
          findOne: participantFindOne,
          save: participantSave,
        } as any,
        { findOne: jest.fn() } as any,
        {
          findOne: jest.fn().mockResolvedValue(encounter),
          save: encounterSave,
        } as any,
      );
      return {
        svc,
        caster,
        familiar,
        encounter,
        participantSave,
        encounterSave,
      };
    }

    it("compartilha sentidos, consome a ação e persiste efeito até o próximo turno", async () => {
      const { svc, caster, familiar } = setupFamiliar();
      const result = await svc.shareFamiliarSenses("enc-1", caster.id);

      expect(result.ok).toBe(true);
      expect(caster.actionUsed).toBe(true);
      expect(caster.effectInstances).toEqual([
        expect.objectContaining({
          kind: "familiar_shared_senses",
          payload: expect.objectContaining({
            familiarParticipantId: familiar.id,
          }),
          expiresAt: { kind: "until_caster_turn" },
        }),
      ]);
      if (result.ok) {
        expect(result.events.map((event) => event.event_type)).toEqual([
          "effect_applied",
          "familiar_senses_shared",
        ]);
      }
    });

    it("move o familiar para o bolsão e o remove da iniciativa", async () => {
      const { svc, caster, familiar, encounter } = setupFamiliar();
      const result = await svc.pocketFindFamiliar("enc-1", caster.id);

      expect(result.ok).toBe(true);
      expect(caster.actionUsed).toBe(true);
      expect(familiar.isVisible).toBe(false);
      expect(familiar.positionX).toBeNull();
      expect(familiar.positionY).toBeNull();
      expect(encounter.turnOrder).toEqual([caster.id, "enemy-1"]);
      expect(
        familiar.appliedEffects[0].metadata.pocketed,
      ).toBe(true);
    });

    it("faz o familiar reaparecer em espaço livre até 30 pés e restaura a iniciativa", async () => {
      const { svc, caster, familiar, encounter } = setupFamiliar(true);
      const result = await svc.reappearFindFamiliar(
        "enc-1",
        caster.id,
        { x: 9, y: 5 },
      );

      expect(result.ok).toBe(true);
      expect(caster.actionUsed).toBe(true);
      expect(familiar.isVisible).toBe(true);
      expect({ x: familiar.positionX, y: familiar.positionY }).toEqual({
        x: 9,
        y: 5,
      });
      expect(familiar.appliedEffects[0].metadata.pocketed).toBe(false);
      expect(encounter.turnOrder).toEqual([
        caster.id,
        familiar.id,
        "enemy-1",
      ]);
    });
  });
});
