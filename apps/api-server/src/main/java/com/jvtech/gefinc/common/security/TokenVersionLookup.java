package com.jvtech.gefinc.common.security;

import java.util.Optional;
import java.util.UUID;

/**
 * Consulta o estado do usuário a cada requisição autenticada. É isto que permite invalidar de
 * imediato os tokens de acesso na troca de senha e no pedido de exclusão (FR-006 e FR-008) e ler o
 * papel do banco, nunca do token.
 */
public interface TokenVersionLookup {

  /** {@code sessionId} nulo: token sem sessão registrada. */
  Optional<TokenState> find(long userId, UUID sessionId);

  default Optional<TokenState> find(long userId) {
    return find(userId, null);
  }
}
