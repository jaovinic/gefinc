package com.jvtech.gefinc.common.security;

import java.util.Optional;

/**
 * Consulta o estado do usuário a cada requisição autenticada. É isto que permite invalidar de
 * imediato os tokens de acesso na troca de senha e no pedido de exclusão (FR-006 e FR-008).
 */
public interface TokenVersionLookup {

  Optional<TokenState> find(long userId);
}
