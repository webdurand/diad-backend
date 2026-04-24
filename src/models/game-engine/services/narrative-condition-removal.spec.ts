import { narrativeForConditionRemoval } from './narrative-condition-removal';

describe('narrativeForConditionRemoval', () => {
  it('Unconscious + hp_restored → RAW-grounded PT-BR', () => {
    expect(narrativeForConditionRemoval('unconscious', 'hp_restored')).toBe(
      'Abre os olhos e respira fundo — consciente novamente.',
    );
  });

  it('Faerie Fire + concentration_broken → sabor do spell', () => {
    expect(
      narrativeForConditionRemoval('faerie-fire', 'concentration_broken'),
    ).toBe('O brilho prateado se dissipa; o feitiço cessa.');
  });

  it('Bless + concentration_broken → divine flavor', () => {
    expect(narrativeForConditionRemoval('bless', 'concentration_broken')).toBe(
      'A bênção divina se esvai.',
    );
  });

  it('Hex + concentration_broken', () => {
    expect(narrativeForConditionRemoval('hex', 'concentration_broken')).toBe(
      'A marca de maldição desvanece do alvo.',
    );
  });

  it('Hunter\'s Mark + concentration_broken', () => {
    expect(
      narrativeForConditionRemoval('hunters-mark', 'concentration_broken'),
    ).toBe('A marca do caçador desaparece.');
  });

  it('Hold Person + target_saved', () => {
    expect(narrativeForConditionRemoval('hold-person', 'target_saved')).toBe(
      'Rompe a paralisia com um tremor violento.',
    );
  });

  it('Charmed + source_ended', () => {
    expect(narrativeForConditionRemoval('charmed', 'source_ended')).toBe(
      'O encanto se quebra.',
    );
  });

  it('Paralyzed + target_saved', () => {
    expect(narrativeForConditionRemoval('paralyzed', 'target_saved')).toBe(
      'Vence a paralisia com esforço sobre-humano.',
    );
  });

  it('condition curada + reason não curado → fallback label PT', () => {
    expect(narrativeForConditionRemoval('unconscious', 'manual')).toBe(
      'Inconsciente termina.',
    );
  });

  it('condition não curada + reason qualquer → fallback label PT', () => {
    expect(narrativeForConditionRemoval('blinded', 'manual')).toBe(
      'Cego termina.',
    );
  });

  it('slug totalmente desconhecido → echo do slug', () => {
    expect(
      narrativeForConditionRemoval('custom-thing', 'manual'),
    ).toBe('custom-thing termina.');
  });

  it('todas remoções de Unconscious retornam non-empty', () => {
    const reasons = [
      'hp_restored',
      'concentration_broken',
      'target_saved',
      'duration_expired',
      'source_ended',
      'manual',
      'unknown',
    ];
    for (const r of reasons) {
      expect(narrativeForConditionRemoval('unconscious', r).length).toBeGreaterThan(
        5,
      );
    }
  });

  it('nunca retorna string vazia', () => {
    expect(narrativeForConditionRemoval('', '')).toBeTruthy();
    expect(narrativeForConditionRemoval('x', 'y').length).toBeGreaterThan(0);
  });
});
