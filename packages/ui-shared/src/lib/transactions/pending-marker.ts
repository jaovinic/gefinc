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

/**
 * Diz se um lançamento do servidor (identificador real) tem alteração feita sem conexão e ainda não enviada
 * (valor, vencimento, pagamento). O app móvel fornece; o item segue com as ações e ganha o selo "Pendente de envio".
 */
export const PENDING_CHANGE = new InjectionToken<(tx: Transaction) => boolean>('PENDING_CHANGE', {
  providedIn: 'root',
  factory: () => () => false,
});

/**
 * O app guarda editar e excluir feitos sem conexão para enviar depois. Onde é verdadeiro (app móvel), excluir
 * sem poder consultar o impacto ainda é permitido, com aviso; no web, falta de conexão é erro.
 */
export const OFFLINE_WRITES = new InjectionToken<boolean>('OFFLINE_WRITES', {
  providedIn: 'root',
  factory: () => false,
});
