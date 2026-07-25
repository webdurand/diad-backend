import { ClassFeatureResolverService } from "./class-feature-resolver.service";

describe("ClassFeatureResolverService — Moonlight Step", () => {
  function setup() {
    const source = {
      id: "druid-1",
      characterId: "character-1",
      encounterId: "encounter-1",
      positionX: 2,
      positionY: 2,
      isDefeated: false,
      faction: "ally",
      displayName: "Druida",
      effectInstances: [] as Array<Record<string, unknown>>,
    };
    const occupant = {
      id: "ally-1",
      encounterId: "encounter-1",
      positionX: 4,
      positionY: 4,
      isDefeated: false,
      faction: "ally",
      displayName: "Coruja Familiar",
    };
    const state = {
      character_id: source.characterId,
      feature_uses_used: {} as Record<string, number>,
      spell_slots_used: {} as Record<string, number>,
    };
    const participants = {
      findOne: jest.fn(async ({ where: { id } }: any) =>
        id === source.id ? source : id === occupant.id ? occupant : null,
      ),
      find: jest.fn(async () => [source, occupant]),
      save: jest.fn(async (value: any) => value),
    };
    const charStates = {
      findOne: jest.fn().mockResolvedValue(state),
      save: jest.fn(async (value: any) => value),
    };
    let effectSequence = 0;
    const effectInstances = {
      addEffect: jest.fn(async (participant: any, input: any) => {
        const effect = { id: `effect-${++effectSequence}`, ...input };
        participant.effectInstances = [
          ...(participant.effectInstances ?? []),
          effect,
        ];
        return {
          effect,
          events: [{ event_type: "effect_applied", data: input }],
        };
      }),
    };
    const service = new ClassFeatureResolverService(
      participants as never,
      charStates as never,
      {} as never,
      effectInstances as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return {
      service,
      source,
      occupant,
      state,
      participants,
      charStates,
      effectInstances,
    };
  }

  it("teleporta, consome um uso e arma Vantagem para o próximo ataque", async () => {
    const { service, source, state, effectInstances } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step",
      options: {
        destinationX: 8,
        destinationY: 2,
        gridColumns: 12,
        gridRows: 8,
      },
      caster: { abilityMods: { wis: 5 } },
    });

    expect(result.resolved).toBe(true);
    expect(source.positionX).toBe(8);
    expect(source.positionY).toBe(2);
    expect(state.feature_uses_used["moonlight-step"]).toBe(1);
    expect(effectInstances.addEffect).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        kind: "self_advantage_next_attack",
        sourceFeatureSlug: "moonlight-step",
        payload: expect.objectContaining({
          consumeOn: "targeted_by_attack",
        }),
        expiresAt: { kind: "caster_turn_ends", value: 1 },
      }),
    );
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        distanceFt: 30,
        advantageOnNextAttack: true,
        usesRemaining: 4,
        maxUses: 5,
      }),
    );
  });

  it("rejeita destino ocupado sem consumir uso", async () => {
    const { service, source, state, charStates, effectInstances } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step",
      options: {
        destinationX: 4,
        destinationY: 4,
        gridColumns: 12,
        gridRows: 8,
      },
      caster: { abilityMods: { wis: 5 } },
    });

    expect(result.resolved).toBe(false);
    expect(source.positionX).toBe(2);
    expect(state.feature_uses_used["moonlight-step"]).toBeUndefined();
    expect(charStates.save).not.toHaveBeenCalled();
    expect(effectInstances.addEffect).not.toHaveBeenCalled();
    expect(result.events.at(-1)?.data?.error).toContain("ocupado");
  });

  it("teleporta uma criatura aliada com Luar Compartilhado no nível 14", async () => {
    const { service, source, occupant, state, participants } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step",
      options: {
        destinationX: 8,
        destinationY: 2,
        sharedCompanionParticipantId: occupant.id,
        sharedCompanionDestinationX: 8,
        sharedCompanionDestinationY: 3,
        gridColumns: 12,
        gridRows: 8,
      },
      caster: {
        abilityMods: { wis: 5 },
        classLevel: 14,
        isMoonDruid: true,
      },
    });

    expect(result.resolved).toBe(true);
    expect(source.positionX).toBe(8);
    expect(source.positionY).toBe(2);
    expect(occupant.positionX).toBe(8);
    expect(occupant.positionY).toBe(3);
    expect(state.feature_uses_used["moonlight-step"]).toBe(1);
    expect(participants.save).toHaveBeenCalledWith(occupant);
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        sharedCompanion: {
          participantId: occupant.id,
          name: "Coruja Familiar",
          from: { x: 4, y: 4 },
          to: { x: 8, y: 3 },
        },
      }),
    );
  });

  it("rejeita Luar Compartilhado abaixo do nível 14 sem mover nem consumir", async () => {
    const { service, source, occupant, state, charStates } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step",
      options: {
        destinationX: 8,
        destinationY: 2,
        sharedCompanionParticipantId: occupant.id,
        sharedCompanionDestinationX: 8,
        sharedCompanionDestinationY: 3,
        gridColumns: 12,
        gridRows: 8,
      },
      caster: {
        abilityMods: { wis: 5 },
        classLevel: 13,
        isMoonDruid: true,
      },
    });

    expect(result.resolved).toBe(false);
    expect(source.positionX).toBe(2);
    expect(occupant.positionX).toBe(4);
    expect(state.feature_uses_used["moonlight-step"]).toBeUndefined();
    expect(charStates.save).not.toHaveBeenCalled();
    expect(result.events.at(-1)?.data?.error).toContain("nível 14");
  });

  it("rejeita destino compartilhado além de 10 pés do destino do Druida", async () => {
    const { service, source, occupant, state } = setup();

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step",
      options: {
        destinationX: 8,
        destinationY: 2,
        sharedCompanionParticipantId: occupant.id,
        sharedCompanionDestinationX: 8,
        sharedCompanionDestinationY: 5,
        gridColumns: 12,
        gridRows: 8,
      },
      caster: {
        abilityMods: { wis: 5 },
        classLevel: 14,
        isMoonDruid: true,
      },
    });

    expect(result.resolved).toBe(false);
    expect(source.positionX).toBe(2);
    expect(occupant.positionX).toBe(4);
    expect(state.feature_uses_used["moonlight-step"]).toBeUndefined();
    expect(result.events.at(-1)?.data?.error).toContain("10 pés");
  });

  it("gasta slot de nível 2 ou maior para recuperar um uso sem ação", async () => {
    const { service, source, state } = setup();
    state.feature_uses_used["moonlight-step"] = 2;
    state.spell_slots_used["3"] = 1;

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step-recover",
      options: { slotLevel: 3 },
      caster: {
        spellSlots: [{ level: 3, total: 3, used: 1 }],
      },
    });

    expect(result.resolved).toBe(true);
    expect(state.feature_uses_used["moonlight-step"]).toBe(1);
    expect(state.spell_slots_used["3"]).toBe(2);
    expect(result.resolutionPayload).toEqual(
      expect.objectContaining({
        slotLevel: 3,
        usesRecovered: 1,
        usesSpentAfter: 1,
      }),
    );
  });

  it("não aceita slot de nível 1 para recuperar uso", async () => {
    const { service, source, state, charStates } = setup();
    state.feature_uses_used["moonlight-step"] = 1;

    const result = await service.resolveInvocation(source.id, {
      featureSlug: "moonlight-step-recover",
      options: { slotLevel: 1 },
      caster: {
        spellSlots: [{ level: 1, total: 4, used: 0 }],
      },
    });

    expect(result.resolved).toBe(false);
    expect(state.feature_uses_used["moonlight-step"]).toBe(1);
    expect(charStates.save).not.toHaveBeenCalled();
    expect(result.events.at(-1)?.data?.error).toContain("nível 1");
  });
});
