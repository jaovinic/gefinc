import type { AccountUsage } from '@gefinc/core-models';
import { formatBRL } from '@gefinc/utils';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Motivo (em português) pelo qual a conta não pode ser excluída, sem as partes zeradas. Espelha a
 * mensagem do servidor, mas já nomeia a conta e é montado a partir da prévia (`GET /accounts/{id}/usage`).
 */
export function blockedAccountMessage(name: string, usage: AccountUsage): string {
  const parts: string[] = [];
  if (usage.transactionCount > 0) {
    parts.push(plural(usage.transactionCount, 'lançamento', 'lançamentos'));
  }
  if (usage.invoicePaymentCount > 0) {
    parts.push(plural(usage.invoicePaymentCount, 'pagamento de fatura', 'pagamentos de fatura'));
  }
  if (usage.linkedCards.length > 0) {
    const names = usage.linkedCards.map((card) => card.name).join(', ');
    parts.push(`${usage.linkedCards.length === 1 ? 'cartão vinculado' : 'cartões vinculados'} (${names})`);
  }
  const hasHistory = parts.length > 0;
  const hasOpeningBalance = Number(usage.openingBalance) !== 0;
  if (hasOpeningBalance) {
    parts.push(`saldo inicial de ${formatBRL(usage.openingBalance)}`);
  }
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  const advice = hasHistory ? 'Inative a conta para preservar o histórico.' : 'Zere o saldo inicial para poder excluir.';
  return `A conta "${name}" não pode ser excluída: possui ${list}. ${advice}`;
}
