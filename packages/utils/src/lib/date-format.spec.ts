import { brToIso, isoToBR, monthLabelBR } from './date-format';

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

describe('brToIso', () => {
  it('converte dd/mm/aaaa em AAAA-MM-DD', () => {
    expect(brToIso('10/12/2026')).toBe('2026-12-10');
    expect(brToIso('01/01/2027')).toBe('2027-01-01');
  });
  it('aceita 29/02 só em ano bissexto', () => {
    expect(brToIso('29/02/2028')).toBe('2028-02-29');
    expect(brToIso('29/02/2026')).toBeNull();
    expect(brToIso('29/02/2100')).toBeNull();
    expect(brToIso('29/02/2000')).toBe('2000-02-29');
  });
  it('recusa dia ou mês inexistentes', () => {
    expect(brToIso('31/04/2026')).toBeNull();
    expect(brToIso('00/05/2026')).toBeNull();
    expect(brToIso('15/13/2026')).toBeNull();
    expect(brToIso('15/00/2026')).toBeNull();
    expect(brToIso('32/01/2026')).toBeNull();
  });
  it('recusa texto fora do padrão', () => {
    expect(brToIso('')).toBeNull();
    expect(brToIso('1/2/2026')).toBeNull();
    expect(brToIso('2026-12-10')).toBeNull();
    expect(brToIso('10/12/26')).toBeNull();
    expect(brToIso('10/12/2026 ')).toBeNull();
    expect(brToIso('ab/cd/efgh')).toBeNull();
  });
  it('é o inverso de isoToBR', () => {
    expect(brToIso(isoToBR('2026-11-05'))).toBe('2026-11-05');
  });
});
