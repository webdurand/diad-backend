import { Repository } from "typeorm";
import { EncounterSnapshotService } from "../encounter-snapshot.service";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { PersistentAreaEffectEntity } from "src/entities/persistent-area-effect.entity";
import { CharacterEntity } from "src/entities/character.entity";
import type { CombatService } from "../combat.service";
import type { PersistentAreaService } from "../persistent-area.service";
import type { CharacterSheetService } from "src/models/characters/services/character-sheet.service";

const ENCOUNTER_ID = "11111111-1111-4111-8111-111111111111";
const MONSTER_PART_ID = "22222222-2222-4222-8222-222222222222";

function makeService(
  encounter: Partial<EncounterEntity>,
  participants: Array<Partial<EncounterParticipantEntity>>,
) {
  const encounterRepo = {
    findOne: jest.fn(async () => encounter as EncounterEntity),
  };
  const participantRepo = {
    find: jest.fn(async () => participants as EncounterParticipantEntity[]),
  };
  const areaRepo = { find: jest.fn(async () => []) };
  const characterRepo = {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
    })),
  };
  const combatService = {
    getAvailableActions: jest.fn(async () => ({ ok: true, value: [] })),
    getCurrentTurnInfo: jest.fn(async () => ({
      ok: true,
      value: { participantId: MONSTER_PART_ID },
    })),
  } as unknown as CombatService;
  const persistentArea = {
    cellInArea: jest.fn(() => false),
  } as unknown as PersistentAreaService;
  const sheetService = {} as unknown as CharacterSheetService;

  return new EncounterSnapshotService(
    encounterRepo as unknown as Repository<EncounterEntity>,
    participantRepo as unknown as Repository<EncounterParticipantEntity>,
    areaRepo as unknown as Repository<PersistentAreaEffectEntity>,
    characterRepo as unknown as Repository<CharacterEntity>,
    combatService,
    persistentArea,
    sheetService,
  );
}

const baseEncounter = {
  id: ENCOUNTER_ID,
  currentRound: 1,
  currentTurnIndex: 0,
  turnOrder: [MONSTER_PART_ID],
  mapData: { gridSize: 20 },
  status: "active",
} as Partial<EncounterEntity>;

function baseMonsterParticipant(monsterOverrides: any = {}) {
  return {
    id: MONSTER_PART_ID,
    encounterId: ENCOUNTER_ID,
    type: "monster",
    faction: "enemy",
    displayName: "Goblin",
    controlledBy: "ai",
    positionX: 5,
    positionY: 5,
    currentHp: 10,
    maxHp: 10,
    tempHp: 0,
    conditions: [],
    isDefeated: false,
    actionUsed: false,
    bonusActionUsed: false,
    reactionsUsed: 0,
    movementRemaining: 30,
    legendaryActionsUsed: 0,
    legendaryPointsAvailable: null,
    legendaryPointsMax: null,
    spellSlotsUsed: {},
    dyingState: "none",
    monster: {
      id: "mon-1",
      slug: "goblin",
      name: "Goblin",
      intelligence: 8,
      wisdom: 8,
      speed: { walk: 30 },
      actions: [{ name: "Scimitar", attack_bonus: 4 }],
      multiattack: null,
      spellcasting: null,
      reactions: null,
      legendary_actions: null,
      legendary_action_cost_map: null,
      lair_actions: null,
      ...monsterOverrides,
    },
  } as Partial<EncounterParticipantEntity>;
}

describe("EncounterSnapshotService — A0 statblock enrichment", () => {
  it("inclui multiattack quando monstro tem", async () => {
    const svc = makeService(baseEncounter, [
      baseMonsterParticipant({
        multiattack: {
          sequence: [
            { actionName: "Bite", count: 1 },
            { actionName: "Claw", count: 2 },
          ],
          description: "1 bite + 2 claws",
        },
      }),
    ]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.multiattack).toEqual({
      sequence: [
        { actionName: "Bite", count: 1 },
        { actionName: "Claw", count: 2 },
      ],
      description: "1 bite + 2 claws",
    });
  });

  it("inclui spellcasting com slots remaining computado de spellSlotsUsed", async () => {
    const part = baseMonsterParticipant({
      spellcasting: {
        type: "standard",
        ability: "int",
        saveDc: 14,
        attackBonus: 6,
        slotsByLevel: { 1: 4, 2: 2 },
        knownSpells: [{ slug: "magic-missile", level: 1 }],
      },
    }) as any;
    part.spellSlotsUsed = { byLevel: { 1: 1 } };
    const svc = makeService(baseEncounter, [part]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.spellcasting?.saveDc).toBe(14);
    expect(sb?.spellcasting?.slotsByLevel).toEqual([
      { level: 1, total: 4, remaining: 3 },
      { level: 2, total: 2, remaining: 2 },
    ]);
  });

  it("inclui legendary actions com cost map aplicado", async () => {
    const part = baseMonsterParticipant({
      legendary_actions: [
        { name: "Tail Attack", description: "..." },
        { name: "Wing Buffet", description: "(Costs 2 Actions)" },
      ],
      legendary_action_cost_map: { "Tail Attack": 1, "Wing Buffet": 2 },
    }) as any;
    part.legendaryPointsAvailable = 3;
    part.legendaryPointsMax = 3;
    const svc = makeService(baseEncounter, [part]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.legendaryActions).toEqual([
      { name: "Tail Attack", cost: 1, description: "..." },
      { name: "Wing Buffet", cost: 2, description: "(Costs 2 Actions)" },
    ]);
    expect(sb?.legendaryActionPointsRemaining).toBe(3);
    expect(sb?.legendaryActionPointsMax).toBe(3);
  });

  it("inclui lair actions array", async () => {
    const svc = makeService(baseEncounter, [
      baseMonsterParticipant({
        lair_actions: [
          { name: "Tremor", description: "Earthquake shakes the chamber" },
        ],
      }),
    ]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.lairActions).toHaveLength(1);
    expect(sb?.lairActions?.[0]?.name).toBe("Tremor");
  });

  it("extrai bonus actions do campo actions quando description menciona 'bonus action'", async () => {
    const svc = makeService(baseEncounter, [
      baseMonsterParticipant({
        actions: [
          { name: "Scimitar", attack_bonus: 4, desc: "Melee weapon attack." },
          {
            name: "Nimble Escape",
            desc: "The goblin can take Disengage as a bonus action.",
          },
        ],
      }),
    ]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.bonusActions?.map((b) => b.name)).toContain("Nimble Escape");
    expect(sb?.bonusActions?.map((b) => b.name)).not.toContain("Scimitar");
  });

  it("extrai reactions de dict ou array", async () => {
    const svc = makeService(baseEncounter, [
      baseMonsterParticipant({
        reactions: [
          {
            name: "Parry",
            description: "Add +3 to AC against one melee attack.",
          },
        ],
      }),
    ]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.reactions).toEqual([
      {
        name: "Parry",
        description: "Add +3 to AC against one melee attack.",
        trigger: undefined,
      },
    ]);
  });

  it("retorna campos vazios quando monstro não tem statblock estendido", async () => {
    const svc = makeService(baseEncounter, [baseMonsterParticipant()]);
    const result = await svc.build(ENCOUNTER_ID, "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sb = result.value.participants[0]?.statblockRef;
    expect(sb?.multiattack).toBeNull();
    expect(sb?.spellcasting).toBeNull();
    expect(sb?.legendaryActions).toEqual([]);
    expect(sb?.lairActions).toEqual([]);
    expect(sb?.bonusActions).toEqual([]);
    expect(sb?.reactions).toEqual([]);
  });
});
