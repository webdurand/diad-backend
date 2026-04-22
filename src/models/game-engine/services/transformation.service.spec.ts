import { TransformationService } from './transformation.service';

/**
 * Spec 012 \u2014 TransformationService core.
 *
 * Cobertura:
 * - enterForm: snapshota state original + popula form do monster + muda displayName
 * - revertForm: restaura displayName + limpa transformation_state
 * - applyDamageToForm: absorbed/overflow + revert em hp zero + overflow vai pro PC
 * - idempot\u00eancia: revert em participant n\u00e3o-transformado \u00e9 no-op
 */
describe('TransformationService (spec 012)', () => {
  function makeWolfMonster() {
    return {
      slug: 'wolf',
      name: 'Wolf',
      size: 'Medium',
      hit_points: 11,
      armor_class: [{ value: 13 }],
      speed: { walk: '40 ft.' },
      strength: 12,
      dexterity: 15,
      constitution: 12,
      intelligence: 3,
      wisdom: 12,
      charisma: 6,
      actions: [{ name: 'Bite', damage: '2d4+2' }],
      challenge_rating: 0.25,
    };
  }

  function setup(opts: {
    participantState?: Partial<{
      transformationState: unknown;
      characterId: string | null;
      displayName: string;
      type: 'pc' | 'monster';
    }>;
    characterState?: Partial<{ current_hp: number; temp_hp: number }> | null;
    monsterExists?: boolean;
  } = {}) {
    const participant = {
      id: 'p1',
      type: opts.participantState?.type ?? 'pc',
      characterId: opts.participantState?.characterId === undefined
        ? 'char-1'
        : opts.participantState?.characterId,
      displayName: opts.participantState?.displayName ?? 'Araxis',
      transformationState: opts.participantState?.transformationState ?? null,
      currentHp: 20,
      maxHp: 20,
      tempHp: 0,
    };
    const participantFindOne = jest.fn().mockResolvedValue({ ...participant });
    const participantSave = jest.fn().mockImplementation(async (p: unknown) => p);

    const monsterFindOne = jest.fn().mockResolvedValue(
      opts.monsterExists === false ? null : makeWolfMonster(),
    );

    const charState = opts.characterState === null
      ? null
      : { current_hp: 20, temp_hp: 0, ...(opts.characterState ?? {}) };
    const stateFindOne = jest.fn().mockResolvedValue(charState);
    const stateSave = jest.fn().mockImplementation(async (s: unknown) => s);

    const svc = new TransformationService(
      { findOne: participantFindOne, save: participantSave } as any,
      { findOne: monsterFindOne } as any,
      { findOne: stateFindOne, save: stateSave } as any,
    );

    return {
      svc,
      mocks: { participantFindOne, participantSave, monsterFindOne, stateFindOne, stateSave },
      participant,
    };
  }

  describe('enterForm', () => {
    it('snapshota original + popula form do monster + altera displayName', async () => {
      const { svc, mocks } = setup();
      const result = await svc.enterForm('p1', {
        source: 'wild-shape',
        monsterSlug: 'wolf',
        currentEncounterRound: 3,
      });

      expect(mocks.participantSave).toHaveBeenCalledTimes(1);
      expect(result.transformationState).toBeDefined();
      const state = result.transformationState!;
      expect(state.source).toBe('wild-shape');
      expect(state.form.formName).toBe('Wolf');
      expect(state.form.maxHp).toBe(11);
      expect(state.form.currentHp).toBe(11);
      expect(state.form.ac).toBe(13);
      expect(state.form.speed.walk).toBe(40);
      expect(state.form.stats.dex).toBe(15);
      expect(state.enteredAtRound).toBe(3);
      expect(state.original.currentHp).toBe(20);
      expect(state.original.displayName).toBe('Araxis');
      expect(result.displayName).toBe('Araxis (Wolf)');
    });

    it('rejeita se participant j\u00e1 transformado', async () => {
      const { svc } = setup({
        participantState: { transformationState: { foo: 'bar' } },
      });
      await expect(
        svc.enterForm('p1', { source: 'wild-shape', monsterSlug: 'wolf' }),
      ).rejects.toThrow(/ALREADY_TRANSFORMED/);
    });

    it('rejeita se monster n\u00e3o existe', async () => {
      const { svc } = setup({ monsterExists: false });
      await expect(
        svc.enterForm('p1', { source: 'wild-shape', monsterSlug: 'unicorn-mega' }),
      ).rejects.toThrow(/MONSTER_NOT_FOUND/);
    });

    it('aceita displayName custom', async () => {
      const { svc } = setup();
      const result = await svc.enterForm('p1', {
        source: 'polymorph-spell',
        monsterSlug: 'wolf',
        formDisplayName: 'Lobo Majestoso',
      });
      expect(result.displayName).toBe('Lobo Majestoso');
      expect(result.transformationState!.form.displayName).toBe('Lobo Majestoso');
    });
  });

  describe('revertForm', () => {
    it('restaura displayName original + limpa transformation_state', async () => {
      const state = {
        source: 'wild-shape',
        form: { formName: 'Wolf' },
        original: { currentHp: 20, displayName: 'Araxis', maxHp: 0, tempHp: 0 },
      };
      const { svc, mocks } = setup({
        participantState: {
          transformationState: state,
          displayName: 'Araxis (Wolf)',
        },
      });
      const result = await svc.revertForm('p1', 'player-dismiss');
      expect(result.displayName).toBe('Araxis');
      expect(result.transformationState).toBeNull();
      expect(mocks.participantSave).toHaveBeenCalledTimes(1);
    });

    it('\u00e9 idempotente quando n\u00e3o-transformado', async () => {
      const { svc, mocks } = setup();
      const result = await svc.revertForm('p1', 'player-dismiss');
      expect(result.transformationState).toBeNull();
      expect(mocks.participantSave).not.toHaveBeenCalled();
    });
  });

  describe('applyDamageToForm', () => {
    it('absorve dano parcial no form sem reverter', async () => {
      const state = {
        source: 'wild-shape',
        form: { currentHp: 11, maxHp: 11 },
        original: { currentHp: 20, displayName: 'Araxis' },
        revertTriggers: { hpZero: true, durationEnd: true, playerDismiss: true, concentrationBroken: false },
      };
      const { svc, mocks } = setup({
        participantState: { transformationState: state },
      });
      const r = await svc.applyDamageToForm('p1', 5);
      expect(r.absorbedByForm).toBe(5);
      expect(r.overflowToOriginal).toBe(0);
      expect(r.reverted).toBe(false);
      expect(mocks.stateSave).not.toHaveBeenCalled();
    });

    it('reverte quando form chega a 0 + aplica overflow no HP original', async () => {
      const state = {
        source: 'wild-shape',
        form: { currentHp: 5, maxHp: 11, formName: 'Wolf' },
        original: { currentHp: 20, displayName: 'Araxis' },
        revertTriggers: { hpZero: true, durationEnd: true, playerDismiss: true, concentrationBroken: false },
      };
      const { svc, mocks } = setup({
        participantState: { transformationState: state },
      });
      const r = await svc.applyDamageToForm('p1', 12);
      expect(r.absorbedByForm).toBe(5);
      expect(r.overflowToOriginal).toBe(7);
      expect(r.reverted).toBe(true);
      // stateSave chamado pra aplicar o overflow no char state
      expect(mocks.stateSave).toHaveBeenCalledTimes(1);
      const savedState = mocks.stateSave.mock.calls[0][0];
      expect(savedState.current_hp).toBe(20 - 7);
    });

    it('n\u00e3o reverte se revertTriggers.hpZero=false', async () => {
      const state = {
        source: 'custom',
        form: { currentHp: 3, maxHp: 10, formName: 'X' },
        original: { currentHp: 20, displayName: 'Araxis' },
        revertTriggers: { hpZero: false, durationEnd: true, playerDismiss: true, concentrationBroken: false },
      };
      const { svc } = setup({
        participantState: { transformationState: state },
      });
      const r = await svc.applyDamageToForm('p1', 10);
      expect(r.reverted).toBe(false);
      expect(r.absorbedByForm).toBe(3);
      expect(r.overflowToOriginal).toBe(7);
    });

    it('retorna zero quando participant n\u00e3o transformado (overflow = amount)', async () => {
      const { svc } = setup();
      const r = await svc.applyDamageToForm('p1', 8);
      expect(r.absorbedByForm).toBe(0);
      expect(r.overflowToOriginal).toBe(8);
      expect(r.reverted).toBe(false);
    });
  });

  describe('helpers', () => {
    it('getEffectiveSpeed retorna speed do form ou null', () => {
      const { svc } = setup();
      expect(svc.getEffectiveSpeed({} as any)).toBeNull();
      expect(
        svc.getEffectiveSpeed({ transformationState: { form: { speed: { walk: 40 } } } } as any),
      ).toEqual({ walk: 40 });
    });

    it('getEffectiveActions retorna actions do form ou null', () => {
      const { svc } = setup();
      expect(svc.getEffectiveActions({} as any)).toBeNull();
      expect(
        svc.getEffectiveActions({
          transformationState: { form: { actions: [{ name: 'Bite' }] } },
        } as any),
      ).toEqual([{ name: 'Bite' }]);
    });

    it('isTransformed retorna boolean baseado em transformationState', () => {
      const { svc } = setup();
      expect(svc.isTransformed({ transformationState: null } as any)).toBe(false);
      expect(
        svc.isTransformed({ transformationState: { source: 'x' } } as any),
      ).toBe(true);
    });
  });
});
