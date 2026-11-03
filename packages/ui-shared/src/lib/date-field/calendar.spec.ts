import { addDays, addMonths, daysInMonth, monthWeeks, parseIso, weekdayOf } from './calendar';

describe('calendar', () => {
  it('parseIso aceita só datas reais', () => {
    expect(parseIso('2026-11-05')).toEqual({ year: 2026, month: 11, day: 5 });
    expect(parseIso('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseIso('2026-02-29')).toBeNull();
    expect(parseIso('2026-13-01')).toBeNull();
    expect(parseIso('')).toBeNull();
    expect(parseIso('05/11/2026')).toBeNull();
  });

  it('daysInMonth respeita o ano bissexto', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('weekdayOf devolve 0 para domingo', () => {
    expect(weekdayOf('2026-11-01')).toBe(0); // domingo
    expect(weekdayOf('2026-11-05')).toBe(4); // quinta
  });

  it('addDays cruza mês e ano', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-05', 7)).toBe('2026-11-12');
  });

  it('addMonths mantém o dia e, quando não existe, usa o último do mês', () => {
    expect(addMonths('2026-11-05', 1)).toBe('2026-12-05');
    expect(addMonths('2026-12-05', 1)).toBe('2027-01-05');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('monthWeeks monta semanas de domingo a sábado, com vazios fora do mês', () => {
    const weeks = monthWeeks(2026, 11); // 1º de novembro de 2026 é domingo; 30 é segunda
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe('2026-11-01');
    expect(weeks).toHaveLength(5);
    expect(weeks[4].slice(0, 2)).toEqual(['2026-11-29', '2026-11-30']);
    expect(weeks[4].slice(2)).toEqual([null, null, null, null, null]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);

    const feb = monthWeeks(2026, 2); // 1º de fevereiro de 2026 é domingo: 4 semanas exatas
    expect(feb).toHaveLength(4);
    const oct = monthWeeks(2026, 10); // 1º de outubro é quinta
    expect(oct[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
  });
});
