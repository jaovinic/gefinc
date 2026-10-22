package com.jvtech.gefinc.common.security;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Acesso ao usuário autenticado da requisição corrente. */
public final class CurrentUser {

  private CurrentUser() {}

  public static long id() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user) {
      return user.id();
    }
    throw new ApiException(ErrorCode.UNAUTHORIZED, "Autenticação necessária.");
  }
}
