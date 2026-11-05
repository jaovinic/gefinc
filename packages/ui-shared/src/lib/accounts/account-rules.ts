import type { CategoryType } from '@gefinc/core-models';

/** O mínimo que as regras precisam saber de uma conta (cabe em `Account`). */
export interface RuledAccount {
  id: number;
  type: string;
  active: boolean;
}

/** Receita só entra em conta bancária ou dinheiro, nunca em cartão de crédito; despesa vai a qualquer uma. */
export function isAccountAllowed(kind: CategoryType, account: { type: string }): boolean {
  return kind === 'EXPENSE' || account.type !== 'CREDIT_CARD';
}

/** Contas que a natureza aceita, na ordem recebida. */
export function accountsFor<T extends { type: string }>(kind: CategoryType, accounts: T[]): T[] {
  return accounts.filter((account) => isAccountAllowed(kind, account));
}

/**
 * Mantém a conta escolhida quando ela vale para a natureza; senão devolve a preferida (se for válida),
 * senão a primeira conta ativa permitida, senão 0 (nenhuma).
 */
export function reconcileAccount(
  kind: CategoryType,
  accounts: RuledAccount[],
  selectedId: number,
  preferredId?: number,
): number {
  const allowed = accountsFor(kind, accounts);
  if (allowed.some((account) => account.id === selectedId)) {
    return selectedId;
  }
  const preferred = allowed.find((account) => account.id === preferredId && account.active);
  return preferred?.id ?? allowed.find((account) => account.active)?.id ?? 0;
}

/** Só conta bancária e dinheiro, ativas, participam de transferências: cartão nunca (pagar fatura é outro fluxo). */
export function canTransfer(account: { type: string; active: boolean }): boolean {
  return account.active && account.type !== 'CREDIT_CARD';
}

/** Contas elegíveis a origem ou destino de uma transferência, na ordem recebida. */
export function transferableAccounts<T extends { type: string; active: boolean }>(accounts: T[]): T[] {
  return accounts.filter(canTransfer);
}
