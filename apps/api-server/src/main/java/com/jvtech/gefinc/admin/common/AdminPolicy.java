package com.jvtech.gefinc.admin.common;

import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.UserRole;
import java.util.Optional;

/** Regras de quem pode mudar o perfil de quem. Esqueleto: a implementação vem depois dos testes. */
public final class AdminPolicy {

  public enum Action {
    GRANT_ADMIN,
    REVOKE_ADMIN
  }

  /** Pessoa envolvida na decisão; {@code active}: sem suspensão e sem exclusão pendente. */
  public record Subject(long id, UserRole role, boolean active) {}

  private AdminPolicy() {}

  public static Optional<ErrorCode> decide(
      Action action, Subject actor, Subject target, int otherActiveAdmins) {
    throw new UnsupportedOperationException("esqueleto");
  }

  public static boolean changesAdminSet(Action action, Subject target) {
    throw new UnsupportedOperationException("esqueleto");
  }
}
