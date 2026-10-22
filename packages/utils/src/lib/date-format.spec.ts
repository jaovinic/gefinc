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

import { currentMonth, todayIso } from './date-format';

describe('todayIso e currentMonth', () => {
  it('usam a data local, não a UTC', () => {
    const lateNight = new Date(2026, 10, 30, 23, 30); // 30/11/2026 23:30 local
    expect(todayIso(lateNight)).toBe('2026-11-30');
    expect(currentMonth(lateNight)).toBe('2026-11');
  });
});
