import type { Transfer } from '@gefinc/core-models';

/**
 * Texto da transferência na lista. Filtrando por uma conta, o rótulo conta o que aconteceu com ela
 * ("Transferência para X" quando ela é a origem, "Transferência de X" quando é o destino); sem filtro,
 * "X para Y".
 */
export function transferLabel(transfer: Pick<Transfer, 'fromAccountId' | 'toAccountId'>, filterAccountId: number, nameOf: (id: number) => string): string {
  if (filterAccountId !== 0 && transfer.fromAccountId === filterAccountId) {
    return `Transferência para ${nameOf(transfer.toAccountId)}`;
  }
  if (filterAccountId !== 0 && transfer.toAccountId === filterAccountId) {
    return `Transferência de ${nameOf(transfer.fromAccountId)}`;
  }
  return `${nameOf(transfer.fromAccountId)} para ${nameOf(transfer.toAccountId)}`;
}
