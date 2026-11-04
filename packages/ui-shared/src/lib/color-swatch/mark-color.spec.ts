import { MARK_DARK, MARK_LIGHT, markColor, relativeLuminance } from './mark-color';

describe('markColor', () => {
  it('escolhe o texto escuro do tema sobre cores claras e o branco sobre cores escuras', () => {
    expect(markColor('#FFFFFF')).toBe(MARK_DARK);
    expect(markColor('#F97316')).toBe(MARK_DARK);
    expect(markColor('#000000')).toBe(MARK_LIGHT);
    expect(markColor('#2563EB')).toBe(MARK_LIGHT);
  });

  it('a luminância vai de 0 (preto) a 1 (branco)', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#2563EB')).toBeGreaterThan(relativeLuminance('#1E3A8A'));
  });
});
