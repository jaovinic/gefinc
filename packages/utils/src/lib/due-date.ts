/**
 * Vencimento da fatura do cartão (FR-021 e FR-022). Mesma regra do backend (`DueDateCalculator`); os dois
 * são testados com os vetores de `packages/core-models/fixtures/installments.json`. O servidor é a
 * fonte da verdade: esta versão serve à prévia na interface.
 *
 * Regras:
 * - compra até o dia de fechamento (inclusive) entra na fatura que fecha no próprio mês; depois, na do mês seguinte;
 * - se o dia de vencimento é maior que o de fechamento, a fatura vence no mês do fechamento; senão, no mês seguinte;
 * - dias 29 a 31 em meses curtos usam o último dia do mês.
 */

interface YearMonth {
  year: number;
  month: number; // 1 a 12
}

function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function format({ year, month }: YearMonth, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parse(iso: string): { ym: YearMonth; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new Error(`Data inválida: "${iso}"`);
  }
  const ym = { year: Number(match[1]), month: Number(match[2]) };
  const day = Number(match[3]);
  if (ym.month < 1 || ym.month > 12 || day < 1 || day > daysInMonth(ym)) {
    throw new Error(`Data inválida: "${iso}"`);
  }
  return { ym, day };
}

function assertDay(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`${name} deve estar entre 1 e 31: ${value}`);
  }
}

export function invoiceDueDate(purchaseDate: string, closingDay: number, dueDay: number): string {
  assertDay('Dia de fechamento', closingDay);
  assertDay('Dia de vencimento', dueDay);
  const { ym, day } = parse(purchaseDate);
  const closingInPurchaseMonth = Math.min(closingDay, daysInMonth(ym));
  const closingMonth = day <= closingInPurchaseMonth ? ym : addMonths(ym, 1);
  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);
  return format(dueMonth, Math.min(dueDay, daysInMonth(dueMonth)));
}

/**
 * Vencimento da ocorrência de um lançamento fixo no cartão: cada mês é tratado como uma compra no dia
 * da data de compra original (limitado ao último dia daquele mês).
 */
export function fixedOccurrenceDueDate(
  originalPurchaseDate: string,
  year: number,
  month: number,
  closingDay: number,
  dueDay: number,
): string {
  const { day } = parse(originalPurchaseDate);
  const ym = { year, month };
  return invoiceDueDate(format(ym, Math.min(day, daysInMonth(ym))), closingDay, dueDay);
}

/**
 * Vencimento mensal: o mês do `firstDueIso` mais `monthsAfter`, no dia `anchorDay` (limitado ao último
 * dia do mês), de modo que 31/01 → 28/02 → 31/03 preserva o dia original.
 */
export function monthlyDueDate(firstDueIso: string, monthsAfter: number, anchorDay: number): string {
  assertDay('Dia de vencimento', anchorDay);
  const { ym } = parse(firstDueIso);
  const target = addMonths(ym, monthsAfter);
  return format(target, Math.min(anchorDay, daysInMonth(target)));
}
