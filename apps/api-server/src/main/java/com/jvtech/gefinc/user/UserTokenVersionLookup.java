package com.jvtech.gefinc.user;

import com.jvtech.gefinc.common.security.TokenState;
import com.jvtech.gefinc.common.security.TokenState.SessionState;
import com.jvtech.gefinc.common.security.TokenVersionLookup;
import com.jvtech.gefinc.user.UserRepository.UserAuthState;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Consulta, a cada requisição, o estado do usuário (versão do token, exclusão pendente, suspensão e
 * papel) e o da sessão, tudo em uma só consulta.
 */
@Component
class UserTokenVersionLookup implements TokenVersionLookup {

  /** Nenhuma sessão tem este id: a junção volta vazia quando o token não traz {@code sid}. */
  private static final UUID NO_SESSION = new UUID(0L, 0L);

  private final UserRepository users;
  private final Clock clock;

  UserTokenVersionLookup(UserRepository users, Clock clock) {
    this.users = users;
    this.clock = clock;
  }

  @Override
  public Optional<TokenState> find(long userId, UUID sessionId) {
    UUID sid = sessionId == null ? NO_SESSION : sessionId;
    return users.findAuthState(userId, sid, clock.instant()).map(UserTokenVersionLookup::toState);
  }

  private static TokenState toState(UserAuthState v) {
    return new TokenState(
        v.getTokenVersion(),
        v.getDeletionPending(),
        v.getSuspended(),
        v.getRole(),
        sessionState(v));
  }

  private static SessionState sessionState(UserAuthState v) {
    if (!v.getSessionFound()) {
      return SessionState.UNTRACKED;
    }
    if (v.getSessionRevoked()) {
      return SessionState.REVOKED;
    }
    return v.getSessionExpired() ? SessionState.EXPIRED : SessionState.OPEN;
  }
}
