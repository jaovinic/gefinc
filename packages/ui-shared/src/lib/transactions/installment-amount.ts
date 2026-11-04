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
 * fica na primeira parcela: "1 × R$ 33,59 + 3 × R$ 33,57". Vazio se o total não pode ser dividido.
 */
export function installmentSummary(total: string, count: number): string {
  try {
    const parts = splitMoney(total, count);
    const first = parts[0];
    const others = parts[parts.length - 1];
    if (first === others) {
      return `${count} × ${formatBRL(first)} = ${formatBRL(total)}`;
    }
    return `1 × ${formatBRL(first)} + ${count - 1} × ${formatBRL(others)}`;
  } catch {
    return '';
  }
}

/** Panorama do parcelamento para o resumo: valor da 1ª parcela e das demais (o resto fica na primeira). */
export interface InstallmentOverview {
  count: number;
  /** Valor da 1ª parcela (inclui o resto de centavos). */
  first: string;
  /** Valor de cada uma das demais parcelas (2 a count); igual a `first` quando não há resto. */
  others: string;
  /** Verdadeiro quando a 1ª parcela difere das demais (o total não divide exatamente). */
  hasRemainder: boolean;
  total: string;
}

/** Valores do parcelamento sem aritmética de ponto flutuante; `null` se o total não puder ser dividido. */
export function installmentOverview(total: string, count: number): InstallmentOverview | null {
  try {
    const parts = splitMoney(total, count);
    const first = parts[0];
    const others = parts[parts.length - 1];
    return { count, first, others, hasRemainder: first !== others, total };
  } catch {
    return null;
  }
}
