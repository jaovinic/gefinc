/** Preferências de lembrete do usuário (hora local do aviso: 0 a 23). */
export interface ReminderPrefs {
  dueTomorrow: boolean;
  dueToday: boolean;
  overdue: boolean;
  hour: number;
}

/** Contagem de vencimentos devolvida pela API (`GET /due-summary`): só quantidades, nunca valores nem nomes. */
export interface DueSummaryInput {
  days: { date: string; items: number; invoices: number }[];
  overdue: { items: number; invoices: number };
}

export type ReminderKind = 'DUE_TOMORROW' | 'DUE_TODAY' | 'OVERDUE';

export interface ReminderPlan {
  /** Determinístico: `AAAAMMDD*10 + tipo` (1 amanhã, 2 hoje, 3 atrasado), pela data do aviso. */
  id: number;
  at: Date;
  kind: ReminderKind;
  count: number;
  title: string;
  body: string;
  /** Destino ao tocar no aviso. */
  route: string;
}

/** Dias à frente (a partir de hoje) cobertos pelos avisos. */
export const REMINDER_HORIZON_DAYS = 14;
/** Por quantos dias o resumo de atrasados se repete. */
const OVERDUE_DAYS = 7;
/** O iOS aceita 64 avisos agendados por app; ficamos bem abaixo. */
export const MAX_REMINDERS = 35;

const KIND_DIGIT: Record<ReminderKind, number> = { DUE_TOMORROW: 1, DUE_TODAY: 2, OVERDUE: 3 };

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? 'conta' : 'contas'} ${n === 1 ? one : many}`;

/**
 * Planeja os avisos locais de vencimento: "vencem amanhã" na véspera, "vencem hoje" no próprio dia e um
 * resumo diário de atrasados, no horário escolhido, para os próximos 14 dias. É uma função pura sobre as
 * datas locais do aparelho; o texto mostra só quantidade e tipo (sem valores nem nomes, pois aparece na
 * tela bloqueada).
 */
export function planReminders(summary: DueSummaryInput, prefs: ReminderPrefs, now: Date): ReminderPlan[] {
  const counts = new Map(summary.days.map((d) => [d.date, d.items + d.invoices]));
  const overdue = summary.overdue.items + summary.overdue.invoices;
  const plans: ReminderPlan[] = [];

  const add = (kind: ReminderKind, day: Date, at: Date, count: number, body: string, routeDay: Date) => {
    if (count <= 0 || at.getTime() <= now.getTime()) {
      return;
    }
    plans.push({
      id: Number(`${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}`) * 10 + KIND_DIGIT[kind],
      at,
      kind,
      count,
      title: 'GEFINC',
      body,
      route: `/lancamentos?status=PENDING&month=${iso(routeDay).slice(0, 7)}`,
    });
  };

  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prefs.hour);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);

    if (prefs.dueTomorrow) {
      const n = counts.get(iso(next)) ?? 0;
      add('DUE_TOMORROW', day, at, n, plural(n, 'vence amanhã', 'vencem amanhã'), next);
    }
    if (prefs.dueToday) {
      const n = counts.get(iso(day)) ?? 0;
      add('DUE_TODAY', day, at, n, plural(n, 'vence hoje', 'vencem hoje'), day);
    }
    if (prefs.overdue && offset < OVERDUE_DAYS) {
      add('OVERDUE', day, at, overdue, `${overdue} ${overdue === 1 ? 'conta atrasada' : 'contas atrasadas'}`, day);
    }
  }
  return plans.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}
