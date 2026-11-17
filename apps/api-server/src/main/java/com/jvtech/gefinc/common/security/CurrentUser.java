package com.jvtech.gefinc.common.security;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Acesso ao usuário autenticado da requisição corrente. */
public final class CurrentUser {

  private CurrentUser() {}

  public static long id() {
    return principal().id();
  }

  /** Papel do usuário nesta requisição ({@code USER}, {@code ADMIN} ou {@code ROOT}), do banco. */
  public static String role() {
    return principal().role();
  }

  /** Sessão do token da requisição; nulo enquanto o token não carrega {@code sid}. */
  public static UUID sessionId() {
    return principal().sessionId();
  }

  private static AuthenticatedUser principal() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
      return user;
    }
    throw new ApiException(ErrorCode.UNAUTHORIZED, "Autenticação necessária.");
  }
}
