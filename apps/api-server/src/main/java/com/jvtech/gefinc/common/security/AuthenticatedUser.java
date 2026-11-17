package com.jvtech.gefinc.common.security;

import java.util.UUID;

/**
 * Principal autenticado: o identificador vem sempre do token, nunca de parâmetro da requisição. O
 * papel ({@code USER}, {@code ADMIN} ou {@code ROOT}) é o lido do banco nesta requisição, e {@code
 * sessionId} é nulo enquanto o token não carrega {@code sid}.
 */
public record AuthenticatedUser(long id, String role, UUID sessionId) {

  public AuthenticatedUser(long id) {
    this(id, "USER", null);
  }
}
