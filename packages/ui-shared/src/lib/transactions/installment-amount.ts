import { formatBRL, multiplyMoney, splitMoney, toCents } from '@gefinc/utils';

/** O valor digitado é o total da compra ou o valor de cada parcela. */
export type AmountMode = 'TOTAL' | 'INSTALLMENT';

/**
 * Total efetivo enviado ao servidor: no modo parcela, valor × quantidade (em centavos, com `bigint`);
 * no modo total, o valor como digitado. `null` quando não há valor ou a quantidade é inválida.
 */
export function effectiveTotal(amount: string | null, count: number, mode: AmountMode): string | null {
  if (!amount) {
    return null;
  }
  if (mode === 'TOTAL') {
    return amount;
  }
  try {
    return multiplyMoney(amount, count);
  } catch {
    return null;
  }
}

/** Verdadeiro quando o total não cobre ao menos R$ 0,01 por parcela. */
export function belowMinimumPerInstallment(total: string, count: number): boolean {
  return toCents(total) < BigInt(count);
}

/**
 * Resumo do parcelamento: "10 × R$ 100,00 = R$ 1.000,00"; quando o total não divide exatamente, o resto
 * fica na última parcela: "9 × R$ 33,33 + 1 × R$ 33,34". Vazio se o total não pode ser dividido.
 */
export function installmentSummary(total: string, count: number): string {
  try {
    const parts = splitMoney(total, count);
    const last = parts[parts.length - 1];
    const first = parts[0];
    if (last === first) {
      return `${count} × ${formatBRL(first)} = ${formatBRL(total)}`;
    }
    return `${count - 1} × ${formatBRL(first)} + 1 × ${formatBRL(last)}`;
  } catch {
    return '';
  }
}

/** Panorama do parcelamento para o resumo: valor da primeira e da última parcela (o resto fica na última). */
export interface InstallmentOverview {
  count: number;
  /** Valor das parcelas 1 a count-1 (e da última, quando não há resto). */
  first: string;
  last: string;
  /** Verdadeiro quando a última parcela difere das demais (o total não divide exatamente). */
  hasRemainder: boolean;
  total: string;
}

/** Valores do parcelamento sem aritmética de ponto flutuante; `null` se o total não puder ser dividido. */
export function installmentOverview(total: string, count: number): InstallmentOverview | null {
  try {
    const parts = splitMoney(total, count);
    const first = parts[0];
    const last = parts[parts.length - 1];
    return { count, first, last, hasRemainder: first !== last, total };
  } catch {
    return null;
  }
}
