import { invoiceDueDate, monthlyDueDate } from './due-date';
import { splitMoney } from './money';

export interface InstallmentParams {
  /** Presentes apenas para cartão de crédito. */
  closingDay?: number;
  dueDay?: number;
  purchaseDate: string;
  /** Obrigatório fora do cartão: vencimento da primeira parcela. */
  firstDueDate?: string;
  total: string;
  count: number;
}

export interface InstallmentPlan {
  number: number;
  amount: string;
  dueDate: string;
}

/**
 * Agenda de parcelas (FR-020 a FR-023), a mesma regra do backend (`InstallmentScheduler`), validada pelos
 * vetores de `packages/core-models/fixtures/installments.json`. No cartão, o vencimento vem do fechamento e
 * do vencimento da fatura; nas demais contas, as parcelas vencem mensalmente a partir da data informada.
 * O resto de centavos fica na última parcela.
 */
export function scheduleInstallments(params: InstallmentParams): InstallmentPlan[] {
  if (!Number.isInteger(params.count) || params.count < 1 || params.count > 120) {
    throw new Error(`Quantidade de parcelas inválida: ${params.count}`);
  }
  const card = params.closingDay !== undefined && params.dueDay !== undefined;
  let firstDue: string;
  let anchorDay: number;
  if (card) {
    firstDue = invoiceDueDate(params.purchaseDate, params.closingDay as number, params.dueDay as number);
    anchorDay = params.dueDay as number;
  } else {
    if (!params.firstDueDate) {
      throw new Error('Informe o vencimento da primeira parcela.');
    }
    firstDue = params.firstDueDate;
    anchorDay = Number(params.firstDueDate.slice(8, 10));
  }
  const amounts = splitMoney(params.total, params.count);
  return amounts.map((amount, index) => ({
    number: index + 1,
    amount,
    dueDate: index === 0 ? firstDue : monthlyDueDate(firstDue, index, anchorDay),
  }));
}
