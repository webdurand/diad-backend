import { PaladinAuraService } from "./paladin-aura.service";
import type { EncounterParticipantEntity } from "src/entities/encounter-participant.entity";

function participant(
  overrides: Partial<EncounterParticipantEntity>,
): EncounterParticipantEntity {
  return {
    id: "target",
    encounterId: "encounter",
    type: "pc",
    characterId: "target-character",
    displayName: "Ally",
    faction: "ally",
    positionX: 2,
    positionY: 2,
    conditions: [],
    effectInstances: [],
    isDefeated: false,
    ...overrides,
  } as EncounterParticipantEntity;
}

describe("PaladinAuraService", () => {
  const target = participant({});
  const paladin = participant({
    id: "paladin",
    characterId: "paladin-character",
    displayName: "Devotion Paladin",
    positionX: 0,
    positionY: 0,
  });
  const participantRepo = {
    find: jest.fn(),
  };
  const classRepo = {
    find: jest.fn(),
  };
  let service: PaladinAuraService;

  beforeEach(() => {
    jest.clearAllMocks();
    participantRepo.find.mockResolvedValue([target, paladin]);
    classRepo.find.mockResolvedValue([
      {
        character_id: "paladin-character",
        class_level: 15,
        class: { slug: "paladin-xphb" },
        subclass: { slug: "oath-of-devotion-xphb" },
      },
    ]);
    service = new PaladinAuraService(
      participantRepo as never,
      classRepo as never,
    );
  });

  it.each([
    ["charmed", "aura-of-devotion"],
    ["hypnotized", "aura-of-devotion"],
    ["frightened", "aura-of-courage"],
  ] as const)("blocks %s through %s inside 10 feet", async (condition, feature) => {
    await expect(service.getConditionImmunity(target, condition)).resolves.toEqual(
      expect.objectContaining({
        sourceParticipantId: "paladin",
        sourceName: "Devotion Paladin",
        featureSlug: feature,
        radiusFeet: 10,
      }),
    );
  });

  it("does not grant the aura outside its radius or while the Paladin is incapacitated", async () => {
    const outside = participant({ positionX: 3, positionY: 0 });
    await expect(
      service.getConditionImmunity(outside, "frightened"),
    ).resolves.toBeNull();

    participantRepo.find.mockResolvedValue([
      target,
      participant({ ...paladin, conditions: ["stunned"] }),
    ]);
    await expect(
      service.getConditionImmunity(target, "frightened"),
    ).resolves.toBeNull();
  });

  it("grants half cover only while Smite of Protection is active", async () => {
    participantRepo.find.mockResolvedValue([
      target,
      participant({
        ...paladin,
        effectInstances: [
          {
            id: "protection",
            kind: "aura_half_cover",
            sourceFeatureSlug: "smite-of-protection",
            sourceCasterParticipantId: "paladin",
            payload: { amount: 2 },
            expiresAt: { kind: "until_caster_turn" },
            requiresConcentration: false,
            appliedAt: "2026-07-25T00:00:00.000Z",
          },
        ],
      }),
    ]);

    await expect(
      service.getSmiteOfProtectionHalfCover(target),
    ).resolves.toEqual(
      expect.objectContaining({
        featureSlug: "smite-of-protection",
        bonus: 2,
      }),
    );
  });
});
