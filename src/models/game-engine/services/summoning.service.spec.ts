import { SummoningService } from './summoning.service';

/**
 * Spec 012 \u2014 SummoningService core.
 *
 * Cobertura:
 * - spawnSummon cria participant linkado (linkedCasterParticipantId) com monster slug
 * - dismissSummon remove o participant
 * - dismissAllOfCaster remove todos summons linkados em cascata
 * - getSummonsOf retorna lista correta
 * - rejeita quando caster ou monster n\u00e3o existe
 */
describe('SummoningService (spec 012)', () => {
  function makeWolfMonster() {
    return {
      id: 'monster-1',
      slug: 'wolf',
      name: 'Wolf',
      hit_points: 11,
      size: 'Medium',
      speed: { walk: '40' },
      armor_class: [{ value: 13 }],
      strength: 12,
      dexterity: 15,
      constitution: 12,
      intelligence: 3,
      wisdom: 12,
      charisma: 6,
    };
  }

  function setup(opts: {
    casterExists?: boolean;
    casterEncounterId?: string;
    monsterExists?: boolean;
    existingSummons?: Array<{ id: string }>;
  } = {}) {
    const caster = opts.casterExists === false
      ? null
      : {
          id: 'caster-1',
          encounterId: opts.casterEncounterId ?? 'enc-1',
          positionX: 5,
          positionY: 5,
        };
    const participantFindOne = jest.fn().mockResolvedValue(caster);
    const participantFind = jest.fn().mockResolvedValue(opts.existingSummons ?? []);
    const participantSave = jest.fn().mockImplementation(async (p: unknown) => ({ ...(p as object), id: 'summon-new' }));
    const participantRemove = jest.fn().mockResolvedValue(undefined);

    const monsterFindOne = jest.fn().mockResolvedValue(
      opts.monsterExists === false ? null : makeWolfMonster(),
    );

    const encounterRepo = {} as unknown as Record<string, never>;

    const svc = new SummoningService(
      { findOne: participantFindOne, find: participantFind, save: participantSave, remove: participantRemove } as any,
      { findOne: monsterFindOne } as any,
      encounterRepo as any,
    );

    return { svc, mocks: { participantFindOne, participantFind, participantSave, participantRemove, monsterFindOne } };
  }

  describe('spawnSummon', () => {
    it('cria participant linkado ao caster com monster data', async () => {
      const { svc, mocks } = setup();
      const summon = await svc.spawnSummon('enc-1', {
        casterParticipantId: 'caster-1',
        monsterSlug: 'wolf',
        source: 'summon-beast-spell',
      });

      expect(mocks.participantSave).toHaveBeenCalledTimes(1);
      expect(summon.linkedCasterParticipantId).toBe('caster-1');
      expect(summon.encounterId).toBe('enc-1');
      expect(summon.type).toBe('monster');
      expect(summon.displayName).toBe('Wolf');
      expect(summon.faction).toBe('ally');
      expect(summon.currentHp).toBe(11);
      expect(summon.maxHp).toBe(11);
      expect(summon.positionX).toBe(5);
      expect(summon.positionY).toBe(5);
    });

    it('usa posi\u00e7\u00e3o custom se passada', async () => {
      const { svc } = setup();
      const summon = await svc.spawnSummon('enc-1', {
        casterParticipantId: 'caster-1',
        monsterSlug: 'wolf',
        source: 'summon-beast-spell',
        position: { x: 10, y: 3 },
      });
      expect(summon.positionX).toBe(10);
      expect(summon.positionY).toBe(3);
    });

    it('usa displayName custom', async () => {
      const { svc } = setup();
      const summon = await svc.spawnSummon('enc-1', {
        casterParticipantId: 'caster-1',
        monsterSlug: 'wolf',
        source: 'conjure-animals-spell',
        displayName: 'Celestial Wolf',
      });
      expect(summon.displayName).toBe('Celestial Wolf');
    });

    it('rejeita quando caster n\u00e3o existe', async () => {
      const { svc } = setup({ casterExists: false });
      await expect(
        svc.spawnSummon('enc-1', {
          casterParticipantId: 'ghost',
          monsterSlug: 'wolf',
          source: 'summon-beast-spell',
        }),
      ).rejects.toThrow(/not found/);
    });

    it('rejeita quando monster n\u00e3o existe', async () => {
      const { svc } = setup({ monsterExists: false });
      await expect(
        svc.spawnSummon('enc-1', {
          casterParticipantId: 'caster-1',
          monsterSlug: 'unicorn-rainbow',
          source: 'summon-beast-spell',
        }),
      ).rejects.toThrow(/monster unicorn-rainbow/);
    });

    it('rejeita quando caster \u00e9 de outro encounter', async () => {
      const { svc } = setup({ casterEncounterId: 'enc-9' });
      await expect(
        svc.spawnSummon('enc-1', {
          casterParticipantId: 'caster-1',
          monsterSlug: 'wolf',
          source: 'summon-beast-spell',
        }),
      ).rejects.toThrow(/n\u00e3o pertence/);
    });
  });

  describe('dismissSummon', () => {
    it('remove participant quando existe e \u00e9 summon', async () => {
      const summon = { id: 'summon-1', linkedCasterParticipantId: 'caster-1' };
      const findOne = jest.fn().mockResolvedValue(summon);
      const remove = jest.fn().mockResolvedValue(undefined);
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        {} as any,
      );
      await svc.dismissSummon('summon-1', 'player-dismiss');
      expect(remove).toHaveBeenCalledWith(summon);
    });

    it('\u00e9 no-op quando summon n\u00e3o existe', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const remove = jest.fn();
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        {} as any,
      );
      await svc.dismissSummon('ghost', 'player-dismiss');
      expect(remove).not.toHaveBeenCalled();
    });

    it('\u00e9 no-op quando participant n\u00e3o \u00e9 summon (sem linkedCaster)', async () => {
      const findOne = jest.fn().mockResolvedValue({ id: 'pc', linkedCasterParticipantId: null });
      const remove = jest.fn();
      const svc = new SummoningService(
        { findOne, remove } as any,
        { findOne: jest.fn() } as any,
        {} as any,
      );
      await svc.dismissSummon('pc', 'player-dismiss');
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('dismissAllOfCaster', () => {
    it('remove todos summons do caster em cascata e retorna contagem', async () => {
      const summons = [
        { id: 's1', linkedCasterParticipantId: 'c1' },
        { id: 's2', linkedCasterParticipantId: 'c1' },
        { id: 's3', linkedCasterParticipantId: 'c1' },
      ];
      const find = jest.fn().mockResolvedValue(summons);
      const findOne = jest.fn().mockImplementation(async ({ where }) => summons.find((s) => s.id === where.id));
      const remove = jest.fn();
      const svc = new SummoningService(
        { find, findOne, remove } as any,
        { findOne: jest.fn() } as any,
        {} as any,
      );
      const n = await svc.dismissAllOfCaster('c1', 'caster-death');
      expect(n).toBe(3);
      expect(remove).toHaveBeenCalledTimes(3);
    });

    it('retorna 0 quando caster n\u00e3o tem summons', async () => {
      const svc = new SummoningService(
        { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), remove: jest.fn() } as any,
        { findOne: jest.fn() } as any,
        {} as any,
      );
      expect(await svc.dismissAllOfCaster('c1', 'caster-death')).toBe(0);
    });
  });
});
