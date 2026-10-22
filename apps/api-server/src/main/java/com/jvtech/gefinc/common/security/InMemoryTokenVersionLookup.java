package com.jvtech.gefinc.common.security;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Implementação provisória da fase de fundação: aceita qualquer usuário na versão 0. Será
 * substituída pelo adaptador sobre o repositório de usuários na história de acesso (US1).
 */
public class InMemoryTokenVersionLookup implements TokenVersionLookup {

  private final Map<Long, TokenState> states = new ConcurrentHashMap<>();

  public void set(long userId, TokenState state) {
    states.put(userId, state);
  }

  @Override
  public Optional<TokenState> find(long userId) {
    return Optional.of(states.getOrDefault(userId, new TokenState(0, false)));
  }
}
