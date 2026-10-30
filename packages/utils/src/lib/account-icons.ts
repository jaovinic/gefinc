/** Chave de ícone de conta ou cartão (o catálogo completo está em `@gefinc/core-models`). */
export type AccountIconKey = string;

/**
 * Ícone padrão quando a conta não tem um escolhido: banco para pessoa física, prédio para pessoa
 * jurídica, dinheiro em espécie e cartão. Conta bancária sem titular é tratada como pessoa física.
 */
export function defaultIconFor(
  type: 'CHECKING' | 'CASH' | 'CREDIT_CARD',
  holderType?: 'PF' | 'PJ' | null,
): AccountIconKey {
  switch (type) {
    case 'CASH':
      return 'cash';
    case 'CREDIT_CARD':
      return 'card';
    default:
      return holderType === 'PJ' ? 'building' : 'bank';
  }
}
