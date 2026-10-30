import { isoToBR, monthLabelBR } from './date-format';

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

describe('monthLabelBR', () => {
  it('abrevia o mês a partir de data ou de mês ISO', () => {
    expect(monthLabelBR('2026-11-17')).toBe('nov/2026');
    expect(monthLabelBR('2027-01')).toBe('jan/2027');
    expect(monthLabelBR('2027-09-15')).toBe('set/2027');
  });
  it('cobre os doze meses', () => {
    const labels = Array.from({ length: 12 }, (_, i) => monthLabelBR(`2026-${String(i + 1).padStart(2, '0')}`));
    expect(labels.join(' ')).toBe(
      'jan/2026 fev/2026 mar/2026 abr/2026 mai/2026 jun/2026 jul/2026 ago/2026 set/2026 out/2026 nov/2026 dez/2026',
    );
  });
  it('devolve entradas fora do padrão sem alterar', () => {
    expect(monthLabelBR('')).toBe('');
    expect(monthLabelBR('2026-13-01')).toBe('2026-13-01');
    expect(monthLabelBR('17/11/2026')).toBe('17/11/2026');
  });
});
