import { DueSummaryInput, ReminderPrefs, planReminders } from './reminders';

const allOff: ReminderPrefs = { dueTomorrow: false, dueToday: false, overdue: false, hour: 9 };
const summary = (days: DueSummaryInput['days'] = [], overdue = { items: 0, invoices: 0 }): DueSummaryInput => ({ days, overdue });
/** Data e hora locais (como o aparelho as vê). */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('planReminders (avisos locais de vencimento)', () => {
  const now = at(2026, 11, 10, 8, 0);

  it('sem nenhum tipo ligado não há avisos', () => {
    expect(planReminders(summary([{ date: '2026-11-11', items: 2, invoices: 1 }], { items: 3, invoices: 0 }), allOff, now)).toEqual([]);
  });

  it('"vencem amanhã": aviso na véspera, no horário escolhido, somando itens e faturas', () => {
    const plan = planReminders(summary([{ date: '2026-11-11', items: 2, invoices: 1 }]), { ...allOff, dueTomorrow: true, hour: 20 }, now);

    expect(plan).toEqual([
      {
        id: 202611101,
        at: at(2026, 11, 10, 20),
        kind: 'DUE_TOMORROW',
        count: 3,
        title: 'GEFINC',
        body: '3 contas vencem amanhã',
        route: '/lancamentos?status=PENDING&month=2026-11',
      },
    ]);
  });

  it('"vencem hoje": aviso no próprio dia; se o horário de hoje já passou, só valem os dias seguintes', () => {
    const prefs = { ...allOff, dueToday: true, hour: 9 };
    const days = [
      { date: '2026-11-10', items: 1, invoices: 0 },
      { date: '2026-11-12', items: 0, invoices: 2 },
    ];

    const early = planReminders(summary(days), prefs, at(2026, 11, 10, 8, 0));
    expect(early.map((p) => [p.id, p.body])).toEqual([
      [202611102, '1 conta vence hoje'],
      [202611122, '2 contas vencem hoje'],
    ]);

    const late = planReminders(summary(days), prefs, at(2026, 11, 10, 10, 0));
    expect(late.map((p) => p.id)).toEqual([202611122]);
  });

  it('atrasados: um resumo por dia pelos próximos 7 dias, com a contagem de itens e faturas', () => {
    const plan = planReminders(summary([], { items: 2, invoices: 1 }), { ...allOff, overdue: true }, now);

    expect(plan).toHaveLength(7);
    expect(plan[0]).toMatchObject({ id: 202611103, kind: 'OVERDUE', count: 3, body: '3 contas atrasadas', at: at(2026, 11, 10, 9) });
    expect(plan[6].id).toBe(202611163);
    expect(planReminders(summary([], { items: 1, invoices: 0 }), { ...allOff, overdue: true }, now)[0].body).toBe('1 conta atrasada');
    expect(planReminders(summary([], { items: 0, invoices: 0 }), { ...allOff, overdue: true }, now)).toEqual([]);
  });

  it('atrasados: se o horário de hoje já passou, começa amanhã', () => {
    const plan = planReminders(summary([], { items: 1, invoices: 0 }), { ...allOff, overdue: true }, at(2026, 11, 10, 15, 0));

    expect(plan).toHaveLength(6);
    expect(plan[0].id).toBe(202611113);
  });

  it('virada de mês e de ano: o aviso da véspera aponta para o mês do vencimento', () => {
    const plan = planReminders(summary([{ date: '2027-01-01', items: 1, invoices: 0 }]), { ...allOff, dueTomorrow: true }, at(2026, 12, 31, 6, 0));

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ id: 202612311, route: '/lancamentos?status=PENDING&month=2027-01', at: at(2026, 12, 31, 9) });
  });

  it('ignora dias fora do horizonte de 14 dias e dias passados', () => {
    const plan = planReminders(
      summary([
        { date: '2026-11-09', items: 1, invoices: 0 },
        { date: '2026-11-23', items: 1, invoices: 0 },
        { date: '2026-11-24', items: 1, invoices: 0 },
      ]),
      { ...allOff, dueToday: true },
      now,
    );

    expect(plan.map((p) => p.id)).toEqual([202611232]);
  });

  it('nunca passa de 35 avisos (limite do iOS é 64) e vem em ordem cronológica', () => {
    const days = Array.from({ length: 16 }, (_, i) => ({ date: `2026-11-${String(10 + i).padStart(2, '0')}`, items: 1, invoices: 0 }));

    const plan = planReminders(summary(days, { items: 5, invoices: 5 }), { dueTomorrow: true, dueToday: true, overdue: true, hour: 7 }, now);

    expect(plan.length).toBeLessThanOrEqual(35);
    expect(plan.length).toBeGreaterThan(20);
    const times = plan.map((p) => p.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });

  it('o texto só tem quantidade e tipo: nunca valores, nomes ou descrições', () => {
    const plan = planReminders(summary([{ date: '2026-11-11', items: 2, invoices: 1 }], { items: 1, invoices: 1 }), { dueTomorrow: true, dueToday: true, overdue: true, hour: 9 }, now);

    for (const p of plan) {
      expect(p.body).toMatch(/^\d+ contas? (vence|vencem|atrasadas?)( amanhã| hoje)?$|^\d+ conta atrasada$/);
      expect(p.body).not.toMatch(/R\$|\d+[,.]\d{2}/);
      expect(p.title).toBe('GEFINC');
    }
  });
});
