import { deriveOriginType } from 'src/shared/aoe-origin';

describe('deriveOriginType', () => {
  it('retorna "self" para magia "Self (15-foot cone)" com area cone (Burning Hands)', () => {
    const result = deriveOriginType({
      range: 'Self (15-foot cone)',
      area_of_effect: { type: 'cone', size: 15 },
    });
    expect(result).toBe('self');
  });

  it('retorna "self" para magia "Self (15-foot cube)" com area cube (Thunderwave)', () => {
    const result = deriveOriginType({
      range: 'Self (15-foot cube)',
      area_of_effect: { type: 'cube', size: 15 },
    });
    expect(result).toBe('self');
  });

  it('retorna "self" para magia "Self (100-foot line)" com area line (Lightning Bolt)', () => {
    const result = deriveOriginType({
      range: 'Self (100-foot line)',
      area_of_effect: { type: 'line', size: 100 },
    });
    expect(result).toBe('self');
  });

  it('retorna "point" para magia com alcance numerico e area sphere (Fireball)', () => {
    const result = deriveOriginType({
      range: '150 feet',
      area_of_effect: { type: 'sphere', size: 20 },
    });
    expect(result).toBe('point');
  });

  it('retorna "point" para magia com alcance numerico e area cube (Web)', () => {
    const result = deriveOriginType({
      range: '60 feet',
      area_of_effect: { type: 'cube', size: 20 },
    });
    expect(result).toBe('point');
  });

  it('retorna "self" para magia com range "Self" e area sphere (aura generica)', () => {
    const result = deriveOriginType({
      range: 'Self',
      area_of_effect: { type: 'sphere', size: 10 },
    });
    expect(result).toBe('self');
  });

  it('retorna null para magia sem area_of_effect (nao e AoE)', () => {
    const result = deriveOriginType({
      range: '60 feet',
      area_of_effect: null,
    });
    expect(result).toBeNull();
  });

  it('retorna "point" para magia de toque com area (raro mas existe)', () => {
    const result = deriveOriginType({
      range: 'Touch',
      area_of_effect: { type: 'sphere', size: 5 },
    });
    expect(result).toBe('point');
  });

  it('retorna "self" para action de monstro com range "Self (30-foot cone)" (Fire Breath) [US4]', () => {
    const result = deriveOriginType({
      range: 'Self (30-foot cone)',
      area_of_effect: { type: 'cone', size: 30 },
    });
    expect(result).toBe('self');
  });
});
