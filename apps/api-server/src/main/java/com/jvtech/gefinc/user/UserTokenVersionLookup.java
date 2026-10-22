package com.jvtech.gefinc.user;

import com.jvtech.gefinc.common.security.TokenState;
import com.jvtech.gefinc.common.security.TokenVersionLookup;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Consulta, a cada requisição, a versão do token e a exclusão pendente do usuário. */
@Component
class UserTokenVersionLookup implements TokenVersionLookup {

  private final UserRepository users;

  UserTokenVersionLookup(UserRepository users) {
    this.users = users;
  }

  @Override
  public Optional<TokenState> find(long userId) {
    return users
        .findProjectedById(userId)
        .map(v -> new TokenState(v.getTokenVersion(), v.getDeletionRequestedAt() != null));
  }
}
