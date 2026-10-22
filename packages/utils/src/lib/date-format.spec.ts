import { isoToBR } from './date-format';

describe('isoToBR', () => {
  it('formata datas ISO no padrão brasileiro', () => {
    expect(isoToBR('2026-12-10')).toBe('10/12/2026');
  });
  it('devolve entradas fora do padrão sem alterar', () => {
    expect(isoToBR('10/12/2026')).toBe('10/12/2026');
    expect(isoToBR('')).toBe('');
  });
});
