import { InjectionToken } from '@angular/core';
import type { Transaction } from '@gefinc/core-models';

/**
 * Diz se um lançamento só existe no aparelho (criado sem conexão, ainda não enviado). O app móvel
 * fornece; nesses itens as ações ficam desligadas até o envio. No web nunca há itens assim.
 */
export const PENDING_MARKER = new InjectionToken<(tx: Transaction) => boolean>('PENDING_MARKER', {
  providedIn: 'root',
  factory: () => () => false,
});
