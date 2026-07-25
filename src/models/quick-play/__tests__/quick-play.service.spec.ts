import { Repository } from "typeorm";
import { CampaignEntity } from "src/entities/campaign.entity";
import { GameSessionEntity } from "src/entities/game-session.entity";
import { CampaignPlayerEntity } from "src/entities/campaign-player.entity";
import { EncounterEntity } from "src/entities/encounter.entity";
import { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";
import { EncounterService } from "src/models/game-engine/services/encounter.service";
import { QuickPlayService } from "../quick-play.service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const ENCOUNTER_ID = "33333333-3333-4333-8333-333333333333";
const CHARACTER_ID = "44444444-4444-4444-8444-444444444444";
const MONSTER_ID = "55555555-5555-4555-8555-555555555555";

interface FakeRepo<T> {
  rows: T[];
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
}

function makeCampaignRepo(
  initial: Partial<CampaignEntity>[] = [],
): FakeRepo<CampaignEntity> {
  const rows: CampaignEntity[] = initial.map(
    (r) => ({ ...r }) as CampaignEntity,
  );
  return {
    rows,
    findOne: jest.fn(async (opts: any) => {
      const where = opts?.where ?? {};
      return (
        rows.find(
          (r) =>
            (where.dmUserId === undefined || r.dmUserId === where.dmUserId) &&
            (where.isSandbox === undefined ||
              (r as any).isSandbox === where.isSandbox),
        ) ?? null
      );
    }),
    save: jest.fn(async (entity: any) => {
      const saved = { id: CAMPAIGN_ID, ...entity } as CampaignEntity;
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return saved;
    }),
    create: jest.fn((data: any) => data as CampaignEntity),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function makeSessionRepo(
  initial: Partial<GameSessionEntity>[] = [],
): FakeRepo<GameSessionEntity> {
  const rows: GameSessionEntity[] = initial.map(
    (r) => ({ ...r }) as GameSessionEntity,
  );
  return {
    rows,
    findOne: jest.fn(async (opts: any) => {
      const where = opts?.where ?? {};
      return (
        rows.find(
          (r) =>
            (where.campaignId === undefined ||
              r.campaignId === where.campaignId) &&
            (where.ownerId === undefined || r.ownerId === where.ownerId),
        ) ?? null
      );
    }),
    save: jest.fn(async (entity: any) => {
      const saved = { id: SESSION_ID, ...entity } as GameSessionEntity;
      const idx = rows.findIndex((r) => r.id === saved.id);
      if (idx >= 0) rows[idx] = saved;
      else rows.push(saved);
      return saved;
    }),
    create: jest.fn((data: any) => data as GameSessionEntity),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function makePlayerRepo(): FakeRepo<CampaignPlayerEntity> {
  const rows: CampaignPlayerEntity[] = [];
  return {
    rows,
    findOne: jest.fn(async (opts: any) => {
      const where = opts?.where ?? {};
      return (
        rows.find(
          (r) => r.campaignId === where.campaignId && r.userId === where.userId,
        ) ?? null
      );
    }),
    save: jest.fn(async (entity: any) => {
      const saved = { ...entity } as CampaignPlayerEntity;
      rows.push(saved);
      return saved;
    }),
    create: jest.fn((data: any) => data as CampaignPlayerEntity),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function makeEncounterRepo(): FakeRepo<EncounterEntity> {
  return {
    rows: [],
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function makeParticipantRepo(): FakeRepo<EncounterParticipantEntity> {
  return {
    rows: [],
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  };
}

function makeEncounterService() {
  return {
    create: jest.fn(async (sessionId: string, dto: any) => ({
      id: ENCOUNTER_ID,
      sessionId,
      name: dto.name,
      mapData: {},
    })),
    addCharacter: jest.fn(async (encounterId: string, characterId: string) => ({
      id: "pc-part-1",
      encounterId,
      characterId,
      type: "pc",
    })),
    addMonster: jest.fn(async (encounterId: string, dto: any) =>
      Array.from({ length: dto.count }, (_, i) => ({
        id: `mon-part-${i + 1}`,
        encounterId,
        monsterId: dto.monsterId,
        type: "monster",
      })),
    ),
    calculateDifficulty: jest.fn().mockResolvedValue({
      totalMonsterXp: 5400,
      adjustedXp: 10800,
      threshold: "hard",
      partySize: 1,
      partyAverageLevel: 20,
    }),
  } as unknown as EncounterService;
}

describe("QuickPlayService", () => {
  describe("getOrCreateSandbox", () => {
    it("creates campaign + session + player on first call", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      const result = await service.getOrCreateSandbox(USER_ID);

      expect(result.campaignId).toBe(CAMPAIGN_ID);
      expect(result.sessionId).toBe(SESSION_ID);
      expect(campaignRepo.save).toHaveBeenCalledTimes(1);
      expect(campaignRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dmUserId: USER_ID,
          isSandbox: true,
          slug: `qp-sandbox-${USER_ID}`,
          name: "Quick Play Sandbox",
          dmMode: "human",
          status: "active",
        }),
      );
      expect(playerRepo.save).toHaveBeenCalledTimes(1);
      expect(sessionRepo.save).toHaveBeenCalledTimes(1);
      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: CAMPAIGN_ID,
          ownerId: USER_ID,
          status: "active",
        }),
      );
    });

    it("reuses existing sandbox on second call (idempotente)", async () => {
      const campaignRepo = makeCampaignRepo([
        {
          id: CAMPAIGN_ID,
          dmUserId: USER_ID,
          isSandbox: true,
          name: "Quick Play Sandbox",
        } as Partial<CampaignEntity> as CampaignEntity,
      ]);
      const sessionRepo = makeSessionRepo([
        {
          id: SESSION_ID,
          campaignId: CAMPAIGN_ID,
          ownerId: USER_ID,
          name: "Sandbox",
        } as Partial<GameSessionEntity> as GameSessionEntity,
      ]);
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      const result = await service.getOrCreateSandbox(USER_ID);

      expect(result.campaignId).toBe(CAMPAIGN_ID);
      expect(result.sessionId).toBe(SESSION_ID);
      expect(campaignRepo.save).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
      expect(playerRepo.save).not.toHaveBeenCalled();
    });

    it("creates separate sandbox per user", async () => {
      const campaignRepo = makeCampaignRepo([
        {
          id: CAMPAIGN_ID,
          dmUserId: OTHER_USER_ID,
          isSandbox: true,
        } as Partial<CampaignEntity> as CampaignEntity,
      ]);
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await service.getOrCreateSandbox(USER_ID);

      expect(campaignRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dmUserId: USER_ID, isSandbox: true }),
      );
    });
  });

  describe("createEncounter", () => {
    it("provisions sandbox, creates encounter, attaches PC + monsters, sets grid", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      const result = await service.createEncounter(USER_ID, {
        characterId: CHARACTER_ID,
        monsters: [{ monsterId: MONSTER_ID, count: 3 }],
        gridSize: 25,
      });

      expect(result).toEqual({
        encounterId: ENCOUNTER_ID,
        sessionId: SESSION_ID,
        campaignId: CAMPAIGN_ID,
      });
      expect(encounterService.create).toHaveBeenCalledWith(
        SESSION_ID,
        expect.objectContaining({
          name: expect.stringContaining("Quick Play"),
        }),
      );
      expect(encounterService.addCharacter).toHaveBeenCalledWith(
        ENCOUNTER_ID,
        CHARACTER_ID,
        USER_ID,
      );
      expect(encounterService.addMonster).toHaveBeenCalledWith(ENCOUNTER_ID, {
        monsterId: MONSTER_ID,
        count: 3,
      });
      expect(encounterRepo.update).toHaveBeenCalledWith(
        ENCOUNTER_ID,
        expect.objectContaining({
          mapData: expect.objectContaining({
            gridSize: 25,
            gridColumns: 25,
            gridRows: 25,
            gridVisible: true,
          }),
        }),
      );
      expect(sessionRepo.update).toHaveBeenCalledWith(SESSION_ID, {
        activeEncounterId: ENCOUNTER_ID,
      });
      expect(participantRepo.update).toHaveBeenCalledWith(
        { encounterId: ENCOUNTER_ID, type: "monster" },
        { controlledBy: "ai" },
      );
    });

    it("defaults gridSize to 20 when not provided", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await service.createEncounter(USER_ID, {
        characterId: CHARACTER_ID,
        monsters: [{ monsterId: MONSTER_ID, count: 1 }],
      });

      expect(encounterRepo.update).toHaveBeenCalledWith(
        ENCOUNTER_ID,
        expect.objectContaining({
          mapData: expect.objectContaining({ gridSize: 20 }),
        }),
      );
    });

    it("starts training fully restored, snapshots the real state and persists difficulty", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();
      const characterState = {
        character_id: CHARACTER_ID,
        current_hp: 3,
        temp_hp: 7,
        death_saves_success: 1,
        death_saves_fail: 2,
        conditions: ["poisoned"],
        spell_slots_used: { "5": 3 },
        hit_dice_used: { d8: 4 },
        ki_points_used: 2,
        feature_uses_used: { "wild-shape": 1 },
        exhaustion_level: 1,
        inspiration: true,
      };
      const characterStateRepo = {
        findOne: jest.fn().mockResolvedValue(characterState),
        save: jest.fn(async (value) => value),
      };
      const characterSheetService = {
        computeSheet: jest.fn().mockResolvedValue({
          maxHp: 129,
          totalLevel: 20,
        }),
      };
      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
        characterStateRepo as any,
        characterSheetService as any,
      );

      await service.createEncounter(USER_ID, {
        characterId: CHARACTER_ID,
        monsters: [{ monsterId: MONSTER_ID, count: 3 }],
      });

      expect(characterStateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          current_hp: 129,
          temp_hp: 0,
          conditions: [],
          spell_slots_used: {},
          feature_uses_used: {},
          exhaustion_level: 0,
        }),
      );
      expect(encounterService.calculateDifficulty).toHaveBeenCalledWith(
        ENCOUNTER_ID,
        [20],
      );
      expect(encounterRepo.update).toHaveBeenCalledWith(
        ENCOUNTER_ID,
        expect.objectContaining({
          difficulty: expect.objectContaining({
            adjusted_xp: 10800,
            threshold: "hard",
            total_monster_xp: 5400,
          }),
          mapData: expect.objectContaining({
            quickPlay: expect.objectContaining({
              characterId: CHARACTER_ID,
              restored: false,
              characterStateSnapshot: expect.objectContaining({
                current_hp: 3,
                temp_hp: 7,
                spell_slots_used: { "5": 3 },
                conditions: ["poisoned"],
              }),
            }),
          }),
        }),
      );
    });

    it("rejects empty monsters list", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await expect(
        service.createEncounter(USER_ID, {
          characterId: CHARACTER_ID,
          monsters: [],
        }),
      ).rejects.toThrow();
    });

    it("rejects missing characterId", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await expect(
        service.createEncounter(USER_ID, {
          characterId: "",
          monsters: [{ monsterId: MONSTER_ID, count: 1 }],
        }),
      ).rejects.toThrow();
    });

    it("rejects monster with invalid count", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await expect(
        service.createEncounter(USER_ID, {
          characterId: CHARACTER_ID,
          monsters: [{ monsterId: MONSTER_ID, count: 0 }],
        }),
      ).rejects.toThrow();
    });

    it("loops addMonster for each entry in list", async () => {
      const campaignRepo = makeCampaignRepo();
      const sessionRepo = makeSessionRepo();
      const playerRepo = makePlayerRepo();
      const encounterRepo = makeEncounterRepo();
      const participantRepo = makeParticipantRepo();
      const encounterService = makeEncounterService();

      const service = new QuickPlayService(
        campaignRepo as unknown as Repository<CampaignEntity>,
        sessionRepo as unknown as Repository<GameSessionEntity>,
        playerRepo as unknown as Repository<CampaignPlayerEntity>,
        encounterRepo as unknown as Repository<EncounterEntity>,
        participantRepo as unknown as Repository<EncounterParticipantEntity>,
        encounterService,
      );

      await service.createEncounter(USER_ID, {
        characterId: CHARACTER_ID,
        monsters: [
          { monsterId: "m1", count: 2 },
          { monsterId: "m2", count: 1 },
        ],
      });

      expect(encounterService.addMonster).toHaveBeenCalledTimes(2);
      expect(encounterService.addMonster).toHaveBeenNthCalledWith(
        1,
        ENCOUNTER_ID,
        {
          monsterId: "m1",
          count: 2,
        },
      );
      expect(encounterService.addMonster).toHaveBeenNthCalledWith(
        2,
        ENCOUNTER_ID,
        {
          monsterId: "m2",
          count: 1,
        },
      );
    });
  });
});
